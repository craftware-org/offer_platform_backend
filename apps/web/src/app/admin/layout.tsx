'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

/** Admin sections; each is shown only to admins with its permission (the API enforces it anyway). */
const SECTIONS: { href: string; label: string; permission: string }[] = [
  { href: '/admin', label: 'Review', permission: 'businesses:read' },
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
      {children}
    </div>
  );
}
