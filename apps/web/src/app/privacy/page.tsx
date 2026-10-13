import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Placeholder, Section } from '@/components/legal-page';
import { legal } from '@/lib/legal';
import { getAppMeta } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Privacy policy' };

/**
 * DRAFT privacy policy (Phase 9). Written from what the platform actually stores (CLAUDE.md §7,
 * docs/security-audit-2026-10-09.md). A lawyer reviews it before launch; keep it in step with the code.
 */
export default async function PrivacyPage() {
  const { appName } = await getAppMeta();
  return (
    <LegalPage title="Privacy policy">
      <p>
        {appName} helps people find verified offers from local shops. It is built and run by {legal.company}, which
        decides how your personal data is used (the &ldquo;data fiduciary&rdquo; under India&rsquo;s Digital Personal Data
        Protection Act, 2023). This page explains what we collect, why, how long we keep it and how you control it.
      </p>

      <Section title="What we collect and why">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your account:</strong> your phone number or email address, your name, and your password, which we keep
            only as a one-way hash that nobody can read back. We use them to log you in and to send you the messages you ask
            for.
          </li>
          <li>
            <strong>Login security:</strong> one-time login codes (stored scrambled), your active sessions with the name of
            the browser or device, and for administrators their 2-step login settings (stored encrypted). We use them to
            keep accounts safe.
          </li>
          <li>
            <strong>If you register a shop:</strong> the shop&rsquo;s name, category, phone number, address, map location,
            opening hours, links and optional registration number; a shop photo for verification, and optionally a photo of
            you. Verification photos are seen only by our administrators. The other shop details, the logo and gallery
            photos, and your offers are shown publicly, because that is the purpose of the service.
          </li>
          <li>
            <strong>What you do on {appName}:</strong> offers you save, shops you follow, offers you report (the reason and
            your note), and your notifications and email choices.
          </li>
          <li>
            <strong>Usage counts:</strong> we count views of offer and shop pages <em>without</em> recording who viewed
            them. We count taps on Call, WhatsApp, Directions, Website and Share together with your account, or with a
            random visitor number kept in your browser if you are not logged in. We record what people search for, with the
            city and the number of results, without recording who searched; numbers of 5 or more digits and email addresses
            are removed from the search text. Shops see totals only, never who you are.
          </li>
          <li>
            <strong>Your location:</strong> when you use &ldquo;near me&rdquo;, your location is used only to answer that
            request. We never store it, and we remove it from our logs.
          </li>
          <li>
            <strong>Technical logs:</strong> our servers log requests (IP address, browser, page requested and time) to keep
            the service secure and fix problems. To limit abuse we also count requests per IP address in a scrambled form
            that is not stored. These logs are deleted automatically after a short time.
          </li>
        </ul>
        <p>
          In your browser we keep only your login (so you stay logged in) and the random visitor number. We use no
          advertising cookies and no third-party trackers.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>We do not sell your personal data. We share it only with:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Service providers that run the platform for us:</strong> Amazon Web Services (servers, database and
            backups, in Mumbai, India), Vercel (delivers the website), Google (sends our emails) and, once phone codes are
            switched on, an SMS provider in India. They may use the data only to provide their service to us.
          </li>
          <li>
            <strong>Everyone, for shop information:</strong> shop details and offers are public, as described above.
          </li>
          <li>
            <strong>Authorities,</strong> when the law requires it.
          </li>
        </ul>
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your account and what you do on {appName}: until you delete your account.</li>
          <li>Login codes: 90 days. Sessions: 90 days after they end.</li>
          <li>Notifications: 1 year.</li>
          <li>Usage counts and searches: 180 days. After that only daily totals remain, which contain no personal data.</li>
          <li>Record of administrator and shop actions (for example who approved an offer): 7 years.</li>
          <li>Backups: up to 60 days. Technical logs: deleted automatically, usually within a few weeks.</li>
        </ul>
      </Section>

      <Section title="Your rights and choices">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>See and correct your data:</strong> your name, contact details and settings are on your{' '}
            <Link href="/account" className="underline">Account</Link> page. For a summary of everything we hold about you,
            write to us (below).
          </li>
          <li>
            <strong>Delete your account:</strong> use &ldquo;Delete account&rdquo; on the Account page. We then erase your
            name, phone number, email, password, sessions, notifications, saved offers and follows. Shops you own are closed
            and their offers end. Taps you made stay counted, but no longer linked to you.
          </li>
          <li>
            <strong>Stop emails:</strong> every email has a &ldquo;Stop emails like this&rdquo; link, and you can choose
            which messages you get on the Account page.
          </li>
          <li>
            <strong>Complain:</strong> contact our grievance officer (below). If you are not satisfied with our answer, you
            may complain to the Data Protection Board of India.
          </li>
        </ul>
      </Section>

      <Section title="Children">
        <p>
          {appName} is meant for adults. You must be 18 or older to create an account.
        </p>
      </Section>

      <Section title="How we protect it">
        <p>
          Everything travels over encrypted connections (HTTPS). Passwords are hashed, administrator 2-step login secrets are
          encrypted, administrators must use 2-step login, and only the people who need personal data to run the service can
          see it.
        </p>
      </Section>

      <Section title="Contact and grievance officer">
        <p>
          {legal.company} · Email: <a className="underline" href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
          {' · '}Address: {legal.address ?? <Placeholder>Registered address</Placeholder>}
        </p>
        <p>
          Grievance officer:{' '}
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
      </Section>

      <Section title="Changes to this policy">
        <p>When we change this policy we will update this page and its date, and tell you in advance of important changes.</p>
      </Section>
    </LegalPage>
  );
}
