import type { Metadata } from 'next';
import { getAppMeta } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Privacy policy' };

const CONTACT = 'craftwaretech@gmail.com';
const UPDATED = '11 October 2026';

/**
 * Privacy policy for the website and the Android app (Google Play needs its URL). It describes what
 * the code does today: keep it in sync when data handling changes (CLAUDE.md §7, docs/mobile.md).
 * DRAFT written from the code, to be reviewed by the product owner before the public launch.
 */
export default async function PrivacyPage() {
  const { appName } = await getAppMeta();
  return (
    <article className="card mx-auto max-w-3xl space-y-4 text-sm leading-6 text-gray-800">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p className="text-gray-500">Last updated {UPDATED}</p>
      <p>
        {appName} is a local offers platform built and run by <strong>Craftware</strong> (“we”). This policy explains what
        we collect on the {appName} website and Android app, why, how long we keep it and your choices. We follow India’s
        Digital Personal Data Protection Act, 2023.
      </p>

      <h2 className="pt-2 text-lg font-semibold">What we collect and why</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Account:</strong> your mobile number or email address (to log in and to send login codes), your name, and
          your password, stored only as a one-way hash.
        </li>
        <li>
          <strong>Location:</strong> if you tap “Use my location”, your approximate position (rounded to about 11 metres)
          is sent with that search to find nearby offers. We do not store it, track you or use it in the background.
        </li>
        <li>
          <strong>Shops:</strong> if you register a business, its details, address and map position, and the photos you
          upload (shop front, optional owner photo, logo, gallery, offer photos). Location data inside photos is removed
          when they are uploaded. Verification photos are seen only by you and our admins.
        </li>
        <li>
          <strong>Activity:</strong> offers you save, shops you follow, reports you send, and counts of views, shares and
          taps on Call, WhatsApp, Directions and Website, and the words typed into search. If you are not logged in, these
          are linked only to a random id created by your browser or app, not to you. Shops see totals, never who you are.
        </li>
        <li>
          <strong>Technical:</strong> server logs with IP address and device type, used for security and to stop abuse.
          Phone numbers and positions are masked in logs.
        </li>
      </ul>
      <p>We do not sell your data, show third-party advertising or use your data for advertising.</p>

      <h2 className="pt-2 text-lg font-semibold">Who processes it for us</h2>
      <p>
        Our servers run on Amazon Web Services in Mumbai, India; the website is served by Vercel; emails are sent through
        Google (Gmail). They process data only to run the service for us. Phone codes will be sent by an SMS provider
        registered in India. We share data with authorities only when the law requires it.
      </p>

      <h2 className="pt-2 text-lg font-semibold">How long we keep it</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Login codes and ended sessions: 90 days.</li>
        <li>Notifications: 1 year.</li>
        <li>Detailed view, tap and search records: 180 days (only daily totals are kept after that).</li>
        <li>The log of administrative actions: 7 years, for accountability.</li>
        <li>Your account: until you delete it.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">Your choices and rights</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>See and correct your name and email in Account.</li>
        <li>Choose which notifications you get, in the app and by email.</li>
        <li>
          <strong>Delete your account</strong> at any time in Account → Delete account (website or app). Your name, phone,
          email, password, saved offers, follows and notifications are erased; shops you own are closed. Past view and tap
          counts stay as anonymous totals.
        </li>
        <li>Turn off location access in your phone’s settings; you can still choose a city.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">Children</h2>
      <p>{appName} is meant for adults. Please do not use it if you are under 18.</p>

      <h2 className="pt-2 text-lg font-semibold">Security</h2>
      <p>
        All connections use HTTPS. Passwords are hashed with Argon2id, login codes and sessions are stored only as hashes,
        and admin accounts use 2-step login.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Contact and grievances</h2>
      <p>
        Questions, requests about your data, or complaints: email{' '}
        <a className="text-brand-700 underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        . We reply within 7 days. We will post changes to this policy on this page.
      </p>
    </article>
  );
}
