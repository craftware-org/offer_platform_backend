'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { NotificationSettings } from '@/components/notification-settings';
import { RequireAuth } from '@/components/require-auth';
import { api, errorMessage, session } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { TokenPair } from '@/lib/types';

export default function AccountPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Account />
      </Suspense>
    </RequireAuth>
  );
}

const PASSWORD_HINT = 'At least 8 characters. Very common passwords are not allowed.';

/** Same-site paths only. */
const safeNext = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null);

function Account() {
  const { user, reload, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const next = safeNext(params.get('next'));
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

  // Welcome step: anyone without a password chooses one here (plus a name if missing).
  if (welcome && (!user.hasPassword || !user.name)) {
    return <Welcome onDone={() => router.replace(next ?? '/')} />;
  }

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
      if (welcome && next) router.replace(next);
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
        <h1 className="text-xl font-semibold">Your account</h1>
        {user.phone && <p className="text-sm text-gray-600">Phone: {user.phone}</p>}
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email{' '}
            {user.email &&
              (user.emailVerified ? (
                <span className="text-green-700">(verified)</span>
              ) : (
                <span className="text-gray-500">(not verified)</span>
              ))}
          </label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {user.hasPassword ? <ChangePassword /> : <SetPassword onDone={reload} />}

      <NotificationSettings />

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

/** First login: choose a name (if missing) and a password, in one step. */
function Welcome({ onDone }: { onDone: () => void }) {
  const { user, reload } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function submit() {
    setError(null);
    if (!user!.hasPassword && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (!user!.name && name.trim()) await api('/users/me', { method: 'PATCH', body: { name: name.trim() } });
      if (!user!.hasPassword) await api('/auth/password', { method: 'POST', body: { password } });
      await reload();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card mx-auto max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 className="text-xl font-semibold">Welcome! Finish setting up your account</h1>
      <p className="text-sm text-gray-600">
        {user.email ?? user.phone} is verified. Choose a password so next time you can log in without a code.
      </p>
      {!user.name && (
        <div>
          <label className="label" htmlFor="w-name">
            Your name
          </label>
          <input id="w-name" className="input" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      {!user.hasPassword && (
        <>
          <div>
            <label className="label" htmlFor="w-password">
              Password
            </label>
            <input
              id="w-password"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">{PASSWORD_HINT}</p>
          </div>
          <div>
            <label className="label" htmlFor="w-confirm">
              Confirm password
            </label>
            <input
              id="w-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Continue'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function SetPassword({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { password } });
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="font-semibold">Set a password</h2>
      <p className="text-sm text-gray-600">Log in with a password instead of a code each time.</p>
      <input className="input" type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Confirm password" aria-label="Confirm password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <p className="text-xs text-gray-500">{PASSWORD_HINT}</p>
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Set password'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setMessage(null);
    if (password !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const tokens = await api<TokenPair>('/auth/password/change', {
        method: 'POST',
        body: { currentPassword: current, newPassword: password },
      });
      session.set(tokens); // the old session ended; continue with the new one
      setCurrent('');
      setPassword('');
      setConfirm('');
      setMessage('Password changed. You were logged out on your other devices.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="font-semibold">Change password</h2>
      <input className="input" type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Confirm new password" aria-label="Confirm new password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <p className="text-xs text-gray-500">{PASSWORD_HINT} Forgot it? Log out and use “Forgot password?” on the login page.</p>
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
