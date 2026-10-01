'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, errorMessage } from '@/lib/api';
import type { OwnerBusiness } from '@/lib/types';

export default function MyBusinessesPage() {
  return (
    <RequireAuth>
      <MyBusinesses />
    </RequireAuth>
  );
}

function MyBusinesses() {
  const [list, setList] = useState<OwnerBusiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OwnerBusiness[]>('/me/businesses')
      .then(setList)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your businesses</h1>
        <Link href="/business/new" className="btn-primary">
          Register a business
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        Listing is free. Register your shop, add a photo of the shop front for verification, and publish offers once
        an admin has verified it.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {list && list.length === 0 && <p className="card text-sm text-gray-600">You have not registered a business yet.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list?.map((b) => (
          <Link key={b.id} href={`/business/${b.id}`} className="card space-y-1 hover:shadow-md">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{b.name}</span>
              <StatusBadge status={b.status} />
            </div>
            <p className="text-sm text-gray-600">
              {b.category.name} · {b.address.locality?.name ?? b.address.city.name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
