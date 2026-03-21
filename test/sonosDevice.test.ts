import http from 'http';
import { EventEmitter } from 'events';
import { SonosNightModeDevice } from '../src/sonosDevice';

// Mock the sonos package (used only for deviceDescription + discovery)
jest.mock('sonos', () => {
  const mockDeviceDescription = jest.fn();

  class MockSonos {
    host: string;
    port: number;
    constructor(host: string, port?: number) {
      this.host = host;
      this.port = port ?? 1400;
    }
    deviceDescription = mockDeviceDescription;
  }

  return {
    Sonos: MockSonos,
    __mockDeviceDescription: mockDeviceDescription,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sonosMocks = require('sonos') as {
  __mockDeviceDescription: jest.Mock;
};

// Mock http.request for SOAP calls
jest.mock('http', () => {
  const original = jest.requireActual('http');
  return {
    ...original,
    request: jest.fn(),
  };
});

const mockHttpRequest = http.request as jest.Mock;

function setupHttpMock(statusCode: number, responseBody: string) {
  const responseEmitter = new EventEmitter();
  const requestEmitter = Object.assign(new EventEmitter(), {
    write: jest.fn(),
    end: jest.fn(),
  });

  mockHttpRequest.mockImplementation((_opts: unknown, cb: (res: EventEmitter & { statusCode: number }) => void) => {
    const res = Object.assign(responseEmitter, { statusCode });
    process.nextTick(() => {
      cb(res);
      res.emit('data', responseBody);
      res.emit('end');
    });
    return requestEmitter;
  });
}

function soapOkResponse(currentValue: string): string {
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:GetEQResponse>' +
    `<CurrentValue>${currentValue}</CurrentValue>` +
    '</u:GetEQResponse></s:Body></s:Envelope>';
}

function soapSetOkResponse(): string {
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:SetEQResponse></u:SetEQResponse></s:Body></s:Envelope>';
}

function soap803Error(): string {
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><s:Fault><faultcode>s:Client</faultcode>' +
    '<detail><UPnPError><errorCode>803</errorCode></UPnPError></detail>' +
    '</s:Fault></s:Body></s:Envelope>';
}

describe('SonosNightModeDevice', () => {
  let device: SonosNightModeDevice;

  beforeEach(() => {
    jest.clearAllMocks();
    device = new SonosNightModeDevice('192.168.1.100');
  });

  describe('getNightMode', () => {
    it('should return true when night mode is enabled', async () => {
      setupHttpMock(200, soapOkResponse('1'));
      const result = await device.getNightMode();
      expect(result).toBe(true);
    });

    it('should return false when night mode is disabled', async () => {
      setupHttpMock(200, soapOkResponse('0'));
      const result = await device.getNightMode();
      expect(result).toBe(false);
    });

    it('should throw when device returns error', async () => {
      setupHttpMock(500, soap803Error());
      await expect(device.getNightMode()).rejects.toThrow('SOAP GetEQ failed (500)');
    });
  });

  describe('setNightMode', () => {
    it('should enable night mode', async () => {
      setupHttpMock(200, soapSetOkResponse());
      await device.setNightMode(true);
      expect(mockHttpRequest).toHaveBeenCalled();
      const callBody = mockHttpRequest.mock.calls[0][0];
      expect(callBody.hostname).toBe('192.168.1.100');
    });

    it('should disable night mode', async () => {
      setupHttpMock(200, soapSetOkResponse());
      await device.setNightMode(false);
      expect(mockHttpRequest).toHaveBeenCalled();
    });
  });

  describe('getSpeechEnhancement', () => {
    it('should return true when speech enhancement is enabled', async () => {
      setupHttpMock(200, soapOkResponse('1'));
      const result = await device.getSpeechEnhancement();
      expect(result).toBe(true);
    });

    it('should return false when speech enhancement is disabled', async () => {
      setupHttpMock(200, soapOkResponse('0'));
      const result = await device.getSpeechEnhancement();
      expect(result).toBe(false);
    });
  });

  describe('setSpeechEnhancement', () => {
    it('should enable speech enhancement', async () => {
      setupHttpMock(200, soapSetOkResponse());
      await device.setSpeechEnhancement(true);
      expect(mockHttpRequest).toHaveBeenCalled();
    });

    it('should disable speech enhancement', async () => {
      setupHttpMock(200, soapSetOkResponse());
      await device.setSpeechEnhancement(false);
      expect(mockHttpRequest).toHaveBeenCalled();
    });
  });

  describe('getDeviceInfo', () => {
    it('should return device info with support flags', async () => {
      sonosMocks.__mockDeviceDescription.mockResolvedValue({
        roomName: 'Living Room',
        modelDescription: 'Sonos Arc',
      });
      // supportsEQ calls getNightMode + getSpeechEnhancement internally
      setupHttpMock(200, soapOkResponse('0'));
      const info = await device.getDeviceInfo();
      expect(info.name).toBe('Living Room');
      expect(info.ip).toBe('192.168.1.100');
      expect(info.model).toBe('Sonos Arc');
      expect(info.supportsNightMode).toBe(true);
      expect(info.supportsSpeechEnhancement).toBe(true);
    });

    it('should report unsupported when device returns 803', async () => {
      sonosMocks.__mockDeviceDescription.mockResolvedValue({
        roomName: 'Kitchen',
        modelDescription: 'Sonos One',
      });
      setupHttpMock(500, soap803Error());
      const info = await device.getDeviceInfo();
      expect(info.name).toBe('Kitchen');
      expect(info.supportsNightMode).toBe(false);
      expect(info.supportsSpeechEnhancement).toBe(false);
    });

    it('should fall back to host when roomName is unavailable', async () => {
      sonosMocks.__mockDeviceDescription.mockResolvedValue({});
      setupHttpMock(500, soap803Error());
      const info = await device.getDeviceInfo();
      expect(info.name).toBe('192.168.1.100');
      expect(info.ip).toBe('192.168.1.100');
    });
  });
});
