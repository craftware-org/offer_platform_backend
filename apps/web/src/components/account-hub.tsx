'use client';

import { Bell, Briefcase, ChevronRight, Heart, ShieldCheck, Store } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { initialOf } from './account-menu';
import { ThemeSwitch } from './theme-switch';

/**
 * Top of the Account page: who you are and every place that is "yours". On phones the Account
 * tab is the way into following, the business portal and admin, so they are listed here.
 */
export function AccountHub() {
  const { user, can } = useAuth();
  if (!user) return null;
  const isAdmin = can('businesses:read') || can('offers:read');
  const links = [
    { href: '/saved', label: 'Saved offers', Icon: Heart },
    { href: '/following', label: 'Shops you follow', Icon: Store },
    { href: '/notifications', label: 'Notifications', Icon: Bell },
    { href: '/business', label: 'For businesses', hint: 'List your shop and offers', Icon: Briefcase },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', hint: 'Reviews, shops, users', Icon: ShieldCheck }] : []),
  ];
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-xl font-extrabold text-brand-700">
          {initialOf(user.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-gray-900">{user.name ?? 'Your account'}</h1>
          <p className="truncate text-sm text-gray-500">{user.email ?? user.phone}</p>
        </div>
      </div>
      <nav aria-label="Your places" className="card divide-y divide-gray-100 p-0">
        {links.map(({ href, label, hint, Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-gray-50">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-gray-900">{label}</span>
              {hint && <span className="block text-xs text-gray-500">{hint}</span>}
            </span>
            <ChevronRight className="size-4 text-gray-400" aria-hidden />
          </Link>
        ))}
      </nav>
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Appearance</h2>
        <ThemeSwitch />
      </div>
    </section>
  );
}
