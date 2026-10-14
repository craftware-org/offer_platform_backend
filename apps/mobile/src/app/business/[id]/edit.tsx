import { router, useLocalSearchParams } from 'expo-router';
import { BusinessForm } from '@/components/business-form';
import { LoadState, Notice, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { OwnerBusiness } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function EditBusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useLoad(() => api<OwnerBusiness>(`/me/businesses/${id}`), [id]);
  return (
    <Screen>
      <LoadState loading={loading} error={error} onRetry={refresh}>
        {data && (
          <>
            {data.lockedFields.length > 0 && <Notice>Some details are locked while your business is reviewed or verified. Ask an admin to change them.</Notice>}
            <BusinessForm business={data} onSaved={() => router.back()} />
          </>
        )}
      </LoadState>
    </Screen>
  );
}
