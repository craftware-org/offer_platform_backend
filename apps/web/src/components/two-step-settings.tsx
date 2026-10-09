'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, session } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/time';
import type { TokenPair } from '@/lib/types';

interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}
interface MfaSetup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

const isAdminRole = (roles: string[]) => roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');

/**
 * 2-step login with an authenticator app (Phase 8, ADR-0018). Required for admins before they can use
 * the admin area; shown to admins and to anyone who already turned it on.
 */
export function TwoStepSettings({ onDone }: { onDone?: () => void } = {}) {
  const { user, reload } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [action, setAction] = useState<'renew' | 'disable' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<MfaStatus>('/me/mfa')
        .then(setStatus)
        .catch((e) => setError(errorMessage(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !status) return null;
  if (!status.enabled && !isAdminRole(user.roles) && !setup) return null;

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => setSetup(await api<MfaSetup>('/me/mfa/setup', { method: 'POST' })));

  const confirm = () =>
    run(async () => {
      const res = await api<{ recoveryCodes: string[]; tokens: TokenPair }>('/me/mfa/enable', { method: 'POST', body: { code: code.trim() } });
      session.set(res.tokens); // the new session passed the authenticator step; other sessions ended
      await reload();
      setRecoveryCodes(res.recoveryCodes);
      setSetup(null);
      setCode('');
      await load();
    });

  const renew = () =>
    run(async () => {
      const res = await api<{ recoveryCodes: string[] }>('/me/mfa/recovery-codes', { method: 'POST', body: { code: code.trim() } });
      setRecoveryCodes(res.recoveryCodes);
      setAction(null);
      setCode('');
      await load();
    });

  const disable = () =>
    run(async () => {
      await api('/me/mfa/disable', { method: 'POST', body: { code: code.trim() } });
      // Every session ended, including this one.
      session.clear();
      window.location.assign('/login');
    });

  const codeInput = (
    <input
      className="input max-w-40"
      aria-label="6-digit code from your authenticator app"
      placeholder="123456"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={code}
      onChange={(e) => setCode(e.target.value)}
    />
  );
  const codeOk = /^\d{6}$/.test(code.trim());

  return (
    <section id="two-step" className="card space-y-3">
      <h2 className="font-semibold">2-step login</h2>

      {recoveryCodes && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Save these recovery codes now. They won&apos;t be shown again.</p>
          <p>If you lose your phone, each code lets you log in once.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary py-1.5"
              onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join('\n')).catch(() => {})}
            >
              Copy
            </button>
            <a
              className="btn-secondary py-1.5"
              download="recovery-codes.txt"
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(recoveryCodes.join('\n'))}`}
            >
              Download
            </a>
            <button
              type="button"
              className="btn-primary py-1.5"
              onClick={() => {
                setRecoveryCodes(null);
                onDone?.();
              }}
            >
              I saved them
            </button>
          </div>
        </div>
      )}

      {status.enabled ? (
        <>
          <p className="text-sm text-gray-700">
            On since {status.enabledAt ? formatDateTime(status.enabledAt) : '—'}. Logins ask for a code from your authenticator
            app. Recovery codes left: <strong>{status.recoveryCodesLeft}</strong>.
          </p>
          {action ? (
            <div className="flex flex-wrap items-center gap-2">
              {codeInput}
              <button className={action === 'disable' ? 'btn-danger' : 'btn-primary'} disabled={busy || !codeOk} onClick={() => void (action === 'renew' ? renew() : disable())}>
                {action === 'renew' ? 'Get new recovery codes' : 'Turn off 2-step login'}
              </button>
              <button className="btn-secondary" onClick={() => setAction(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setAction('renew')}>
                New recovery codes
              </button>
              <button className="btn-secondary" onClick={() => setAction('disable')}>
                Turn off
              </button>
            </div>
          )}
          {action === 'disable' && isAdminRole(user.roles) && (
            <p className="text-xs text-red-700">Admins can&apos;t use the admin area without 2-step login. You will be logged out everywhere.</p>
          )}
        </>
      ) : setup ? (
        <div className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-gray-700">
            <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or similar).</li>
            <li>In the app, add an account and scan this QR code.</li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL made by the API */}
          <img src={setup.qrDataUrl} alt="QR code for your authenticator app" className="h-48 w-48 rounded border border-gray-200" />
          <p className="text-xs text-gray-600">
            Can&apos;t scan? Enter this key in the app: <span className="font-mono break-all">{setup.secret}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {codeInput}
            <button className="btn-primary" disabled={busy || !codeOk} onClick={() => void confirm()}>
              Turn on
            </button>
            <button className="btn-secondary" onClick={() => setSetup(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            Protects your account with a code from an authenticator app on your phone, as well as your password.
            {isAdminRole(user.roles) && <strong> Required to use the admin area.</strong>}
          </p>
          <button className="btn-primary" disabled={busy} onClick={() => void start()}>
            Set up 2-step login
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
