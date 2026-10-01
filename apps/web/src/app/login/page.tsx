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

function Login() {
  const { meta, signIn, user } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [method, setMethod] = useState<'phone' | 'email'>('email');
  const [identity, setIdentity] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'identity' | 'code'>('identity');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  // Set during verify(), which does its own redirect (new users go to the welcome step first).
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

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ resendAfterSeconds: number }>('/auth/otp/request', {
        method: 'POST',
        auth: false,
        body: { [method]: identity.trim() },
      });
      setStep('code');
      setResendIn(res.resendAfterSeconds);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    loggingIn.current = true;
    try {
      const result = await api<LoginResult>('/auth/otp/verify', {
        method: 'POST',
        auth: false,
        body: { [method]: identity.trim(), code: code.trim() },
      });
      await signIn(result);
      router.replace(result.isNewUser && !result.user.name ? `/account?welcome=1&next=${encodeURIComponent(next)}` : next);
    } catch (e) {
      loggingIn.current = false;
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Log in or sign up</h1>

      {step === 'identity' ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void requestCode();
          }}
        >
          <div className="flex gap-2 text-sm">
            {(['email', 'phone'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={method === m ? 'btn-primary' : 'btn-secondary'}
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
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder={method === 'email' ? 'you@example.com' : '98450 12345'}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || !identity.trim()}>
            {busy ? 'Sending…' : 'Send login code'}
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
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
              Login code
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
          <button className="btn-primary w-full" disabled={busy || code.trim().length < 4}>
            {busy ? 'Checking…' : 'Log in'}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-gray-600 underline" onClick={() => setStep('identity')}>
              Change {method}
            </button>
            <button type="button" className="text-brand-700 underline disabled:text-gray-400 disabled:no-underline" disabled={resendIn > 0 || busy} onClick={() => void requestCode()}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
