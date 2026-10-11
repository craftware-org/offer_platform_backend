import Constants from 'expo-constants';

export { API_URL, WEB_URL, apiUrl } from './env';

/** Sent with every request so the API can tell the app apart from scripts (it skips bots when counting). */
export const USER_AGENT = `OfferPlatformApp/${Constants.expoConfig?.version ?? '0'} (Android)`;
