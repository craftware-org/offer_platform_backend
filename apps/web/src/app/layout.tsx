import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import Link from 'next/link';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/bottom-nav';
import { SiteHeader } from '@/components/site-header';
import { AuthProvider } from '@/lib/auth';
import { EngagementProvider } from '@/lib/engagement';
import { getAppMeta } from '@/lib/server-api';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import './globals.css';

// Self-hosted by Next.js at build time: no request to Google from the visitor's browser.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const meta = await getAppMeta();
  return {
    title: { default: `${meta.appName} · Local offers near you`, template: `%s · ${meta.appName}` },
    description: 'Verified offers from local shops near you.',
    robots: meta.preview ? { index: false, follow: false } : undefined,
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1917' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request so Next.js can apply the CSP nonce from proxy.ts (ADR-0014).
  await connection();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const meta = await getAppMeta();
  return (
    // The theme attribute is set by the boot script before React hydrates.
    <html lang="en" className={jakarta.variable} data-theme="light" suppressHydrationWarning>
      <head>
        {/* oxlint-disable-next-line react/no-danger -- a fixed constant (no user input), allowed by the CSP nonce */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans text-gray-900 antialiased">
        <AuthProvider meta={meta}>
          <EngagementProvider>
            <SiteHeader />
            {meta.preview && (
              <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
                Preview version for the team. Data may be reset.
              </div>
            )}
            <main className="mx-auto w-full max-w-6xl animate-fade-up px-4 pt-6 pb-28 md:pb-12">{children}</main>
            <footer className="border-t border-gray-200/70 bg-white pb-24 md:pb-0">
              <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  © {meta.appName} · Offers from local businesses, or listed by us from brands&apos; public pages.
                </span>
                <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1 font-medium">
                  <Link href="/privacy" className="hover:text-gray-800">
                    Privacy
                  </Link>
                  <Link href="/terms" className="hover:text-gray-800">
                    Terms
                  </Link>
                  <Link href="/contact" className="hover:text-gray-800">
                    Contact
                  </Link>
                  <Link href="/business" className="hover:text-gray-800">
                    For businesses
                  </Link>
                </nav>
              </div>
            </footer>
            <BottomNav />
          </EngagementProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
