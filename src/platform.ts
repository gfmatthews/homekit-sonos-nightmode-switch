import {
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
import { discoverDevices, createDevicesFromConfig, DiscoveredDevice } from './sonosDiscovery';

export class SonosSoundFeaturesPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  private readonly cachedAccessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching — discovering devices');
      this.discoverAndRegisterDevices();
    });
  }

  /**
   * Called by Homebridge for each cached accessory restored from disk.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.cachedAccessories.push(accessory);
  }

  private async discoverAndRegisterDevices(): Promise<void> {
    let discovered: DiscoveredDevice[];

    const configDevices = this.config.devices as Array<{ name?: string; ip: string }> | undefined;
    if (configDevices && configDevices.length > 0) {
      this.log.info(`Using ${configDevices.length} manually configured device(s)`);
      discovered = createDevicesFromConfig(configDevices);
    } else {
      const timeout = ((this.config.discoveryTimeout as number) ?? 5) * 1000;
      this.log.info(`Discovering Sonos devices (timeout: ${timeout}ms)...`);
      try {
        discovered = await discoverDevices(timeout);
      } catch (err) {
        this.log.error('Device discovery failed:', (err as Error).message);
        return;
      }
    }

    this.log.info(`Found ${discovered.length} device(s)`);

    for (const d of discovered) {
      // Fetch full device info including feature support
      try {
        d.info = await d.device.getDeviceInfo();
      } catch (err) {
        this.log.warn(`Could not get info for ${d.info.ip}:`, (err as Error).message);
      }

      if (!d.info.supportsNightMode && !d.info.supportsSpeechEnhancement) {
        this.log.info(`Skipping ${d.info.name} (${d.info.model ?? d.info.ip}) — no supported sound features`);
        continue;
      }

      const uuid = this.api.hap.uuid.generate(d.info.ip);
      const existingAccessory = this.cachedAccessories.find((a) => a.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory:', existingAccessory.displayName);
        existingAccessory.context.device = d.info;
        this.api.updatePlatformAccessories([existingAccessory]);
        new SonosSoundFeaturesAccessory(this, existingAccessory, d.device, d.info);
      } else {
        this.log.info('Adding new accessory:', d.info.name);
        const accessory = new this.api.platformAccessory(d.info.name, uuid);
        accessory.context.device = d.info;
        new SonosSoundFeaturesAccessory(this, accessory, d.device, d.info);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove stale cached accessories that were not rediscovered
    const discoveredUUIDs = new Set(discovered.map((d) => this.api.hap.uuid.generate(d.info.ip)));
    const staleAccessories = this.cachedAccessories.filter((a) => !discoveredUUIDs.has(a.UUID));
    if (staleAccessories.length > 0) {
      this.log.info(`Removing ${staleAccessories.length} stale accessory(ies)`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
    }
  }
}
