'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OfferForm } from '@/components/offer-form';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/api';
import type { OwnerBusiness } from '@/lib/types';

export default function NewOfferPage() {
  return (
    <RequireAuth>
      <NewOffer />
    </RequireAuth>
  );
}

function NewOffer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<OwnerBusiness | null>(null);
  useEffect(() => {
    api<OwnerBusiness>(`/me/businesses/${id}`)
      .then(setBusiness)
      .catch(() => setBusiness(null));
  }, [id]);

  return (
    <div className="card mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">New offer{business ? ` for ${business.name}` : ''}</h1>
      <p className="text-sm text-gray-600">
        The offer is saved as a draft. Add photos, then submit it: an admin reviews every offer before it goes live.
      </p>
      <OfferForm
        businessId={id}
        defaultCategoryId={business?.category.id}
        key={business?.id ?? 'loading'}
        onSaved={(o) => router.push(`/business/offers/${o.id}`)}
      />
    </div>
  );
}
