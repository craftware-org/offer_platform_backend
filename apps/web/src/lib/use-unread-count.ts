'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from './api';

/** Fired by the inbox after marking notifications read, so the count updates at once. */
export const NOTIFICATIONS_CHANGED = 'notifications:changed';

/**
 * Unread notifications for the logged-in person (0 when logged out). Refreshes on navigation,
 * every minute while the tab is visible, and when the inbox changes.
 */
export function useUnreadCount(enabled: boolean): number {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ unread: number }>('/me/notifications/unread-count')
        .then((r) => {
          if (!cancelled) setUnread(r.unread);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- re-check the count on every navigation
  }, [pathname, enabled]);

  return unread;
}

export const formatCount = (n: number) => (n > 99 ? '99+' : String(n));
