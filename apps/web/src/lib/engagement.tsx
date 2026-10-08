'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export type TapEvent = 'OFFER_SHARED' | 'CALL_CLICKED' | 'WHATSAPP_CLICKED' | 'WEBSITE_CLICKED' | 'DIRECTIONS_CLICKED';

interface EngagementState {
  isSaved(offerId: string): boolean;
  isFollowing(businessId: string): boolean;
  /** Saves or unsaves; sends visitors who are not logged in to the login page. */
  toggleSave(offerId: string): Promise<void>;
  toggleFollow(businessId: string): Promise<void>;
  /**
   * Records a share/contact tap. Only logged-in users are counted (owner decision 2026-10-03), so
   * for visitors this does nothing. Never blocks or breaks the link the person tapped.
   */
  track(type: TapEvent, target: { offerId?: string; businessId?: string }): void;
}

const EngagementContext = createContext<EngagementState | null>(null);

export function EngagementProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setSaved(new Set());
      setFollowing(new Set());
      return;
    }
    api<string[]>('/me/saved-offers/ids')
      .then((ids) => setSaved(new Set(ids)))
      .catch(() => {});
    api<string[]>('/me/follows/ids')
      .then((ids) => setFollowing(new Set(ids)))
      .catch(() => {});
  }, [user]);

  const toLogin = useCallback(() => router.push(`/login?next=${encodeURIComponent(pathname)}`), [router, pathname]);

  const value = useMemo<EngagementState>(() => {
    const flip = (set: Set<string>, id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    };
    return {
      isSaved: (id) => saved.has(id),
      isFollowing: (id) => following.has(id),
      async toggleSave(offerId) {
        if (!user) return toLogin();
        const was = saved.has(offerId);
        setSaved((s) => flip(s, offerId)); // optimistic
        try {
          if (was) await api(`/me/saved-offers/${offerId}`, { method: 'DELETE' });
          else await api('/me/saved-offers', { method: 'POST', body: { offerId } });
        } catch (e) {
          setSaved((s) => flip(s, offerId)); // undo
          throw e;
        }
      },
      async toggleFollow(businessId) {
        if (!user) return toLogin();
        const was = following.has(businessId);
        setFollowing((s) => flip(s, businessId));
        try {
          if (was) await api(`/me/follows/${businessId}`, { method: 'DELETE' });
          else await api('/me/follows', { method: 'POST', body: { businessId } });
        } catch (e) {
          setFollowing((s) => flip(s, businessId));
          throw e;
        }
      },
      track(type, target) {
        if (!user) return;
        void api('/events', { method: 'POST', body: { type, ...target } }).catch(() => {});
      },
    };
  }, [user, saved, following, toLogin]);

  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}

export function useEngagement(): EngagementState {
  const ctx = useContext(EngagementContext);
  if (!ctx) throw new Error('useEngagement outside EngagementProvider');
  return ctx;
}
