'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Fired by the inbox after marking notifications read, so the count updates at once. */
export const NOTIFICATIONS_CHANGED = 'notifications:changed';

/** 🔔 with the unread count. Refreshes on navigation and every minute while the tab is visible. */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
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
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      className="relative text-lg leading-none text-gray-700 hover:text-brand-600"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      🔔
      {unread > 0 && (
        <span className="absolute -top-2 -right-2 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
