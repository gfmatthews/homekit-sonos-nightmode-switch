import { SonosSoundFeaturesPlatform } from '../src/platform';
import { API, Logging, PlatformConfig, PlatformAccessory } from 'homebridge';

// Mock sonosDiscovery module
jest.mock('../src/sonosDiscovery', () => ({
  discoverDevices: jest.fn(),
  createDevicesFromConfig: jest.fn(),
  scanSubnet: jest.fn(),
}));

// Mock platformAccessory to avoid real HomeKit service setup
jest.mock('../src/platformAccessory', () => ({
  SonosSoundFeaturesAccessory: jest.fn(),
}));

// Mock sonosDevice
jest.mock('../src/sonosDevice', () => ({
  SonosNightModeDevice: jest.fn().mockImplementation((host: string) => ({
    host,
    updateHost: jest.fn(function (this: { host: string }, newHost: string) { this.host = newHost; }),
    getNightMode: jest.fn(),
    setNightMode: jest.fn(),
    getSpeechEnhancement: jest.fn(),
    setSpeechEnhancement: jest.fn(),
    getDeviceInfo: jest.fn(),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const discoveryMocks = require('../src/sonosDiscovery') as {
  discoverDevices: jest.Mock;
  createDevicesFromConfig: jest.Mock;
  scanSubnet: jest.Mock;
};

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
    jest.clearAllMocks();
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

  it('should use serial-number-based UUID when available', async () => {
    const mockDevice = {
      host: '192.168.1.100',
      getDeviceInfo: jest.fn().mockResolvedValue({
        name: 'Living Room',
        ip: '192.168.1.100',
        model: 'Sonos Arc',
        serialNumber: 'RINCON_001',
        supportsNightMode: true,
        supportsSpeechEnhancement: true,
      }),
    };
    discoveryMocks.discoverDevices.mockResolvedValue([{
      info: { name: '192.168.1.100', ip: '192.168.1.100' },
      device: mockDevice,
    }]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const platform = new SonosSoundFeaturesPlatform(log, config, api);
    api.__fire('didFinishLaunching');

    // Wait for async discover
    await new Promise((r) => setTimeout(r, 50));

    expect(api.registerPlatformAccessories).toHaveBeenCalled();
    const registeredAccessory = (api.registerPlatformAccessories as jest.Mock).mock.calls[0][2][0];
    expect(registeredAccessory.UUID).toBe('uuid-RINCON_001');
  });

  it('should not remove stale cached accessories on startup', async () => {
    // Pre-cache an accessory that won't be rediscovered
    const platform = new SonosSoundFeaturesPlatform(log, config, api);
    const staleAccessory = {
      displayName: 'Old Sonos',
      UUID: 'uuid-RINCON_OLD',
      context: {
        device: {
          name: 'Old Sonos',
          ip: '192.168.1.50',
          serialNumber: 'RINCON_OLD',
          supportsNightMode: true,
          supportsSpeechEnhancement: false,
        },
      },
    } as unknown as PlatformAccessory;
    platform.configureAccessory(staleAccessory);

    discoveryMocks.discoverDevices.mockResolvedValue([]);

    api.__fire('didFinishLaunching');
    await new Promise((r) => setTimeout(r, 50));

    // Should NOT unregister the stale accessory
    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    // Should log a warning about keeping it
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found during discovery'),
    );
  });

  it('should set discoveryMethod to ssdp by default', async () => {
    discoveryMocks.discoverDevices.mockResolvedValue([]);
    const platform = new SonosSoundFeaturesPlatform(log, config, api);
    api.__fire('didFinishLaunching');
    await new Promise((r) => setTimeout(r, 50));
    expect(platform.discoveryMethod).toBe('ssdp');
  });

  it('should set discoveryMethod to manual when devices configured', async () => {
    config.devices = [{ ip: '192.168.1.100' }];
    discoveryMocks.createDevicesFromConfig.mockReturnValue([{
      info: { name: '192.168.1.100', ip: '192.168.1.100' },
      device: {
        host: '192.168.1.100',
        getDeviceInfo: jest.fn().mockResolvedValue({
          name: 'Soundbar', ip: '192.168.1.100',
          supportsNightMode: false, supportsSpeechEnhancement: false,
        }),
      },
    }]);
    const platform = new SonosSoundFeaturesPlatform(log, config, api);
    api.__fire('didFinishLaunching');
    await new Promise((r) => setTimeout(r, 50));
    expect(platform.discoveryMethod).toBe('manual');
  });

  describe('rediscoverDevice', () => {
    it('should return null for manual discovery method', async () => {
      config.devices = [{ ip: '192.168.1.100' }];
      discoveryMocks.createDevicesFromConfig.mockReturnValue([]);
      const platform = new SonosSoundFeaturesPlatform(log, config, api);
      api.__fire('didFinishLaunching');
      await new Promise((r) => setTimeout(r, 50));

      const result = await platform.rediscoverDevice('RINCON_001');
      expect(result).toBeNull();
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('manually configured'));
    });

    it('should return new IP when device is found at a different address', async () => {
      discoveryMocks.discoverDevices.mockResolvedValue([]);
      const platform = new SonosSoundFeaturesPlatform(log, config, api);
      api.__fire('didFinishLaunching');
      await new Promise((r) => setTimeout(r, 50));

      // Now mock a successful rediscovery
      discoveryMocks.discoverDevices.mockResolvedValue([{
        info: { name: '192.168.1.200', ip: '192.168.1.200' },
        device: {
          host: '192.168.1.200',
          getDeviceInfo: jest.fn().mockResolvedValue({
            name: 'Living Room',
            ip: '192.168.1.200',
            serialNumber: 'RINCON_001',
            supportsNightMode: true,
            supportsSpeechEnhancement: true,
          }),
        },
      }]);

      const result = await platform.rediscoverDevice('RINCON_001');
      expect(result).toBe('192.168.1.200');
    });

    it('should return null when device is not found', async () => {
      discoveryMocks.discoverDevices.mockResolvedValue([]);
      const platform = new SonosSoundFeaturesPlatform(log, config, api);
      api.__fire('didFinishLaunching');
      await new Promise((r) => setTimeout(r, 50));

      const result = await platform.rediscoverDevice('RINCON_NOTFOUND');
      expect(result).toBeNull();
    });

    it('should respect cooldown between attempts', async () => {
      discoveryMocks.discoverDevices.mockResolvedValue([]);
      config.rediscoveryCooldown = 60;
      const platform = new SonosSoundFeaturesPlatform(log, config, api);
      api.__fire('didFinishLaunching');
      await new Promise((r) => setTimeout(r, 50));

      // First attempt
      await platform.rediscoverDevice('RINCON_001');

      // Second attempt within cooldown — should skip discovery
      discoveryMocks.discoverDevices.mockClear();
      const result = await platform.rediscoverDevice('RINCON_001');
      expect(result).toBeNull();
      // discoverDevices should NOT have been called for the second attempt
      expect(discoveryMocks.discoverDevices).not.toHaveBeenCalled();
    });
  });


  it('should register the didFinishLaunching listener', () => {
    const onSpy = jest.spyOn(api, 'on');
    new SonosSoundFeaturesPlatform(log, config, api);
    expect(onSpy).toHaveBeenCalledWith('didFinishLaunching', expect.any(Function));
  });
});
