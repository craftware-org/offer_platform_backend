'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export function Header() {
  const { user, meta, can } = useAuth();
  const isAdmin = can('businesses:read') || can('offers:read');
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
        <Link href="/" className="text-lg font-bold text-brand-600">
          {meta.appName}
        </Link>
        <Link href="/search" className="text-gray-700 hover:text-brand-600">
          Search
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <Link href="/business" className="text-gray-700 hover:text-brand-600">
            For businesses
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-gray-700 hover:text-brand-600">
              Admin
            </Link>
          )}
          {user === undefined ? null : user ? (
            <Link href="/account" className="btn-secondary py-1.5">
              {user.name ?? 'Account'}
            </Link>
          ) : (
            <Link href="/login" className="btn-primary py-1.5">
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
