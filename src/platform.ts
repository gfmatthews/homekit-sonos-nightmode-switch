import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SonosSoundFeaturesAccessory } from './platformAccessory';
import { discoverDevices, createDevicesFromConfig, scanSubnet, DiscoveredDevice } from './sonosDiscovery';
import { SonosNightModeDevice, DeviceInfo } from './sonosDevice';

export type DiscoveryMethod = 'manual' | 'ssdp' | 'subnet';

const DEFAULT_REDISCOVERY_COOLDOWN_MS = 60_000;

export class SonosSoundFeaturesPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly cachedAccessories: PlatformAccessory[] = [];
  public discoveryMethod: DiscoveryMethod = 'ssdp';
  private subnetConfig?: { subnet: string; timeout: number };
  private ssdpTimeout = 5000;
  private readonly rediscoveryCooldownMs: number;
  private readonly lastRediscoveryAttempt = new Map<string, number>();
  private readonly activeAccessories: SonosSoundFeaturesAccessory[] = [];
  private readonly pollIntervalMs: number;
  private pollTimer?: NodeJS.Timeout;
  private shuttingDown = false;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.rediscoveryCooldownMs =
      ((config.rediscoveryCooldown as number | undefined) ?? 60) * 1000;
    const pollInterval = config.pollInterval ?? 30;
    if (typeof pollInterval === 'number' && Number.isInteger(pollInterval) &&
        (pollInterval === 0 || (pollInterval >= 10 && pollInterval <= 3600))) {
      this.pollIntervalMs = pollInterval * 1000;
    } else {
      this.log.warn('Invalid pollInterval; using 30 seconds (expected 0 or an integer from 10 to 3600).');
      this.pollIntervalMs = 30_000;
    }

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching — discovering devices');
      void this.discoverAndRegisterDevices()
        .then(() => this.schedulePoll())
        .catch((err) => this.log.error('Platform startup failed:', String(err)));
    });

    this.api.on('shutdown', () => {
      this.shuttingDown = true;
      clearTimeout(this.pollTimer);
      for (const accessory of this.activeAccessories) {
        accessory.dispose();
      }
    });
  }

  private schedulePoll(): void {
    if (this.shuttingDown || this.pollIntervalMs === 0 || this.activeAccessories.length === 0) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      void this.pollAccessories()
        .catch((err) => this.log.debug('State refresh failed:', String(err)))
        .finally(() => this.schedulePoll());
    }, this.pollIntervalMs);
    this.pollTimer.unref();
  }

  private async pollAccessories(): Promise<void> {
    // One device at a time, and schedule only after completion to avoid overlapping scans.
    for (const accessory of this.activeAccessories) {
      if (this.shuttingDown) {
        return;
      }
      await accessory.refreshState();
    }
  }

  /**
   * Called by Homebridge for each cached accessory restored from disk.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.cachedAccessories.push(accessory);
  }

  /**
   * Generate a stable UUID for a device. Prefers serial number (survives IP changes)
   * with fallback to IP for devices where serial is unavailable.
   */
  private deviceUUID(info: DeviceInfo): string {
    const seed = info.serialNumber ?? info.ip;
    return this.api.hap.uuid.generate(seed);
  }

  private async discoverAndRegisterDevices(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    let discovered: DiscoveredDevice[];

    const configDevices = this.config.devices as Array<{ name?: string; ip: string }> | undefined;
    if (configDevices && configDevices.length > 0) {
      this.log.info(`Using ${configDevices.length} manually configured device(s)`);
      this.discoveryMethod = 'manual';
      discovered = createDevicesFromConfig(configDevices);
    } else if (this.config.autoDiscovery?.subnet) {
      const subnet = this.config.autoDiscovery.subnet as string;
      const timeout = ((this.config.autoDiscovery.timeout as number) ?? (this.config.discoveryTimeout as number) ?? 5) * 1000;
      this.discoveryMethod = 'subnet';
      this.subnetConfig = { subnet, timeout };
      this.log.info(`Scanning subnet ${subnet}.0/24 for Sonos devices (timeout: ${timeout}ms)...`);
      try {
        discovered = await scanSubnet(subnet, 1, 254, timeout);
      } catch (err) {
        this.log.error('Subnet scan failed:', (err as Error).message);
        discovered = [];
      }
    } else {
      const timeout = ((this.config.discoveryTimeout as number) ?? 5) * 1000;
      this.discoveryMethod = 'ssdp';
      this.ssdpTimeout = timeout;
      this.log.info(`Discovering Sonos devices via SSDP (timeout: ${timeout}ms)...`);
      try {
        discovered = await discoverDevices(timeout);
      } catch (err) {
        this.log.error('Device discovery failed:', (err as Error).message);
        discovered = [];
      }
    }

    if (this.shuttingDown) {
      return;
    }
    this.log.info(`Found ${discovered.length} device(s)`);

    const matchedUUIDs = new Set<string>();

    for (const d of discovered) {
      // Fetch full device info including feature support
      try {
        d.info = await d.device.getDeviceInfo();
      } catch (err) {
        this.log.warn(`Could not get info for ${d.info.ip}:`, (err as Error).message);
      }
      if (this.shuttingDown) {
        return;
      }

      if (!d.info.supportsNightMode && !d.info.supportsSpeechEnhancement) {
        this.log.info(`Skipping ${d.info.name} (${d.info.model ?? d.info.ip}) — no supported sound features`);
        continue;
      }

      const uuid = this.deviceUUID(d.info);
      matchedUUIDs.add(uuid);
      const existingAccessory = this.cachedAccessories.find((a) => a.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory:', existingAccessory.displayName);
        existingAccessory.context.device = d.info;
        this.api.updatePlatformAccessories([existingAccessory]);
        this.activeAccessories.push(new SonosSoundFeaturesAccessory(this, existingAccessory, d.device, d.info));
      } else {
        this.log.info('Adding new accessory:', d.info.name);
        const accessory = new this.api.platformAccessory(d.info.name, uuid);
        accessory.context.device = d.info;
        this.activeAccessories.push(new SonosSoundFeaturesAccessory(this, accessory, d.device, d.info));
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Keep undiscovered cached accessories alive so HomeKit automations don't break.
    // Wire them up with last-known IP so on-failure rediscovery can find them again.
    for (const accessory of this.cachedAccessories) {
      if (matchedUUIDs.has(accessory.UUID)) {
        continue;
      }
      const cachedInfo = accessory.context.device as DeviceInfo | undefined;
      if (!cachedInfo?.ip) {
        this.log.warn(`Removing orphan accessory with no cached device info: ${accessory.displayName}`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        continue;
      }
      this.log.warn(
        `Device "${accessory.displayName}" not found during discovery — keeping accessory with last-known IP ${cachedInfo.ip}. ` +
        'Will attempt re-discovery on next communication failure.',
      );
      const device = new SonosNightModeDevice(cachedInfo.ip);
      this.activeAccessories.push(new SonosSoundFeaturesAccessory(this, accessory, device, cachedInfo));
    }
  }

  /**
   * Attempt to re-discover a device by its serial number after a communication failure.
   * Returns the new IP if found, or null. Respects a per-device cooldown to avoid
   * hammering the network after repeated failures.
   */
  async rediscoverDevice(serialNumber: string): Promise<string | null> {
    if (this.shuttingDown) {
      return null;
    }
    if (this.discoveryMethod === 'manual') {
      this.log.warn(
        `Cannot auto-rediscover device ${serialNumber} — using manually configured IPs. ` +
        'Update the IP in your Homebridge config.',
      );
      return null;
    }

    const now = Date.now();
    const lastAttempt = this.lastRediscoveryAttempt.get(serialNumber) ?? 0;
    const cooldown = this.rediscoveryCooldownMs || DEFAULT_REDISCOVERY_COOLDOWN_MS;
    if (now - lastAttempt < cooldown) {
      this.log.debug(
        `Skipping re-discovery for ${serialNumber} — cooldown (${Math.round((cooldown - (now - lastAttempt)) / 1000)}s remaining)`,
      );
      return null;
    }
    this.lastRediscoveryAttempt.set(serialNumber, now);

    this.log.info(`Re-discovering device ${serialNumber}...`);

    let discovered: DiscoveredDevice[];
    try {
      if (this.discoveryMethod === 'subnet' && this.subnetConfig) {
        discovered = await scanSubnet(
          this.subnetConfig.subnet, 1, 254, this.subnetConfig.timeout,
        );
      } else {
        discovered = await discoverDevices(this.ssdpTimeout);
      }
    } catch (err) {
      this.log.error('Re-discovery scan failed:', (err as Error).message);
      return null;
    }

    // Fetch full info for discovered devices and match by serial
    for (const d of discovered) {
      if (this.shuttingDown) {
        return null;
      }
      try {
        d.info = await d.device.getDeviceInfo();
      } catch {
        continue;
      }
      if (!this.shuttingDown && d.info.serialNumber === serialNumber) {
        this.log.info(`Re-discovered device ${serialNumber} at new IP ${d.info.ip}`);
        return d.info.ip;
      }
    }

    this.log.warn(`Re-discovery did not find device ${serialNumber}`);
    return null;
  }
}
