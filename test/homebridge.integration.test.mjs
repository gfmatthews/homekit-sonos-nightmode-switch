import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { SonosSoundFeaturesPlatform } from '../dist/platform.js';
import { SonosSoundFeaturesAccessory } from '../dist/platformAccessory.js';
import { SonosNightModeDevice } from '../dist/sonosDevice.js';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
// Use the selected Homebridge version's real accessory and HAP classes.
const homebridgeDir = dirname(require.resolve('homebridge'));
const { PlatformAccessory } = await import(pathToFileURL(join(homebridgeDir, 'platformAccessory.js')).href);
const homebridgeRequire = createRequire(join(homebridgeDir, 'index.js'));
const homebridgePackage = homebridgeRequire('../package.json');
const hap = homebridgeRequire(homebridgePackage.dependencies['@homebridge/hap-nodejs'] ? '@homebridge/hap-nodejs' : 'hap-nodejs');

const deviceInfo = {
  name: 'Living Room',
  ip: '192.168.1.100',
  model: 'Sonos Arc',
  serialNumber: 'RINCON_001',
  supportsNightMode: true,
  supportsSpeechEnhancement: true,
};

describe('real Homebridge integration', () => {
  let api;
  let log;
  let platform;
  let device;
  let accessory;
  let handler;
  let getNightMode;
  let getSpeechEnhancement;
  let setNightMode;
  let setSpeechEnhancement;

  beforeEach(() => {
    jest.useFakeTimers();
    api = Object.assign(new EventEmitter(), {
      hap,
      platformAccessory: PlatformAccessory,
      registerPlatformAccessories: jest.fn(),
      updatePlatformAccessories: jest.fn(),
      unregisterPlatformAccessories: jest.fn(),
      signalFinished() { this.emit('didFinishLaunching'); },
      signalShutdown() { this.emit('shutdown'); },
    });
    log = Object.fromEntries(['info', 'warn', 'error', 'debug'].map((level) => [level, jest.fn()]));
    getNightMode = jest.spyOn(SonosNightModeDevice.prototype, 'getNightMode').mockResolvedValue(false);
    getSpeechEnhancement = jest.spyOn(SonosNightModeDevice.prototype, 'getSpeechEnhancement').mockResolvedValue(false);
    setNightMode = jest.spyOn(SonosNightModeDevice.prototype, 'setNightMode').mockResolvedValue();
    setSpeechEnhancement = jest.spyOn(SonosNightModeDevice.prototype, 'setSpeechEnhancement').mockResolvedValue();
    jest.spyOn(SonosNightModeDevice.prototype, 'getDeviceInfo').mockImplementation(async function () {
      return { ...deviceInfo, ip: this.host };
    });
  });

  afterEach(() => {
    api.signalShutdown();
    handler?.dispose();
    handler = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function createAccessory(info = deviceInfo) {
    platform = new SonosSoundFeaturesPlatform(log, { platform: 'SonosSoundFeatures', pollInterval: 0 }, api);
    device = new SonosNightModeDevice(info.ip);
    accessory = new api.platformAccessory(info.name, api.hap.uuid.generate(info.serialNumber));
    accessory._associatedPlugin = 'homebridge-sonos-soundfeatures';
    accessory._associatedPlatform = 'SonosSoundFeatures';
    accessory.context.device = { ...info };
    handler = new SonosSoundFeaturesAccessory(platform, accessory, device, { ...info });
  }

  function on(subtype) {
    return accessory.getServiceById(api.hap.Service.Switch, subtype).getCharacteristic(api.hap.Characteristic.On);
  }

  async function launch(config = {}, cachedAccessory) {
    const register = jest.spyOn(api, 'registerPlatformAccessories');
    platform = new SonosSoundFeaturesPlatform(log, {
      platform: 'SonosSoundFeatures',
      devices: [{ ip: deviceInfo.ip }],
      pollInterval: 10,
      ...config,
    }, api);
    if (cachedAccessory) {
      platform.configureAccessory(cachedAccessory);
    }
    api.signalFinished();
    await jest.advanceTimersByTimeAsync(0);
    accessory = cachedAccessory ?? register.mock.calls[0]?.[2][0];
    return register;
  }

  it('loads and registers the built package through the real Homebridge API in a native Node process', () => {
    // The production ESM loader must run outside Jest's module resolver.
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { once } from 'node:events';
      const require = createRequire(import.meta.url);
      const { HomebridgeAPI } = await import(${JSON.stringify(pathToFileURL(join(homebridgeDir, 'api.js')).href)});
      const { Plugin } = await import(${JSON.stringify(pathToFileURL(join(homebridgeDir, 'plugin.js')).href)});
      const { SonosNightModeDevice } = require('./dist/sonosDevice.js');
      const info = ${JSON.stringify(deviceInfo)};
      SonosNightModeDevice.prototype.getDeviceInfo = async () => info;
      SonosNightModeDevice.prototype.getNightMode = async () => true;
      SonosNightModeDevice.prototype.getSpeechEnhancement = async () => false;
      const api = new HomebridgeAPI();
      const pkg = require('./package.json');
      const plugin = new Plugin(pkg.name, process.cwd(), pkg);
      const registration = once(api, 'registerPlatform');
      await plugin.load();
      await plugin.initialize(api);
      const [name, Platform] = await registration;
      assert.equal(name, 'SonosSoundFeatures');
      const log = Object.fromEntries(['info', 'warn', 'debug', 'error'].map(key => [key, () => {}]));
      new Platform(log, { platform: name, devices: [{ ip: info.ip }], pollInterval: 0 }, api);
      const registered = once(api, 'registerPlatformAccessories');
      api.signalFinished();
      const [[accessory]] = await registered;
      assert.equal(accessory.UUID, api.hap.uuid.generate(info.serialNumber));
      const night = accessory.getServiceById(api.hap.Service.Switch, 'nightmode');
      const speech = accessory.getServiceById(api.hap.Service.Switch, 'speechenhancement');
      assert.equal(await night.getCharacteristic(api.hap.Characteristic.On).handleGetRequest(), true);
      assert.equal(await speech.getCharacteristic(api.hap.Characteristic.On).handleGetRequest(), false);
      api.signalShutdown();
      console.log('Homebridge loader smoke test passed');
    `], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    expect(output).toContain('Homebridge loader smoke test passed');
  });

  it.each([
    ['nightmode', 'getNightMode', 'setNightMode'],
    ['speechenhancement', 'getSpeechEnhancement', 'setSpeechEnhancement'],
  ])('wires real get/set handlers for %s', async (subtype, getter, setter) => {
    createAccessory();
    device[getter].mockResolvedValue(true);
    expect(await on(subtype).handleGetRequest()).toBe(true);
    await on(subtype).handleSetRequest(false);
    expect(device[setter]).toHaveBeenCalledWith(false);
  });

  it.each([
    ['nightmode', 'getNightMode', 'setNightMode'],
    ['speechenhancement', 'getSpeechEnhancement', 'setSpeechEnhancement'],
  ])('returns communication failure for failed %s reads and writes', async (subtype, getter, setter) => {
    createAccessory();
    jest.spyOn(platform, 'rediscoverDevice').mockResolvedValue(null);
    device[getter].mockRejectedValue(new Error('offline'));
    device[setter].mockRejectedValue(new Error('offline'));
    await expect(on(subtype).handleGetRequest()).rejects.toBe(api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    await expect(on(subtype).handleSetRequest(true)).rejects.toBe(api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  });

  it('restores renamed cached services without changing UUIDs or adding duplicate switches', async () => {
    createAccessory();
    const uuid = accessory.UUID;
    const night = accessory.getServiceById(api.hap.Service.Switch, 'nightmode');
    const speech = accessory.getServiceById(api.hap.Service.Switch, 'speechenhancement');
    night.displayName = 'Quiet Evenings';
    speech.displayName = 'Clear Voices';
    const cached = api.platformAccessory.deserialize(api.platformAccessory.serialize(accessory));
    handler.dispose();
    api.signalShutdown();
    const update = jest.spyOn(api, 'updatePlatformAccessories');
    const register = await launch({}, cached);
    expect(register).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith([cached]);
    expect(cached.UUID).toBe(uuid);
    expect(cached.services.filter((service) => service.UUID === api.hap.Service.Switch.UUID)).toHaveLength(2);
    expect(cached.getServiceById(api.hap.Service.Switch, 'nightmode').displayName).toBe('Quiet Evenings');
    expect(await on('nightmode').handleGetRequest()).toBe(false);
    expect(await on('speechenhancement').handleGetRequest()).toBe(false);
  });

  it('polls both switches and publishes external changes without writing to Sonos', async () => {
    await launch();
    const nightChanged = jest.fn();
    const speechChanged = jest.fn();
    on('nightmode').on('change', nightChanged);
    on('speechenhancement').on('change', speechChanged);
    getNightMode.mockResolvedValue(true);
    getSpeechEnhancement.mockResolvedValue(true);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(on('nightmode').value).toBe(true);
    expect(on('speechenhancement').value).toBe(true);
    expect(nightChanged).toHaveBeenCalled();
    expect(speechChanged).toHaveBeenCalled();
    expect(setNightMode).not.toHaveBeenCalled();
    expect(setSpeechEnhancement).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(nightChanged).toHaveBeenCalledTimes(1);
    expect(speechChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps cached switches usable when startup cannot reach the device', async () => {
    createAccessory();
    const cached = api.platformAccessory.deserialize(api.platformAccessory.serialize(accessory));
    handler.dispose();
    api.signalShutdown();
    SonosNightModeDevice.prototype.getDeviceInfo.mockRejectedValueOnce(new Error('offline'));
    const register = await launch({}, cached);
    expect(register).not.toHaveBeenCalled();
    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    getNightMode.mockResolvedValue(true);
    getSpeechEnhancement.mockResolvedValue(true);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(on('nightmode').value).toBe(true);
    expect(on('speechenhancement').value).toBe(true);
  });

  it('allows background refresh to be disabled', async () => {
    await launch({ pollInterval: 0 });
    await jest.advanceTimersByTimeAsync(120_000);
    expect(getNightMode).not.toHaveBeenCalled();
    expect(getSpeechEnhancement).not.toHaveBeenCalled();
    expect(await on('nightmode').handleGetRequest()).toBe(false);
  });

  it.each([-1, 1, 9, 3601, 10.5, '10', NaN])('falls back safely for invalid pollInterval %s', async (pollInterval) => {
    await launch({ pollInterval });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid pollInterval'));
    await jest.advanceTimersByTimeAsync(29_999);
    expect(getNightMode).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(getNightMode).toHaveBeenCalledTimes(1);
  });

  it('only polls supported features', async () => {
    createAccessory({ ...deviceInfo, supportsSpeechEnhancement: false });
    await handler.refreshState();
    expect(getNightMode).toHaveBeenCalledTimes(1);
    expect(getSpeechEnhancement).not.toHaveBeenCalled();
    expect(accessory.getServiceById(api.hap.Service.Switch, 'speechenhancement')).toBeUndefined();
  });

  it('does not overlap polling cycles and stops timers on shutdown', async () => {
    await launch();
    let finish;
    getNightMode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getNightMode).toHaveBeenCalledTimes(1);
    finish(true);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(getNightMode).toHaveBeenCalledTimes(2);
    api.signalShutdown();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getNightMode).toHaveBeenCalledTimes(2);
  });

  it('bounds refresh concurrency across multiple devices', async () => {
    SonosNightModeDevice.prototype.getDeviceInfo.mockImplementation(async function () {
      return { ...deviceInfo, ip: this.host, serialNumber: this.host };
    });
    await launch({ devices: [{ ip: deviceInfo.ip }, { ip: '192.168.1.101' }] });
    let finish;
    getNightMode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getNightMode).toHaveBeenCalledTimes(1);
    expect(getSpeechEnhancement).toHaveBeenCalledTimes(1);
    finish(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(getNightMode).toHaveBeenCalledTimes(2);
    expect(getSpeechEnhancement).toHaveBeenCalledTimes(2);
  });

  it('discards a stale poll that finishes after a HomeKit write', async () => {
    createAccessory();
    let finish;
    getNightMode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const refresh = handler.refreshState();
    await on('nightmode').handleSetRequest(true);
    finish(false);
    await refresh;
    expect(on('nightmode').value).toBe(true);
  });

  it('does not poll while a HomeKit write is pending', async () => {
    createAccessory();
    let finish;
    setNightMode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const write = on('nightmode').handleSetRequest(true);
    await handler.refreshState();
    expect(getNightMode).not.toHaveBeenCalled();
    finish();
    await write;
  });

  it('marks an offline switch unavailable and clears the error after recovery', async () => {
    createAccessory();
    jest.spyOn(platform, 'rediscoverDevice').mockResolvedValue(null);
    getNightMode.mockRejectedValueOnce(new Error('offline'));
    await handler.refreshState();
    expect(on('nightmode').statusCode).toBe(api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    expect(on('speechenhancement').statusCode).toBe(api.hap.HAPStatus.SUCCESS);
    await handler.refreshState();
    expect(on('nightmode').statusCode).toBe(api.hap.HAPStatus.SUCCESS);
  });

  it('updates the cached IP after rediscovery without replacing the accessory', async () => {
    createAccessory();
    const uuid = accessory.UUID;
    const update = jest.spyOn(api, 'updatePlatformAccessories');
    const rediscover = jest.spyOn(platform, 'rediscoverDevice').mockResolvedValue('192.168.1.200');
    getNightMode.mockRejectedValueOnce(new Error('offline'));
    getSpeechEnhancement.mockRejectedValueOnce(new Error('offline'));
    await handler.refreshState();
    expect(rediscover).toHaveBeenCalledTimes(1);
    expect(device.host).toBe('192.168.1.200');
    expect(accessory.context.device.ip).toBe('192.168.1.200');
    expect(update).toHaveBeenCalledWith([accessory]);
    expect(accessory.UUID).toBe(uuid);
    expect(await on('nightmode').handleGetRequest()).toBe(false);
  });

  it('ignores in-flight poll results after shutdown', async () => {
    await launch();
    let finish;
    getNightMode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await jest.advanceTimersByTimeAsync(10_000);
    api.signalShutdown();
    finish(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(on('nightmode').value).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not mutate the cache if rediscovery finishes after disposal', async () => {
    createAccessory();
    let finish;
    jest.spyOn(platform, 'rediscoverDevice').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const update = jest.spyOn(api, 'updatePlatformAccessories');
    getNightMode.mockRejectedValueOnce(new Error('offline'));
    await handler.refreshState();
    handler.dispose();
    finish('192.168.1.200');
    await jest.advanceTimersByTimeAsync(0);
    expect(device.host).toBe(deviceInfo.ip);
    expect(update).not.toHaveBeenCalled();
  });

  it('catches asynchronous startup errors', async () => {
    jest.spyOn(api, 'registerPlatformAccessories').mockImplementationOnce(() => { throw new Error('registration failed'); });
    await launch();
    expect(log.error).toHaveBeenCalledWith('Platform startup failed:', expect.stringContaining('registration failed'));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(getNightMode).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not register accessories when shutdown interrupts startup', async () => {
    let finish;
    SonosNightModeDevice.prototype.getDeviceInfo.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const register = await launch();
    api.signalShutdown();
    finish({ ...deviceInfo });
    await jest.advanceTimersByTimeAsync(0);
    expect(register).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
