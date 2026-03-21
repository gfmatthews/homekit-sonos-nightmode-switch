import net from 'net';
import { AsyncDeviceDiscovery } from 'sonos';
import { SonosNightModeDevice, DeviceInfo } from './sonosDevice';

export interface DiscoveredDevice {
  info: DeviceInfo;
  device: SonosNightModeDevice;
}

/**
 * Discover Sonos devices on the local network via SSDP multicast.
 * Returns an empty array (instead of throwing) when no devices respond.
 */
export async function discoverDevices(timeoutMs = 5000): Promise<DiscoveredDevice[]> {
  const discovery = new AsyncDeviceDiscovery();
  let devices;
  try {
    devices = await discovery.discoverMultiple({ timeout: timeoutMs });
  } catch {
    // SSDP found nothing (common in containers / restricted networks)
    return [];
  }

  const results: DiscoveredDevice[] = [];
  for (const dev of devices) {
    const host = dev.host;
    const wrapper = new SonosNightModeDevice(host);
    try {
      const info = await wrapper.getDeviceInfo();
      results.push({ info, device: wrapper });
    } catch {
      // Device responded to discovery but couldn't fetch info — skip it
      results.push({
        info: { name: host, ip: host },
        device: wrapper,
      });
    }
  }

  return results;
}

/**
 * Create device wrappers from a static list of IPs (skip network discovery).
 */
export function createDevicesFromConfig(
  devices: Array<{ name?: string; ip: string }>,
): DiscoveredDevice[] {
  return devices.map((d) => {
    const wrapper = new SonosNightModeDevice(d.ip);
    return {
      info: { name: d.name ?? d.ip, ip: d.ip },
      device: wrapper,
    };
  });
}

/**
 * Scan a subnet for Sonos devices by attempting a TCP connection to port 1400.
 * Useful when SSDP multicast is unavailable (e.g. inside containers).
 *
 * @param subnet - base address like "192.168.1" (the /24 prefix)
 * @param startHost - first host octet to scan (default 1)
 * @param endHost   - last host octet to scan (default 254)
 * @param timeoutMs - per-host TCP connect timeout (default 300ms)
 */
export async function scanSubnet(
  subnet: string,
  startHost = 1,
  endHost = 254,
  timeoutMs = 300,
): Promise<DiscoveredDevice[]> {
  const ips: string[] = [];
  for (let i = startHost; i <= endHost; i++) {
    ips.push(`${subnet}.${i}`);
  }

  // Probe all IPs in parallel with a short TCP timeout
  const reachable = await Promise.all(
    ips.map((ip) => probePort(ip, 1400, timeoutMs).then((ok) => (ok ? ip : null))),
  );

  const liveIps = reachable.filter((ip): ip is string => ip !== null);

  // For each reachable IP, try to get device info
  const results: DiscoveredDevice[] = [];
  await Promise.all(
    liveIps.map(async (ip) => {
      const wrapper = new SonosNightModeDevice(ip);
      try {
        const info = await wrapper.getDeviceInfo();
        results.push({ info, device: wrapper });
      } catch {
        // Reachable on 1400 but not a Sonos device — skip
      }
    }),
  );

  return results;
}

function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}
