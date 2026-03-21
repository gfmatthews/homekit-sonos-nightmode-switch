import { Sonos } from 'sonos';

export interface DeviceInfo {
  name: string;
  ip: string;
}

/**
 * Core wrapper around a Sonos device that provides get/set for
 * Night Mode and Speech Enhancement (Dialog Mode).
 *
 * This module is shared between the Homebridge plugin and the web debug UI.
 */
export class SonosNightModeDevice {
  private readonly device: Sonos;
  public readonly host: string;

  constructor(host: string, port = 1400) {
    this.host = host;
    this.device = new Sonos(host, port);
  }

  async getNightMode(): Promise<boolean> {
    const rc = this.device.renderingControlService();
    const result = await rc.GetEQ({
      InstanceID: 0,
      EQType: 'NightMode',
    });
    return Number(result.CurrentValue) === 1;
  }

  async setNightMode(enabled: boolean): Promise<void> {
    const rc = this.device.renderingControlService();
    await rc.SetEQ({
      InstanceID: 0,
      EQType: 'NightMode',
      DesiredValue: enabled ? 1 : 0,
    });
  }

  async getSpeechEnhancement(): Promise<boolean> {
    const rc = this.device.renderingControlService();
    const result = await rc.GetEQ({
      InstanceID: 0,
      EQType: 'DialogLevel',
    });
    return Number(result.CurrentValue) === 1;
  }

  async setSpeechEnhancement(enabled: boolean): Promise<void> {
    const rc = this.device.renderingControlService();
    await rc.SetEQ({
      InstanceID: 0,
      EQType: 'DialogLevel',
      DesiredValue: enabled ? 1 : 0,
    });
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const desc = await this.device.deviceDescription();
    return {
      name: desc.roomName as string ?? this.host,
      ip: this.host,
    };
  }

  /** Expose the underlying Sonos instance for advanced usage. */
  getSonosDevice(): Sonos {
    return this.device;
  }
}
