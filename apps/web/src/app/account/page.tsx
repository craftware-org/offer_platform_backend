'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AccountPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Account />
      </Suspense>
    </RequireAuth>
  );
}

function Account() {
  const { user, reload, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const next = params.get('next');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
  }, [user]);

  if (!user) return null;

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, string | null> = {};
      if (name.trim() && name.trim() !== user!.name) body.name = name.trim();
      if (email.trim() !== (user!.email ?? '')) body.email = email.trim() || null;
      if (Object.keys(body).length) await api('/users/me', { method: 'PATCH', body });
      await reload();
      if (welcome && next?.startsWith('/') && !next.startsWith('//')) router.replace(next);
      else setMessage('Saved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm('Delete your account permanently? Your name, phone and email are erased. This cannot be undone.')) return;
    try {
      await api('/auth/account', { method: 'DELETE' });
      await signOut();
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h1 className="text-xl font-semibold">{welcome ? 'Welcome! What should we call you?' : 'Your account'}</h1>
        {user.phone && <p className="text-sm text-gray-600">Phone: {user.phone}</p>}
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email {user.email && (user.emailVerified ? <span className="text-green-700">(verified)</span> : <span className="text-gray-500">(not verified)</span>)}
          </label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="card flex flex-wrap gap-3">
        <button
          className="btn-secondary"
          onClick={async () => {
            await signOut();
            router.replace('/');
          }}
        >
          Log out
        </button>
        <button className="btn-danger" onClick={() => void deleteAccount()}>
          Delete account
        </button>
      </div>
    </div>
  );
}
