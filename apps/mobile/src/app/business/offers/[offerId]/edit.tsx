import { router, useLocalSearchParams } from 'expo-router';
import { OfferForm } from '@/components/offer-form';
import { LoadState, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { OwnerOffer } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function EditOfferScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const { data, loading, error, refresh } = useLoad(() => api<OwnerOffer>(`/me/offers/${offerId}`), [offerId]);
  return (
    <Screen>
      <LoadState loading={loading} error={error} onRetry={refresh}>
        {data && <OfferForm offer={data} onSaved={() => router.back()} />}
      </LoadState>
    </Screen>
  );
}
