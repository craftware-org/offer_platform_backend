import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Placeholder, Section } from '@/components/legal-page';
import { legal } from '@/lib/legal';
import { getAppMeta } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Terms of use' };

/** DRAFT terms of use (Phase 9). A lawyer reviews them before launch. */
export default async function TermsPage() {
  const { appName } = await getAppMeta();
  return (
    <LegalPage title="Terms of use">
      <p>
        These terms apply when you use {appName}, a service built and run by {legal.company}. By creating an account or
        using the service you agree to them. Please also read our <Link href="/privacy" className="underline">privacy
        policy</Link>.
      </p>

      <Section title="1. The service">
        <p>
          {appName} lets local shops publish offers and lets people nearby find them. It is free for shops and customers.
          If we ever introduce paid features, we will announce them in advance, and nothing will be charged without your
          agreement.
        </p>
        <p>
          We do not sell the products or services in the offers. Each offer is made by the shop that published it, and any
          purchase is between you and that shop.
        </p>
      </Section>

      <Section title="2. Your account">
        <ul className="list-disc space-y-1 pl-5">
          <li>You must be 18 or older.</li>
          <li>Give correct details, keep your password and login codes to yourself, and tell us if someone else uses your account.</li>
          <li>You can delete your account at any time from the Account page.</li>
        </ul>
      </Section>

      <Section title="3. Rules for shops">
        <ul className="list-disc space-y-1 pl-5">
          <li>Register only a shop you own or are allowed to represent, with true details and photos.</li>
          <li>
            Offers must be real and honest: correct prices, conditions and dates, and you must honour them while they are
            live.
          </li>
          <li>
            Every shop and every offer is reviewed by our team before it appears. &ldquo;Verified&rdquo; means we checked
            the shop&rsquo;s details and photos; it is not a guarantee of the shop, its products or its offers.
          </li>
          <li>
            You allow us to show your shop details, photos and offers on {appName} and in links shared from it, for as long
            as they are published.
          </li>
          <li>
            We may reject or change-request an offer, suspend an offer or a shop, or warn a shop, for example after reports
            from customers.
          </li>
        </ul>
      </Section>

      <Section title="4. Rules for everyone">
        <p>Do not:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>post false, misleading, offensive or illegal content;</li>
          <li>send false reports or misuse the report button;</li>
          <li>use bots or scripts to copy content or to inflate views and taps;</li>
          <li>try to break into accounts or our systems, or overload them.</li>
        </ul>
        <p>We may suspend accounts that break these rules.</p>
      </Section>

      <Section title="5. Our responsibility">
        <p>
          We work to keep {appName} accurate and available, but offers come from shops and can change, sell out or end
          early, and the service may sometimes be unavailable. To the extent the law allows, {legal.company} is not
          responsible for a shop&rsquo;s products, services or offers, or for losses arising from them. Nothing in these
          terms limits rights you have under Indian consumer law.
        </p>
      </Section>

      <Section title="6. Changes and law">
        <p>
          We may update these terms; we will change the date on this page and tell you in advance of important changes.
          These terms are governed by the laws of India. Disputes go to the courts of{' '}
          {legal.jurisdiction ?? <Placeholder>City for court jurisdiction</Placeholder>}.
        </p>
      </Section>

      <Section title="7. Contact">
        <p>
          Questions about these terms: <a className="underline" href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>.
          See also the <Link href="/contact" className="underline">contact page</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
