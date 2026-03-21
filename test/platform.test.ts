import { SonosSoundFeaturesPlatform } from '../src/platform';
import { API, Logging, PlatformConfig, PlatformAccessory } from 'homebridge';

// Minimal mocks — we only test config handling and accessory caching
function createMockAPI(): API {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    hap: {
      uuid: {
        generate: (input: string) => `uuid-${input}`,
      },
      Service: {
        Switch: 'Switch',
        AccessoryInformation: 'AccessoryInformation',
      },
      Characteristic: {
        On: 'On',
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
        Name: 'Name',
      },
      HapStatusError: class HapStatusError extends Error {
        constructor(public hapStatus: number) { super(`HAP Status ${hapStatus}`); }
      },
      HAPStatus: {
        SERVICE_COMMUNICATION_FAILURE: -70402,
      },
    },
    on: (event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    },
    platformAccessory: class MockPlatformAccessory {
      displayName: string;
      UUID: string;
      context: Record<string, unknown> = {};
      constructor(name: string, uuid: string) {
        this.displayName = name;
        this.UUID = uuid;
      }
    },
    registerPlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
    updatePlatformAccessories: jest.fn(),
    // helper to fire events in tests
    __fire: (event: string) => listeners[event]?.forEach((cb) => cb()),
  } as unknown as API & { __fire: (event: string) => void };
}

function createMockLog(): Logging {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    prefix: 'test',
    success: jest.fn(),
  } as unknown as Logging;
}

describe('SonosSoundFeaturesPlatform', () => {
  let api: API & { __fire: (event: string) => void };
  let log: Logging;
  let config: PlatformConfig;

  beforeEach(() => {
    api = createMockAPI() as API & { __fire: (event: string) => void };
    log = createMockLog();
    config = {
      platform: 'SonosSoundFeatures',
      name: 'Sonos Sound Features',
    } as PlatformConfig;
  });

  it('should instantiate without errors', () => {
    const platform = new SonosSoundFeaturesPlatform(log, config, api);
    expect(platform).toBeDefined();
    expect(log.debug).toHaveBeenCalledWith(
      'Finished initializing platform:',
      'Sonos Sound Features',
    );
  });

  it('should cache accessories via configureAccessory', () => {
    const platform = new SonosSoundFeaturesPlatform(log, config, api);
    const mockAccessory = {
      displayName: 'Test Sonos',
      UUID: 'uuid-test',
      context: {},
    } as unknown as PlatformAccessory;

    platform.configureAccessory(mockAccessory);
    expect(log.info).toHaveBeenCalledWith(
      'Loading accessory from cache:',
      'Test Sonos',
    );
  });

  it('should register the didFinishLaunching listener', () => {
    const onSpy = jest.spyOn(api, 'on');
    new SonosSoundFeaturesPlatform(log, config, api);
    expect(onSpy).toHaveBeenCalledWith('didFinishLaunching', expect.any(Function));
  });
});
