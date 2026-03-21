import { PlatformAccessory, CharacteristicValue, Service } from 'homebridge';
import { SonosSoundFeaturesPlatform } from './platform';
import { SonosNightModeDevice, DeviceInfo } from './sonosDevice';

export class SonosSoundFeaturesAccessory {
  private nightModeService?: Service;
  private speechEnhancementService?: Service;

  constructor(
    private readonly platform: SonosSoundFeaturesPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: SonosNightModeDevice,
    info: DeviceInfo,
  ) {
    // Accessory Information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Sonos')
      .setCharacteristic(this.platform.Characteristic.Model, info.model ?? 'Soundbar')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.host);

    // Night Mode switch (only on supported devices)
    if (info.supportsNightMode) {
      this.nightModeService =
        this.accessory.getService('Night Mode') ??
        this.accessory.addService(this.platform.Service.Switch, 'Night Mode', 'nightmode');

      this.nightModeService
        .setCharacteristic(this.platform.Characteristic.Name, 'Night Mode')
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Night Mode');

      this.nightModeService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(this.getNightMode.bind(this))
        .onSet(this.setNightMode.bind(this));
    }

    // Speech Enhancement switch (only on supported devices)
    if (info.supportsSpeechEnhancement) {
      this.speechEnhancementService =
        this.accessory.getService('Speech Enhancement') ??
        this.accessory.addService(this.platform.Service.Switch, 'Speech Enhancement', 'speechenhancement');

      this.speechEnhancementService
        .setCharacteristic(this.platform.Characteristic.Name, 'Speech Enhancement')
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Speech Enhancement');

      this.speechEnhancementService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(this.getSpeechEnhancement.bind(this))
        .onSet(this.setSpeechEnhancement.bind(this));
    }
  }

  async getNightMode(): Promise<CharacteristicValue> {
    try {
      const value = await this.device.getNightMode();
      this.platform.log.debug('Get Night Mode ->', value);
      return value;
    } catch (err) {
      this.platform.log.error('Failed to get Night Mode:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async setNightMode(value: CharacteristicValue): Promise<void> {
    try {
      await this.device.setNightMode(value as boolean);
      this.platform.log.debug('Set Night Mode ->', value);
    } catch (err) {
      this.platform.log.error('Failed to set Night Mode:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async getSpeechEnhancement(): Promise<CharacteristicValue> {
    try {
      const value = await this.device.getSpeechEnhancement();
      this.platform.log.debug('Get Speech Enhancement ->', value);
      return value;
    } catch (err) {
      this.platform.log.error('Failed to get Speech Enhancement:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async setSpeechEnhancement(value: CharacteristicValue): Promise<void> {
    try {
      await this.device.setSpeechEnhancement(value as boolean);
      this.platform.log.debug('Set Speech Enhancement ->', value);
    } catch (err) {
      this.platform.log.error('Failed to set Speech Enhancement:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }
}
