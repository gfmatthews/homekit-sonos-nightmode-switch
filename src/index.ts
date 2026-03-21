import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { SonosSoundFeaturesPlatform } from './platform';

export default (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, SonosSoundFeaturesPlatform);
};
