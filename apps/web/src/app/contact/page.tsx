import type { Metadata } from 'next';
import { LegalPage, Placeholder, Section } from '@/components/legal-page';
import { legal } from '@/lib/legal';
import { getAppMeta } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Contact' };

/** DRAFT contact page (Phase 9). */
export default async function ContactPage() {
  const { appName } = await getAppMeta();
  return (
    <LegalPage title={`Contact ${appName}`}>
      <p>
        {appName} is built and run by {legal.company}. We usually reply by email within a few working days.
      </p>

      <Section title="Email us">
        <p>
          <a className="underline" href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>: questions, help with your
          account or shop, and requests about your personal data.
        </p>
      </Section>

      <Section title="A problem with an offer?">
        <p>
          Open the offer and use <strong>Report this offer</strong>. Our team reviews every report and can warn or suspend the shop.
          For a dispute about a purchase, please contact the shop first: its phone number and address are on its page.
        </p>
      </Section>

      <Section title="Shop owners">
        <p>
          To list your shop, open &ldquo;For businesses&rdquo; and choose &ldquo;Register a business&rdquo;. If your shop or an offer was rejected,
          the reason is shown on your dashboard; reply to it by email if you need help.
        </p>
      </Section>

      <Section title="Grievance officer and address">
        <p>
          Grievance officer (personal data):{' '}
          {legal.grievanceOfficer ? (
            <>
              {legal.grievanceOfficer.name},{' '}
              <a className="underline" href={`mailto:${legal.grievanceOfficer.email}`}>
                {legal.grievanceOfficer.email}
              </a>
            </>
          ) : (
            <Placeholder>Name and email</Placeholder>
          )}
        </p>
        <p>Postal address: {legal.address ?? <Placeholder>Registered address</Placeholder>}</p>
      </Section>
    </LegalPage>
  );
}
