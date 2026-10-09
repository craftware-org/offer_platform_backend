'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { TwoStepSettings } from '@/components/two-step-settings';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Admin sections; each is shown only to admins with its permission (the API enforces it anyway). */
const SECTIONS: { href: string; label: string; permission: string }[] = [
  { href: '/admin', label: 'Review', permission: 'businesses:read' },
  { href: '/admin/insights', label: 'Insights', permission: 'analytics:read' },
  { href: '/admin/reports', label: 'Reports', permission: 'reports:moderate' },
  { href: '/admin/users', label: 'Users', permission: 'users:read' },
  { href: '/admin/categories', label: 'Categories', permission: 'categories:manage' },
  { href: '/admin/locations', label: 'Cities & areas', permission: 'locations:manage' },
  { href: '/admin/settings', label: 'Settings', permission: 'settings:manage' },
  { href: '/admin/activity', label: 'Activity log', permission: 'audit:read' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const pathname = usePathname();
  const visible = SECTIONS.filter((s) => can(s.permission));
  const isAdmin = visible.length > 0;
  // Admin work needs 2-step login (ADR-0018); the API enforces it, this only shows the way.
  const [twoStep, setTwoStep] = useState<'checking' | 'on' | 'off'>('checking');
  useEffect(() => {
    if (!isAdmin) return;
    api<{ enabled: boolean }>('/me/mfa')
      .then((s) => setTwoStep(s.enabled ? 'on' : 'off'))
      .catch(() => setTwoStep('on')); // let the pages show the API's own message
  }, [isAdmin]);
  const isActive = (href: string) =>
    href === '/admin'
      ? pathname === '/admin' || pathname.startsWith('/admin/businesses') || pathname.startsWith('/admin/offers')
      : pathname.startsWith(href);

  return (
    <div className="space-y-4">
      {visible.length > 0 && (
        <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3" aria-label="Admin sections">
          {visible.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={isActive(s.href) ? 'btn-primary py-1.5' : 'btn-secondary py-1.5'}
              aria-current={isActive(s.href) ? 'page' : undefined}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}
      {isAdmin && twoStep === 'off' ? (
        <div className="max-w-xl space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            To use the admin area, set up 2-step login first. It keeps the admin area safe even if your password leaks.
          </p>
          <TwoStepSettings onDone={() => setTwoStep('on')} />
        </div>
      ) : isAdmin && twoStep === 'checking' ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        children
      )}
    </div>
  );
}
