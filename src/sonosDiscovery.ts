import { AsyncDeviceDiscovery } from 'sonos';
import { SonosNightModeDevice, DeviceInfo } from './sonosDevice';

export interface DiscoveredDevice {
  info: DeviceInfo;
  device: SonosNightModeDevice;
}

/**
 * Discover Sonos devices on the local network.
 * Returns SonosNightModeDevice wrappers for each found device.
 */
export async function discoverDevices(timeoutMs = 5000): Promise<DiscoveredDevice[]> {
  const discovery = new AsyncDeviceDiscovery();
  const sonosDevice = await discovery.discover({ timeout: timeoutMs });

  // discover() returns one device; use discoverMultiple for all
  const allDevices = await discovery.discoverMultiple({ timeout: timeoutMs });
  const devices: (typeof sonosDevice)[] = allDevices ?? [sonosDevice];

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
