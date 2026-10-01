import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import { AuthProvider } from '@/lib/auth';
import { getAppMeta } from '@/lib/server-api';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const meta = await getAppMeta();
  return {
    title: { default: `${meta.appName} · Local offers near you`, template: `%s · ${meta.appName}` },
    description: 'Verified offers from local shops near you.',
    robots: meta.preview ? { index: false, follow: false } : undefined,
  };
}

export const viewport: Viewport = { themeColor: '#ea580c', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request so Next.js can apply the CSP nonce from proxy.ts (ADR-0014).
  await connection();
  const meta = await getAppMeta();
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <AuthProvider meta={meta}>
          <Header />
          {meta.preview && (
            <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
              Preview version for the team. Data may be reset.
            </div>
          )}
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-gray-500">
            © {meta.appName}. Offers are provided by the businesses listed.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
