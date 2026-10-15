'use client';

import { Bell, Heart, House, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { activeTab } from '@/lib/navigation';
import { formatCount, useUnreadCount } from '@/lib/use-unread-count';

/**
 * Phone navigation: the five places people use most, always under the thumb. Business portal,
 * admin, following and settings are reached from Account. Hidden from md up (desktop uses the top bar).
 */
export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const unread = useUnreadCount(!!user);
  const current = activeTab(pathname);
  const tabs = [
    { href: '/', label: 'Home', Icon: House },
    { href: '/search', label: 'Search', Icon: Search },
    { href: '/saved', label: 'Saved', Icon: Heart },
    { href: '/notifications', label: 'Alerts', Icon: Bell, count: unread },
    { href: user ? '/account' : '/login', label: user ? 'Account' : 'Log in', Icon: UserRound, key: '/account' },
  ];
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map(({ href, label, Icon, count, key }) => {
          const active = current === (key ?? href);
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95 ${
                  active ? 'text-brand-600' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${active ? 'bg-brand-50' : ''}`}>
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
                </span>
                {label}
                {!!count && (
                  <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-brand-600 px-1 text-center text-[10px] leading-4 font-bold text-on-brand">
                    {formatCount(count)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
