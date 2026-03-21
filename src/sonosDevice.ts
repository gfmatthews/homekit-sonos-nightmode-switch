import http from 'http';
import { Sonos } from 'sonos';

export interface DeviceInfo {
  name: string;
  ip: string;
  model?: string;
  serialNumber?: string;
  supportsNightMode?: boolean;
  supportsSpeechEnhancement?: boolean;
}

// Sonos EQ actions (NightMode, DialogLevel) use a Sonos-proprietary SOAP
// namespace that the `sonos` npm package doesn't support, so we make direct
// SOAP/HTTP calls for those while still using the library for discovery and
// device descriptions.

const DEFAULT_SOAP_TIMEOUT_MS = 5000;

function soapRequest(
  host: string,
  port: number,
  action: string,
  body: string,
  timeoutMs = DEFAULT_SOAP_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
      's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      '<s:Body>' + body + '</s:Body></s:Envelope>';

    const req = http.request(
      {
        hostname: host,
        port,
        path: '/MediaRenderer/RenderingControl/Control',
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'Content-Length': Buffer.byteLength(postData),
          SOAPAction: `"urn:schemas-upnp-org:service:RenderingControl:1#${action}"`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`SOAP ${action} failed (${res.statusCode}): ${data}`));
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`SOAP ${action} timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function extractTagValue(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : undefined;
}

/**
 * Core wrapper around a Sonos device that provides get/set for
 * Night Mode and Speech Enhancement (Dialog Mode).
 *
 * This module is shared between the Homebridge plugin and the web debug UI.
 */
export class SonosNightModeDevice {
  private device: Sonos;
  public host: string;
  private readonly port: number;

  constructor(host: string, port = 1400) {
    this.host = host;
    this.port = port;
    this.device = new Sonos(host, port);
  }

  /** Update the device IP address (e.g. after DHCP lease change). */
  updateHost(newHost: string): void {
    this.host = newHost;
    this.device = new Sonos(newHost, this.port);
  }

  private async getEQ(eqType: string): Promise<boolean> {
    const body =
      '<u:GetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">' +
      '<InstanceID>0</InstanceID>' +
      `<EQType>${eqType}</EQType>` +
      '</u:GetEQ>';
    const xml = await soapRequest(this.host, this.port, 'GetEQ', body);
    return extractTagValue(xml, 'CurrentValue') === '1';
  }

  /** Returns true if the given EQ feature is supported (false on non-soundbar devices). */
  private async supportsEQ(eqType: string): Promise<boolean> {
    try {
      await this.getEQ(eqType);
      return true;
    } catch {
      return false;
    }
  }

  private async setEQ(eqType: string, value: boolean): Promise<void> {
    const body =
      '<u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">' +
      '<InstanceID>0</InstanceID>' +
      `<EQType>${eqType}</EQType>` +
      `<DesiredValue>${value ? 1 : 0}</DesiredValue>` +
      '</u:SetEQ>';
    await soapRequest(this.host, this.port, 'SetEQ', body);
  }

  async getNightMode(): Promise<boolean> {
    return this.getEQ('NightMode');
  }

  async setNightMode(enabled: boolean): Promise<void> {
    await this.setEQ('NightMode', enabled);
  }

  async getSpeechEnhancement(): Promise<boolean> {
    return this.getEQ('DialogLevel');
  }

  async setSpeechEnhancement(enabled: boolean): Promise<void> {
    await this.setEQ('DialogLevel', enabled);
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const desc = await this.device.deviceDescription();
    const [nightMode, speechEnh] = await Promise.all([
      this.supportsEQ('NightMode'),
      this.supportsEQ('DialogLevel'),
    ]);
    return {
      name: desc.roomName as string ?? this.host,
      ip: this.host,
      model: desc.modelDescription as string ?? desc.modelName as string,
      serialNumber: desc.serialNum as string | undefined,
      supportsNightMode: nightMode,
      supportsSpeechEnhancement: speechEnh,
    };
  }

  /** Expose the underlying Sonos instance for advanced usage. */
  getSonosDevice(): Sonos {
    return this.device;
  }
}
