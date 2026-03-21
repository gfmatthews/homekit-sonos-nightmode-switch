import { SonosNightModeDevice } from '../src/sonosDevice';

// Mock the sonos package
jest.mock('sonos', () => {
  const mockGetEQ = jest.fn();
  const mockSetEQ = jest.fn();
  const mockDeviceDescription = jest.fn();

  const mockRenderingControlService = jest.fn(() => ({
    GetEQ: mockGetEQ,
    SetEQ: mockSetEQ,
  }));

  class MockSonos {
    host: string;
    port: number;
    constructor(host: string, port?: number) {
      this.host = host;
      this.port = port ?? 1400;
    }
    renderingControlService = mockRenderingControlService;
    deviceDescription = mockDeviceDescription;
  }

  return {
    Sonos: MockSonos,
    __mockGetEQ: mockGetEQ,
    __mockSetEQ: mockSetEQ,
    __mockDeviceDescription: mockDeviceDescription,
    __mockRenderingControlService: mockRenderingControlService,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sonosMocks = require('sonos') as {
  __mockGetEQ: jest.Mock;
  __mockSetEQ: jest.Mock;
  __mockDeviceDescription: jest.Mock;
};

describe('SonosNightModeDevice', () => {
  let device: SonosNightModeDevice;

  beforeEach(() => {
    jest.clearAllMocks();
    device = new SonosNightModeDevice('192.168.1.100');
  });

  describe('getNightMode', () => {
    it('should return true when night mode is enabled', async () => {
      sonosMocks.__mockGetEQ.mockResolvedValue({ CurrentValue: '1' });
      const result = await device.getNightMode();
      expect(result).toBe(true);
      expect(sonosMocks.__mockGetEQ).toHaveBeenCalledWith({
        InstanceID: 0,
        EQType: 'NightMode',
      });
    });

    it('should return false when night mode is disabled', async () => {
      sonosMocks.__mockGetEQ.mockResolvedValue({ CurrentValue: '0' });
      const result = await device.getNightMode();
      expect(result).toBe(false);
    });

    it('should throw when device is unreachable', async () => {
      sonosMocks.__mockGetEQ.mockRejectedValue(new Error('EHOSTUNREACH'));
      await expect(device.getNightMode()).rejects.toThrow('EHOSTUNREACH');
    });
  });

  describe('setNightMode', () => {
    it('should enable night mode', async () => {
      sonosMocks.__mockSetEQ.mockResolvedValue(undefined);
      await device.setNightMode(true);
      expect(sonosMocks.__mockSetEQ).toHaveBeenCalledWith({
        InstanceID: 0,
        EQType: 'NightMode',
        DesiredValue: 1,
      });
    });

    it('should disable night mode', async () => {
      sonosMocks.__mockSetEQ.mockResolvedValue(undefined);
      await device.setNightMode(false);
      expect(sonosMocks.__mockSetEQ).toHaveBeenCalledWith({
        InstanceID: 0,
        EQType: 'NightMode',
        DesiredValue: 0,
      });
    });
  });

  describe('getSpeechEnhancement', () => {
    it('should return true when speech enhancement is enabled', async () => {
      sonosMocks.__mockGetEQ.mockResolvedValue({ CurrentValue: '1' });
      const result = await device.getSpeechEnhancement();
      expect(result).toBe(true);
      expect(sonosMocks.__mockGetEQ).toHaveBeenCalledWith({
        InstanceID: 0,
        EQType: 'DialogLevel',
      });
    });

    it('should return false when speech enhancement is disabled', async () => {
      sonosMocks.__mockGetEQ.mockResolvedValue({ CurrentValue: '0' });
      const result = await device.getSpeechEnhancement();
      expect(result).toBe(false);
    });
  });

  describe('setSpeechEnhancement', () => {
    it('should enable speech enhancement', async () => {
      sonosMocks.__mockSetEQ.mockResolvedValue(undefined);
      await device.setSpeechEnhancement(true);
      expect(sonosMocks.__mockSetEQ).toHaveBeenCalledWith({
        InstanceID: 0,
        EQType: 'DialogLevel',
        DesiredValue: 1,
      });
    });

    it('should disable speech enhancement', async () => {
      sonosMocks.__mockSetEQ.mockResolvedValue(undefined);
      await device.setSpeechEnhancement(false);
      expect(sonosMocks.__mockSetEQ).toHaveBeenCalledWith({
        InstanceID: 0,
        EQType: 'DialogLevel',
        DesiredValue: 0,
      });
    });
  });

  describe('getDeviceInfo', () => {
    it('should return device info from description', async () => {
      sonosMocks.__mockDeviceDescription.mockResolvedValue({
        roomName: 'Living Room',
      });
      const info = await device.getDeviceInfo();
      expect(info).toEqual({
        name: 'Living Room',
        ip: '192.168.1.100',
      });
    });

    it('should fall back to host when roomName is unavailable', async () => {
      sonosMocks.__mockDeviceDescription.mockResolvedValue({});
      const info = await device.getDeviceInfo();
      expect(info).toEqual({
        name: '192.168.1.100',
        ip: '192.168.1.100',
      });
    });
  });
});
