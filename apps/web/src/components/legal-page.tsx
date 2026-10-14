import Link from 'next/link';
import type { ReactNode } from 'react';
import { legal } from '@/lib/legal';

/** Frame for the privacy, terms and contact pages: a visible draft notice and readable text. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="card mx-auto max-w-3xl space-y-5 text-sm leading-relaxed text-gray-800">
      <div role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
        <strong>Draft, under review.</strong> This page is a working draft dated {legal.draftDate}. It is not final until
        it has been reviewed and published as final.
      </div>
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      {children}
      <p className="border-t pt-4 text-xs text-gray-500">
        See also: <Link href="/privacy" className="underline">Privacy policy</Link> ·{' '}
        <Link href="/terms" className="underline">Terms of use</Link> ·{' '}
        <Link href="/contact" className="underline">Contact</Link>
      </p>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

/** A value the owner still has to provide, shown clearly instead of being guessed. */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 text-amber-900">[{children}: to be provided]</mark>;
}
