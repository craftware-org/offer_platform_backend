import { router, useLocalSearchParams } from 'expo-router';
import { OfferForm } from '@/components/offer-form';
import { Body, LoadState, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { OwnerBusiness } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function NewOfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useLoad(() => api<OwnerBusiness>(`/me/businesses/${id}`), [id]);
  return (
    <Screen>
      <LoadState loading={loading} error={error} onRetry={refresh}>
        {data && (
          <>
            <Body muted>
              The offer is saved as a draft. Add photos, then submit it: an admin checks every offer before customers see it.
            </Body>
            <OfferForm businessId={id} defaultCategoryId={data.category.id} onSaved={(o) => router.replace(`/business/offers/${o.id}`)} />
          </>
        )}
      </LoadState>
    </Screen>
  );
}
