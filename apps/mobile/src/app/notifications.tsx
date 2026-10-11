import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { colors, space } from '@/components/theme';
import { Body, Button, LoadState } from '@/components/ui';
import { api, apiPage } from '@/lib/api';
import { resolveLink } from '@/lib/links';
import { formatDateTime } from '@/lib/time';
import type { PageMeta } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

type Page = { items: Notification[]; meta: PageMeta & { unread: number } };

export default function NotificationsScreen() {
  const [pages, setPages] = useState(1);
  const inbox = useLoad(async (): Promise<Page> => {
    // Load every page shown so far (newest first) so "mark as read" keeps the list in place.
    const all: Notification[] = [];
    let meta: Page['meta'] | null = null;
    for (let page = 1; page <= pages; page++) {
      const r = await apiPage<Notification, { unread: number }>('/me/notifications', { query: { page, pageSize: 30 } });
      all.push(...r.items);
      meta = r.meta;
      if (page >= r.meta.totalPages) break;
    }
    return { items: all, meta: meta! };
  }, [pages]);

  async function open(n: Notification) {
    if (!n.read) {
      await api('/me/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
      inbox.setData((d) => d && { ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
    }
    if (!n.link) return;
    const target = resolveLink(n.link);
    if (target.kind === 'app') router.push(target.path as never);
    else void Linking.openURL(target.url);
  }

  const data = inbox.data;
  return (
    <LoadState loading={inbox.loading} error={inbox.error} onRetry={inbox.refresh}>
      <Stack.Screen
        options={{
          headerRight: () =>
            data && data.meta.unread > 0 ? (
              <Button
                title="Mark all read"
                variant="link"
                onPress={async () => {
                  await api('/me/notifications/read', { method: 'POST', body: { all: true } }).catch(() => {});
                  await inbox.reload();
                }}
              />
            ) : null,
        }}
      />
      <FlatList
        style={{ backgroundColor: colors.background }}
        data={data?.items ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={inbox.refreshing} onRefresh={inbox.refresh} colors={[colors.brand600]} />}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (data && pages < data.meta.totalPages) setPages((p) => p + 1);
        }}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: space.sm }}>
            <Button title="Notification settings ›" variant="link" onPress={() => router.push('/notification-settings')} style={{ alignSelf: 'flex-start' }} />
          </View>
        }
        ListEmptyComponent={
          <View style={{ padding: space.lg }}>
            <Body muted>No notifications yet.</Body>
          </View>
        }
        renderItem={({ item: n }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${n.body}`}
            onPress={() => void open(n)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: space.md,
              padding: space.lg,
              backgroundColor: pressed ? colors.background : colors.surface,
              borderBottomWidth: 1,
              borderColor: colors.border,
            })}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.read ? 'transparent' : colors.brand600 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15, color: colors.text, fontWeight: n.read ? '400' : '600' }}>{n.title}</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>{n.body}</Text>
              <Text style={{ fontSize: 12, color: colors.textFaint }}>{formatDateTime(n.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </LoadState>
  );
}
