import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@/components/theme';
import { Body, Button, Card, Heading, LoadState, Screen, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { goToLogin } from '@/lib/engagement';
import type { OwnerBusiness } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function MyBusinessesScreen() {
  const { user, meta } = useAuth();
  if (user === undefined) return <LoadState loading error={null}>{null}</LoadState>;
  if (!user) {
    return (
      <Screen>
        <Card>
          <Heading>Run your shop on {meta.appName}</Heading>
          <Body muted>
            Register your shop for free, get verified with a photo of your shop front, and publish offers that customers
            nearby can find, save and share.
          </Body>
          <Button title="Log in or sign up" onPress={() => goToLogin('/business')} />
        </Card>
      </Screen>
    );
  }
  return <BusinessList />;
}

function BusinessList() {
  const list = useLoad(() => api<OwnerBusiness[]>('/me/businesses'), []);
  const { reload } = list;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <LoadState loading={list.loading} error={list.error} onRetry={list.refresh}>
        {list.data?.length === 0 && (
          <Card>
            <Heading>Register your first shop</Heading>
            <Body muted>It takes a few minutes. We do not ask for identity documents: a clear photo of your shop front is enough.</Body>
          </Card>
        )}
        {list.data?.map((b) => (
          <Pressable key={b.id} accessibilityRole="link" onPress={() => router.push(`/business/${b.id}`)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text }}>{b.name}</Text>
                <StatusBadge status={b.status} />
              </View>
              <Body muted small>
                {b.category.name} · {b.address.locality?.name ?? b.address.city.name}
              </Body>
            </Card>
          </Pressable>
        ))}
        <Button title="+ Register a business" onPress={() => router.push('/business/new')} />
      </LoadState>
    </Screen>
  );
}
