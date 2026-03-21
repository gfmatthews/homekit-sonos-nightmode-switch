import express from 'express';
import path from 'path';
import { SonosNightModeDevice } from '../src/sonosDevice';
import { discoverDevices } from '../src/sonosDiscovery';

const app = express();
const PORT = 3000;

app.use(express.json());

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

// Get device status
app.get('/api/device/:ip/status', async (req, res) => {
  try {
    const device = new SonosNightModeDevice(req.params.ip);
    const [nightMode, speechEnhancement, info] = await Promise.all([
      device.getNightMode(),
      device.getSpeechEnhancement(),
      device.getDeviceInfo(),
    ]);
    res.json({ ...info, nightMode, speechEnhancement });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Toggle night mode
app.post('/api/device/:ip/nightmode', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Debug UI running at http://localhost:${PORT}`);
});
