'use client';

import { Bell, BadgePercent, Heart, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { formatCount, useUnreadCount } from '@/lib/use-unread-count';
import { AccountMenu, initialOf } from './account-menu';

/** The wordmark: an orange tag mark and the app name from configuration (ADR-0009). */
export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg" aria-label={`${name} home`}>
      <span className="flex size-8 items-center justify-center rounded-xl bg-brand-600 text-on-brand shadow-sm">
        <BadgePercent className="size-5" aria-hidden />
      </span>
      <span className="text-lg font-extrabold tracking-tight text-gray-900">{name}</span>
    </Link>
  );
}

/** Desktop search: always one tap away, keeps the current words when you are on /search. */
function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  useEffect(() => setQ(pathname === '/search' ? (params.get('q') ?? '') : ''), [pathname, params]);
  return (
    <form
      className="relative hidden max-w-md flex-1 md:block"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        className="input rounded-full pl-10"
        type="search"
        aria-label="Search offers and shops"
        placeholder="Search offers, shops, areas…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

const iconLink = 'icon-btn relative';

/**
 * Top bar. Desktop: logo, search, saved, notifications, account menu. Phones: logo plus a few
 * shortcuts; the main places live in the bottom tab bar (BottomNav).
 */
export function SiteHeader() {
  const { user, meta, can } = useAuth();
  const unread = useUnreadCount(!!user);
  const isAdmin = can('businesses:read') || can('offers:read');

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/85 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo name={meta.appName} />
        <Suspense fallback={<div className="hidden flex-1 md:block" />}>
          <HeaderSearch />
        </Suspense>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/business" className="btn-ghost hidden lg:inline-flex">
            For businesses
          </Link>
          {isAdmin && (
            <Link href="/admin" className="btn-ghost hidden md:inline-flex" aria-label="Admin">
              <ShieldCheck className="size-4" aria-hidden />
              <span className="hidden lg:inline">Admin</span>
            </Link>
          )}
          {user && (
            <>
              <Link href="/saved" className={`${iconLink} hidden md:inline-flex`} aria-label="Saved offers">
                <Heart className="size-5" aria-hidden />
              </Link>
              <Link
                href="/notifications"
                className={iconLink}
                aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              >
                <Bell className="size-5" aria-hidden />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 rounded-full bg-brand-600 px-1 text-center text-[10px] leading-4 font-bold text-on-brand">
                    {formatCount(unread)}
                  </span>
                )}
              </Link>
            </>
          )}
          {user === undefined ? (
            <span className="skeleton ml-1 h-9 w-24 rounded-full" aria-hidden />
          ) : user ? (
            <>
              <div className="hidden md:block">
                <AccountMenu />
              </div>
              <Link
                href="/account"
                aria-label="Account"
                className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 md:hidden"
              >
                {initialOf(user.name)}
              </Link>
            </>
          ) : (
            <Link href="/login" className="btn-primary ml-1">
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
