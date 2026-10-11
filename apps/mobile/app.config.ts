import type { ExpoConfig } from 'expo/config';

/**
 * App configuration (read by Expo CLI and EAS Build).
 *
 * - The display name is configuration, never code (ADR-0009): APP_DISPLAY_NAME, default "Dodoom" (preview name).
 * - The API origin comes from EXPO_PUBLIC_API_URL and is baked into the JavaScript bundle at build time.
 * - The Android package id can NEVER change once the app is on Google Play, so it uses the neutral
 *   codename and does not follow the (not final) product name. See docs/mobile.md.
 */
const displayName = process.env.APP_DISPLAY_NAME ?? 'Dodoom';
const androidPackage = process.env.ANDROID_PACKAGE ?? 'com.craftware.offerplatform';
const publicWebUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://dodoom.vercel.app').replace(/\/+$/, '');

const config: ExpoConfig = {
  name: displayName,
  slug: 'offer-platform',
  scheme: 'offerplatform',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  runtimeVersion: { policy: 'appVersion' },
  android: {
    package: androidPackage,
    // versionCode is managed by EAS ("appVersionSource": "remote" + "autoIncrement" in eas.json): every
    // Play upload gets the next number automatically.
    adaptiveIcon: {
      backgroundColor: '#FFF7ED',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Only what the app uses: approximate location for "near me" (and the shop's position when a
    // business registers), camera for shop and offer photos. Nothing runs in the background.
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    // Offer and shop links shared on WhatsApp open in the app when it is installed. Verification
    // (autoVerify) needs /.well-known/assetlinks.json on the website; see docs/mobile.md.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: new URL(publicWebUrl).host, pathPrefix: '/offers/' },
          { scheme: 'https', host: new URL(publicWebUrl).host, pathPrefix: '/businesses/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#ffffff' }],
    'expo-secure-store',
    'expo-font',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'We use your location only to show offers near you. It is never stored.',
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Choose photos of your shop and offers.',
        cameraPermission: 'Take photos of your shop and offers.',
        microphonePermission: false,
      },
    ],
    '@react-native-community/datetimepicker',
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    publicWebUrl,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
