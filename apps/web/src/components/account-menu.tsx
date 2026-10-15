'use client';

import { Bell, Briefcase, ChevronDown, Heart, LogOut, ShieldCheck, Store, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ThemeSwitch } from './theme-switch';

/** The person's first letter, for the round avatar. */
export const initialOf = (name: string | null | undefined) => (name?.trim()?.[0] ?? '?').toUpperCase();

/**
 * Desktop account menu: everything that is "about me" in one place, so the top bar stays short.
 * Closes on outside click, Escape and navigation; the first item gets focus when it opens.
 */
export function AccountMenu() {
  const { user, can, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const isAdmin = can('businesses:read') || can('offers:read');

  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- close the menu on every navigation
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const item = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pr-2.5 pl-1 shadow-sm transition hover:border-gray-300"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {initialOf(user.name)}
        </span>
        <span className="max-w-32 truncate text-sm font-semibold text-gray-800">{user.name ?? 'Account'}</span>
        <ChevronDown className={`size-4 text-gray-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-40 mt-2 w-64 animate-fade-up rounded-2xl border border-gray-200 bg-white p-2 shadow-pop"
        >
          <Link role="menuitem" href="/account" className={item}>
            <UserRound className="size-4" aria-hidden /> Account
          </Link>
          <Link role="menuitem" href="/saved" className={item}>
            <Heart className="size-4" aria-hidden /> Saved offers
          </Link>
          <Link role="menuitem" href="/following" className={item}>
            <Store className="size-4" aria-hidden /> Shops you follow
          </Link>
          <Link role="menuitem" href="/notifications" className={item}>
            <Bell className="size-4" aria-hidden /> Notifications
          </Link>
          <div className="my-2 border-t border-gray-100" />
          <Link role="menuitem" href="/business" className={item}>
            <Briefcase className="size-4" aria-hidden /> For businesses
          </Link>
          {isAdmin && (
            <Link role="menuitem" href="/admin" className={item}>
              <ShieldCheck className="size-4" aria-hidden /> Admin
            </Link>
          )}
          <div className="my-2 border-t border-gray-100" />
          <div className="px-1 pb-1">
            <ThemeSwitch />
          </div>
          <button
            type="button"
            role="menuitem"
            className={`${item} w-full text-red-700`}
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
          >
            <LogOut className="size-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
