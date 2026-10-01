'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, session } from './api';
import type { AppMeta, LoginResult, User } from './types';

interface AuthState {
  /** undefined while the saved session is being restored. */
  user: User | null | undefined;
  meta: AppMeta;
  signIn(result: LoginResult): Promise<void>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
  can(permission: string): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ meta, children }: { meta: AppMeta; children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!session.hasRefreshToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>('/users/me'));
    } catch {
      // Rejected sessions are already cleared by the API client; a network error just shows "logged out".
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Another tab logging out (or a rejected refresh) clears the session everywhere.
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
        session.set(result);
        setUser(await api<User>('/users/me'));
      },
      async signOut() {
        const refreshToken = session.refreshToken();
        session.clear();
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
