'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

/** Shows children only to a logged-in user (and, optionally, one with a permission). UI only: the API enforces access. */
export function RequireAuth({ permission, children }: { permission?: string; children: ReactNode }) {
  const { user, can } = useAuth();
  const pathname = usePathname();
  if (user === undefined) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!user) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="mb-4">Please log in to continue.</p>
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-primary">
          Log in
        </Link>
      </div>
    );
  }
  if (permission && !can(permission)) {
    return <p className="card text-sm text-gray-600">You don&apos;t have access to this page.</p>;
  }
  return <>{children}</>;
}
