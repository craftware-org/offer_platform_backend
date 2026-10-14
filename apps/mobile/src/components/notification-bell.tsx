import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from './theme';

/** 🔔 with the unread count, refreshed when a tab screen comes into view and every minute. */
export function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setUnread(0);
        return;
      }
      const load = () =>
        api<{ unread: number }>('/me/notifications/unread-count')
          .then((r) => setUnread(r.unread))
          .catch(() => {});
      void load();
      const timer = setInterval(load, 60_000);
      return () => clearInterval(timer);
    }, [user]),
  );

  if (!user) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      hitSlop={10}
      onPress={() => router.push('/notifications')}
      style={{ marginRight: 16 }}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -8,
            backgroundColor: colors.brand600,
            borderRadius: 999,
            minWidth: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}
