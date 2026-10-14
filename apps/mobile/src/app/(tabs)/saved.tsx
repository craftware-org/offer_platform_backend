import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { OfferStack } from '@/components/offer-card';
import { Body, Button, Card, LoadState, Screen, Segmented } from '@/components/ui';
import { apiPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { goToLogin } from '@/lib/engagement';
import type { PublicOffer } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function SavedScreen() {
  const { user } = useAuth();
  if (user === undefined) return <LoadState loading error={null}>{null}</LoadState>;
  if (!user) {
    return (
      <Screen>
        <Card>
          <Body>Save offers with ♡ to find them here later. We remind you before a saved offer ends.</Body>
          <Button title="Log in or sign up" onPress={() => goToLogin('/saved')} />
        </Card>
      </Screen>
    );
  }
  return <SavedList />;
}

function SavedList() {
  const [status, setStatus] = useState<'active' | 'ended'>('active');
  const list = useLoad(() => apiPage<PublicOffer>('/me/saved-offers', { query: { status, pageSize: 50 } }), [status]);
  const { reload } = list;
  // Hearts change elsewhere: refresh when the tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <Segmented
        options={[
          { value: 'active', label: 'Still on' },
          { value: 'ended', label: 'Ended' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Button title="Shops you follow ›" variant="link" onPress={() => router.push('/following')} style={{ alignSelf: 'flex-start' }} />
      <LoadState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <OfferStack offers={list.data?.items ?? []} empty={status === 'active' ? 'No saved offers yet. Tap ♡ on an offer to save it.' : 'No ended offers.'} />
      </LoadState>
    </Screen>
  );
}
