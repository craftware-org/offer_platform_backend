import type { Metadata } from 'next';
import Link from 'next/link';
import { getAppMeta } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Terms of use' };

const CONTACT = 'craftwaretech@gmail.com';
const UPDATED = '11 October 2026';

/** Terms for the website and the Android app. DRAFT, to be reviewed by the product owner before launch. */
export default async function TermsPage() {
  const { appName } = await getAppMeta();
  return (
    <article className="card mx-auto max-w-3xl space-y-4 text-sm leading-6 text-gray-800">
      <h1 className="text-2xl font-bold">Terms of use</h1>
      <p className="text-gray-500">Last updated {UPDATED}</p>
      <p>
        {appName} is run by <strong>Craftware</strong>. By using the website or the app you agree to these terms. Our{' '}
        <Link className="text-brand-700 underline" href="/privacy">
          privacy policy
        </Link>{' '}
        explains how we handle your data.
      </p>

      <h2 className="pt-2 text-lg font-semibold">What {appName} is</h2>
      <p>
        A free platform where local shops publish offers and customers find them. We do not sell products, take payments or
        deliver anything. Any purchase is between you and the shop.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Offers</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Each offer is written by the shop. We check shops and review every offer before it is shown, but the shop is responsible for honouring it.</li>
        <li>Prices, stock and dates can change; confirm with the shop before you travel or buy.</li>
        <li>If an offer is wrong or misleading, use “Report this offer”. We may hide offers or suspend shops.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">Shops</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Give true details and photos of a real business you are allowed to represent.</li>
        <li>Publish only genuine offers you will honour, with clear terms. No illegal, offensive or misleading content.</li>
        <li>You keep ownership of your photos and text and allow us to show them on {appName} to run the service.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">Your account</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Keep your password and login codes private. You are responsible for activity on your account.</li>
        <li>Do not misuse the service: no fake reports, scraping, spam or attempts to break security.</li>
        <li>We may suspend accounts that break these terms. You can delete your account at any time.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">Liability</h2>
      <p>
        The service is provided free and “as is”. To the extent the law allows, Craftware is not liable for losses arising
        from offers, shops or purchases made through {appName}.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Law and contact</h2>
      <p>
        These terms are governed by the laws of India; courts in Karnataka have jurisdiction. Questions:{' '}
        <a className="text-brand-700 underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        .
      </p>
    </article>
  );
}
