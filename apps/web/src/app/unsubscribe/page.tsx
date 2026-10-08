'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <Unsubscribe />
    </Suspense>
  );
}

/** Opened from the "Stop emails like this" link in a notification email; no login needed. */
function Unsubscribe() {
  const token = useSearchParams().get('token');
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('This link is incomplete.');
      return;
    }
    api<{ label: string }>('/notifications/unsubscribe', { method: 'POST', auth: false, body: { token } })
      .then((r) => setLabel(r.label))
      .catch((e) => setError(errorMessage(e)));
  }, [token]);

  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <h1 className="text-xl font-semibold">Email preferences</h1>
      {label && (
        <p>
          You won’t get emails for “{label}” any more. It will still appear in your 🔔 inbox on the website.
        </p>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {!label && !error && <p className="text-gray-500">Updating…</p>}
      <Link href="/account#notifications" className="btn-secondary">
        All notification settings
      </Link>
    </div>
  );
}
