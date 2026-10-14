import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { NotificationBell } from '@/components/notification-bell';
import { colors } from '@/components/theme';
import { useAuth } from '@/lib/auth';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const { meta } = useAuth();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand600,
        tabBarInactiveTintColor: colors.textFaint,
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <NotificationBell />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: meta.appName, tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search-outline') }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: icon('heart-outline') }} />
      <Tabs.Screen name="business" options={{ title: 'My shop', tabBarIcon: icon('storefront-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
