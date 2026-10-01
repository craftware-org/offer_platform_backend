'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { LoginResult } from '@/lib/types';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

/** Only same-site paths: never redirect to another origin after login. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

type Method = 'email' | 'phone';
/** password: email/phone + password · code: one-time code (sign-up or no password) · reset: forgot password. */
type Mode = 'password' | 'code' | 'reset';

function Login() {
  const { meta, signIn, user } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [method, setMethod] = useState<Method>('email');
  const [mode, setMode] = useState<Mode>('password');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  // Set while this page logs someone in: it does its own redirect (new users go to the welcome step).
  const loggingIn = useRef(false);

  useEffect(() => {
    if (user && !loggingIn.current) router.replace(next);
  }, [user, next, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const delivery = meta.loginMethods[method]?.delivery;
  const idBody = () => ({ [method]: identity.trim() });

  function switchMode(m: Mode) {
    setMode(m);
    setCodeSent(false);
    setCode('');
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      loggingIn.current = false;
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish(result: LoginResult) {
    await signIn(result);
    // New accounts, and accounts that never set a password, choose one (and a name) first.
    const needsSetup = !result.user.hasPassword || (result.isNewUser && !result.user.name);
    router.replace(needsSetup ? `/account?welcome=1&next=${encodeURIComponent(next)}` : next);
  }

  const requestCode = () =>
    run(async () => {
      const res = await api<{ resendAfterSeconds: number }>('/auth/otp/request', {
        method: 'POST',
        auth: false,
        body: idBody(),
      });
      setCodeSent(true);
      setResendIn(res.resendAfterSeconds);
    });

  const loginWithPassword = () =>
    run(async () => {
      loggingIn.current = true;
      const result = await api<LoginResult>('/auth/password/login', {
        method: 'POST',
        auth: false,
        body: { ...idBody(), password },
      });
      await finish(result);
    });

  const loginWithCode = () =>
    run(async () => {
      loggingIn.current = true;
      const result = await api<LoginResult>('/auth/otp/verify', {
        method: 'POST',
        auth: false,
        body: { ...idBody(), code: code.trim() },
      });
      await finish(result);
    });

  const resetPassword = () =>
    run(async () => {
      loggingIn.current = true;
      const result = await api<LoginResult>('/auth/password/reset', {
        method: 'POST',
        auth: false,
        body: { ...idBody(), code: code.trim(), newPassword },
      });
      await finish(result);
    });

  const title = mode === 'reset' ? 'Reset your password' : mode === 'code' ? 'Log in or sign up with a code' : 'Log in';

  return (
    <div className="card mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>

      <div className="flex gap-2 text-sm">
        {(['email', 'phone'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={method === m ? 'btn-primary' : 'btn-secondary'}
            disabled={codeSent}
            onClick={() => {
              setMethod(m);
              setIdentity('');
            }}
          >
            {m === 'email' ? 'Email' : 'Phone'}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="identity">
          {method === 'email' ? 'Email address' : 'Mobile number'}
        </label>
        <input
          id="identity"
          className="input"
          type={method === 'email' ? 'email' : 'tel'}
          autoComplete={method === 'email' ? 'email' : 'tel'}
          required
          disabled={codeSent}
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          placeholder={method === 'email' ? 'you@example.com' : '98450 12345'}
        />
      </div>

      {mode === 'password' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void loginWithPassword();
          }}
        >
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || !identity.trim() || !password}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="button" className="text-brand-700 underline" onClick={() => switchMode('reset')}>
              Forgot password?
            </button>
            <button type="button" className="text-gray-700 underline" onClick={() => switchMode('code')}>
              Log in with a code instead
            </button>
          </div>
          <p className="border-t border-gray-100 pt-3 text-sm text-gray-600">
            New here?{' '}
            <button type="button" className="text-brand-700 underline" onClick={() => switchMode('code')}>
              Create an account with a code
            </button>{' '}
            — we verify your {method === 'email' ? 'email' : 'number'} once, then you choose a password.
          </p>
        </form>
      )}

      {mode !== 'password' && !codeSent && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void requestCode();
          }}
        >
          <button className="btn-primary w-full" disabled={busy || !identity.trim()}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <button type="button" className="text-sm text-gray-700 underline" onClick={() => switchMode('password')}>
            Back to password login
          </button>
        </form>
      )}

      {mode !== 'password' && codeSent && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void (mode === 'reset' ? resetPassword() : loginWithCode());
          }}
        >
          <p className="text-sm text-gray-600">
            We sent a 6-digit code to <strong>{identity}</strong>. It expires in 5 minutes.
          </p>
          {delivery === 'server-log' && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              Preview: codes are not delivered yet. Ask the team for the code from the server log.
            </p>
          )}
          <div>
            <label className="label" htmlFor="code">
              Code
            </label>
            <input
              id="code"
              className="input tracking-widest"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{4,8}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {mode === 'reset' && (
            <div>
              <label className="label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">At least 8 characters. Very common passwords are not allowed.</p>
            </div>
          )}
          <button
            className="btn-primary w-full"
            disabled={busy || code.trim().length < 4 || (mode === 'reset' && newPassword.length < 8)}
          >
            {busy ? 'Checking…' : mode === 'reset' ? 'Set new password and log in' : 'Log in'}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-gray-600 underline" onClick={() => switchMode(mode)}>
              Change {method}
            </button>
            <button
              type="button"
              className="text-brand-700 underline disabled:text-gray-400 disabled:no-underline"
              disabled={resendIn > 0 || busy}
              onClick={() => void requestCode()}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
