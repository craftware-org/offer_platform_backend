'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FollowButton } from '@/components/engagement-buttons';
import { RequireAuth } from '@/components/require-auth';
import { api, errorMessage } from '@/lib/api';
import { apiUrl } from '@/lib/config';
import type { PublicBusiness } from '@/lib/types';

export default function FollowingPage() {
  return (
    <RequireAuth>
      <Following />
    </RequireAuth>
  );
}

function Following() {
  const [list, setList] = useState<PublicBusiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PublicBusiness[]>('/me/follows')
      .then(setList)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Shops you follow</h1>
      <p className="text-sm text-gray-600">Their new offers appear on your home page.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {list?.length === 0 && <p className="text-sm text-gray-500">You’re not following any shop yet. Tap “Follow” on a shop page.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list?.map((b) => (
          <div key={b.id} className="card flex items-center gap-3">
            {b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- images come from the API (ADR-0014)
              <img src={apiUrl(b.logo.urls.thumb)} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 font-bold text-brand-600">
                {b.name.slice(0, 1)}
              </div>
            )}
            <Link href={`/businesses/${b.slug}`} className="flex-1">
              <p className="font-medium">{b.name}</p>
              <p className="text-sm text-gray-600">
                {b.category.name} · {b.address.locality?.name ?? b.address.city.name}
              </p>
            </Link>
            <FollowButton businessId={b.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
