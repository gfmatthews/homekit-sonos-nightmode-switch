/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'sonos' {
  export class Sonos {
    host: string;
    port: number;
    constructor(host: string, port?: number);
    renderingControlService(): RenderingControlService;
    deviceDescription(): Promise<Record<string, any>>;
    getName(): Promise<string>;
    getZoneAttrs(): Promise<Record<string, any>>;
  }

  interface EQGetInput {
    InstanceID: number;
    EQType: string;
  }

  interface EQSetInput {
    InstanceID: number;
    EQType: string;
    DesiredValue: number;
  }

  interface EQGetResult {
    CurrentValue: string;
  }

  interface RenderingControlService {
    GetEQ(input: EQGetInput): Promise<EQGetResult>;
    SetEQ(input: EQSetInput): Promise<void>;
  }

  export class AsyncDeviceDiscovery {
    discover(options?: { timeout?: number }): Promise<Sonos>;
    discoverMultiple(options?: { timeout?: number }): Promise<Sonos[]>;
  }
}
