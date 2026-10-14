import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, session } from './api';
import type { AppMeta, LoginResult, User } from './types';

/** Used until /meta answers (or when the phone is offline at start-up). */
export const FALLBACK_META: AppMeta = {
  appName: 'Dodoom',
  publicUrl: '',
  preview: false,
  loginMethods: {
    phone: { available: true, delivery: 'sms' },
    email: { available: true, delivery: 'email' },
  },
  discovery: { defaultRadiusKm: 5, maxRadiusKm: 25, radiusOptionsKm: [2, 5, 10, 25] },
  features: {},
};

interface AuthState {
  /** undefined while the saved session is being restored. */
  user: User | null | undefined;
  meta: AppMeta;
  signIn(result: LoginResult): Promise<User>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
  can(permission: string): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [meta, setMeta] = useState<AppMeta>(FALLBACK_META);

  const reload = useCallback(async () => {
    await session.load();
    if (!session.hasRefreshToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>('/users/me'));
    } catch {
      // A rejected session is already cleared by the API client. Offline: show "logged out" for now;
      // the saved session stays and is used on the next request.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void reload();
    api<AppMeta>('/meta', { auth: false })
      .then(setMeta)
      .catch(() => {});
    // A rejected refresh (or logout) anywhere clears the user everywhere.
    return session.subscribe(() => {
      if (!session.hasRefreshToken()) setUser(null);
    });
  }, [reload]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      meta,
      reload,
      async signIn(result) {
        await session.set(result);
        const me = await api<User>('/users/me');
        setUser(me);
        return me;
      },
      async signOut() {
        const refreshToken = session.refreshToken();
        await session.clear();
        setUser(null);
        if (refreshToken) {
          await api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(() => {});
        }
      },
      can: (permission) => !!user?.permissions.includes(permission),
    }),
    [user, meta, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
