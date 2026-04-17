import express from 'express';
import path from 'path';
import { SonosNightModeDevice } from '../src/sonosDevice';
import { discoverDevices, scanSubnet } from '../src/sonosDiscovery';

const app = express();
const PORT = 3000;
// Bind to loopback only — this is a local debug UI, never expose to a network.
const HOST = process.env.DEBUG_UI_HOST ?? '127.0.0.1';

// Limit body size to mitigate DoS via large JSON payloads.
app.use(express.json({ limit: '16kb' }));

// IPv4 dotted-quad validator to prevent SSRF via arbitrary hostnames in path params.
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
function isValidIPv4(ip: string): boolean {
  return typeof ip === 'string' && IPV4_RE.test(ip);
}

// Serve the debug UI
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Discover Sonos devices on the network
app.get('/api/discover', async (_req, res) => {
  try {
    const devices = await discoverDevices(5000);
    res.json(devices.map((d) => d.info));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Scan a subnet for Sonos devices (TCP fallback when SSDP is unavailable)
app.get('/api/scan', async (req, res) => {
  const subnet = req.query.subnet as string | undefined;
  const subnetRe = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){2}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
  if (!subnet || !subnetRe.test(subnet)) {
    res.status(400).json({ error: 'Provide ?subnet=192.168.1 (first three octets)' });
    return;
  }
  try {
    const devices = await scanSubnet(subnet);
    res.json(devices.map((d) => d.info));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get device status
app.get('/api/device/:ip/status', async (req, res) => {
  if (!isValidIPv4(req.params.ip)) {
    res.status(400).json({ error: 'Invalid IPv4 address' });
    return;
  }
  try {
    const device = new SonosNightModeDevice(req.params.ip);
    const info = await device.getDeviceInfo();
    const result: Record<string, unknown> = { ...info };
    if (info.supportsNightMode) {
      result.nightMode = await device.getNightMode();
    }
    if (info.supportsSpeechEnhancement) {
      result.speechEnhancement = await device.getSpeechEnhancement();
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Toggle night mode
app.post('/api/device/:ip/nightmode', async (req, res) => {
  if (!isValidIPv4(req.params.ip)) {
    res.status(400).json({ error: 'Invalid IPv4 address' });
    return;
  }
  try {
    const enabled = req.body.enabled as boolean;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const device = new SonosNightModeDevice(req.params.ip);
    await device.setNightMode(enabled);
    res.json({ nightMode: enabled });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Toggle speech enhancement
app.post('/api/device/:ip/speechenhancement', async (req, res) => {
  if (!isValidIPv4(req.params.ip)) {
    res.status(400).json({ error: 'Invalid IPv4 address' });
    return;
  }
  try {
    const enabled = req.body.enabled as boolean;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const device = new SonosNightModeDevice(req.params.ip);
    await device.setSpeechEnhancement(enabled);
    res.json({ speechEnhancement: enabled });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Debug UI running at http://${HOST}:${PORT}`);
});
