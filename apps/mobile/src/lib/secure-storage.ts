import * as SecureStore from 'expo-secure-store';

/**
 * Small values kept in the Android Keystore-backed secure storage. Failures (rare: a wiped keystore
 * after a device restore) are treated as "nothing stored" so the app still starts.
 */
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // keep going in memory only
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // nothing to remove
    }
  },
};
