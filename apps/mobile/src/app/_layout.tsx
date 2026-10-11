import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/components/theme';
import { AuthProvider } from '@/lib/auth';
import { EngagementProvider } from '@/lib/engagement';
import { LocationProvider } from '@/lib/location';

// A link opened from WhatsApp (e.g. /offers/<slug>) still has the tabs underneath, so "back" goes home.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocationProvider>
          <EngagementProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ title: 'Log in', presentation: 'modal' }} />
              <Stack.Screen name="welcome" options={{ title: 'Welcome', headerBackVisible: false, gestureEnabled: false }} />
              <Stack.Screen name="offers/[slug]" options={{ title: 'Offer' }} />
              <Stack.Screen name="businesses/[slug]" options={{ title: 'Shop' }} />
              <Stack.Screen name="report/[offerId]" options={{ title: 'Report this offer', presentation: 'modal' }} />
              <Stack.Screen name="following" options={{ title: 'Shops you follow' }} />
              <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
              <Stack.Screen name="notification-settings" options={{ title: 'Notification settings' }} />
              <Stack.Screen name="business/new" options={{ title: 'Register a business' }} />
              <Stack.Screen name="business/[id]/index" options={{ title: 'Your business' }} />
              <Stack.Screen name="business/[id]/edit" options={{ title: 'Edit details' }} />
              <Stack.Screen name="business/[id]/insights" options={{ title: 'Performance' }} />
              <Stack.Screen name="business/[id]/offers/new" options={{ title: 'New offer' }} />
              <Stack.Screen name="business/offers/[offerId]/index" options={{ title: 'Manage offer' }} />
              <Stack.Screen name="business/offers/[offerId]/edit" options={{ title: 'Edit offer' }} />
            </Stack>
          </EngagementProvider>
        </LocationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
