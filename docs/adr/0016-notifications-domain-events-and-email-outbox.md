# ADR-0016: Notifications via in-process domain events and an email outbox

- **Status:** Accepted (product owner, 2026-10-08: inbox + email now, push later with the mobile apps)
- **Date:** 2026-10-08

## Context
Phase 6 adds notifications (spec §29), for example "offer approved", "shop verified", "a shop you follow posted an offer", "a saved offer ends tomorrow", and a daily admin summary. They are triggered from several modules:
- **businesses:** verification and suspension;
- **offers:** moderation, and the worker that makes scheduled offers live;
- **reports:** warnings.

To build a message, notifications need data from those same modules: who manages a business, who follows it, who saved an offer. If each module called the notifications module directly, the modules would depend on each other in a circle, and ADR-0002 says modules talk only through exported services.

Email goes through Gmail SMTP, which allows about 500 emails a day, can be slow, and can fail.

## Options considered
1. **Direct calls** from each module into notifications. This creates circular dependencies, and slow email would block admin actions.
2. **A message broker** (separate queue/topic per event). Robust, but heavy for a modular monolith run by a 3-person team.
3. **In-process domain events + a database outbox for email (chosen).**

## Decision
**Domain events:**
- A tiny global `DomainEvents` bus (`infrastructure/events`).
- Modules **announce** facts after their transaction commits, for example `offer.moderated`, `offer.went_live`, `business.status_changed`, `business.warned`.
- The notifications module subscribes and builds the messages, using the other modules' exported services.
- A failing handler is logged and **never** fails the action that announced the event.
- Both processes (API and worker) load the handlers, because the worker also announces `offer.went_live`.

**Inbox:**
- Every notification is a row in `notifications`. The website shows it in the 🔔 inbox, and it works for every account, including phone-only ones.

**Email outbox:**
- Rows that should also be emailed get `email_status = PENDING`.
- The worker sends pending emails every minute, claiming rows with `FOR UPDATE SKIP LOCKED` so several workers never send twice, and retries up to 3 times.
- Emails are sent only to **verified** addresses.
- Every email has a signed one-click unsubscribe link for that type.

**Owner rules (2026-10-08):**
- **Email audiences:** businesses and admins get email by default. Customers get the inbox only by default and can switch email on per type.
- **Customer limits:** **no daily email limit** (owner changed the proposed 5-a-day cap to "no limit" on 2026-10-08). Customers get **no emails 22:00–08:00 India time**; they wait until 08:00. Inbox entries are never limited.
- **Push:** added later with the mobile apps (FCM).
- **Not in this phase:** "nearby offer" alerts.

**De-duplication:**
- An optional `dedupe_key` (unique per user) stops repeats, for example one "ending tomorrow" message per offer, or one admin summary per day.

## Consequences
- Adding a notification means adding an event (if needed) and a handler. The modules announcing events stay unaware of notifications.
- In-process events are lost if the process crashes between commit and handling. This is acceptable for MVP notifications; the scheduled scans (ending soon, admin summary) are idempotent anyway. A durable event table can replace the bus later without changing the publishers.
- With no per-customer cap, the email defaults (customers inbox-only unless they opt in) are what keep volume inside Gmail's ~500/day. If many customers opt in, Gmail may start refusing mail: the outbox then marks those emails failed after 3 tries, while the inbox still has every message. Production should move to a transactional email provider on the real domain (Phase 9).
