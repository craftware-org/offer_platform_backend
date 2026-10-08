# ADR-0017: Analytics: anonymous counting, daily rollups, a read-only reporting module and hand-drawn charts

- **Status:** Accepted (product owner, 2026-10-08: count everyone, record searches, 180-day raw retention, weekly business summary)
- **Date:** 2026-10-08

## Context
Phase 7 (spec §30) gives businesses a performance dashboard and admins a platform dashboard. Phase 5 already records saves, follows, shares and contact taps in `analytics_events` (logged-in users only, owner decision 2026-10-03), and declared every event type of the specification. Missing:
- page views of offers and shops;
- searches;
- totals by day, so dashboards stay fast and history survives deleting old raw events;
- charts.

With views from logged-in users only, the numbers would be close to zero, and counting views from everyone but taps from logged-in users only would make "taps per view" meaningless.

## Options considered
**Who is counted:** logged-in users only (Phase 5 rule) · views from everyone, taps logged-in only · **everyone, for views and taps (chosen by the owner)**.

**How a visitor is recognised:** IP address (many Indian mobile users share one IP, and storing it is personal data) · a cookie set by the API (the API and website are on different domains) · **a random id kept in the browser's localStorage, sent with each event (chosen)**.

**Dashboard data:** query raw events every time (slow, and history disappears when raw events are deleted) · **daily totals written by the worker, plus raw events for the most recent days (chosen)**.

**Charts:** a chart library (Recharts, Chart.js, …) · **small SVG/CSS charts written in the app (chosen)**.

## Decision
**Counting (owner rules, 2026-10-08):**
- Views (`OFFER_VIEWED`, `BUSINESS_VIEWED`) and taps are recorded for **everyone** through `POST /events`, now `@OptionalAuth()`: a valid token identifies a user; anonymous callers send a random `visitorId` (UUID) that the browser keeps.
- The same user or visitor doing the same thing again within **30 minutes** counts once (a short-lived Valkey key).
- Anonymous events are also capped at 1,000 per IP address per hour (a hashed, short-lived key), so one machine can't inflate numbers by inventing visitor ids; extra events are skipped quietly. The cap is high because many mobile users share one IP.
- Views are sent by the browser after the page shows, so link previews and most bots never count. The API also skips anonymous requests whose User-Agent looks like a bot or script, or that have none.
- Views by the shop's own staff and by admins are not counted.
- **Views never store who viewed** (`user_id` is null). Taps by logged-in users keep the user id, as in Phase 5. No IP address, location or device is ever stored.

**Searches:**
- The discovery endpoint records typed searches (first page only) in `search_logs`: the normalized words (lower case; digit runs of 5+ and email addresses replaced by `#`), the city and the number of results. No user.
- The same words from the same visitor within 30 minutes count once. The visitor key is a keyed hash of IP + User-Agent, kept only in Valkey for those 30 minutes.

**Daily totals and retention:**
- `analytics_daily` holds one row per India-time day, business, offer (null = the shop page) and event type.
- The worker rebuilds the two days before today every night at 00:30 IST, plus any days missed since its last run, and also once when it starts. Each day is replaced in one transaction, so re-running never double counts.
- Dashboards read daily totals for days before yesterday and raw events for yesterday and today, so they are never a day behind.
- Raw events and search logs are deleted after **180 days**; daily totals are kept forever.

**Module boundaries:**
- The new `analytics` module is a **read-only reporting module**, like discovery in ADR-0002: it may read other modules' tables for aggregate numbers, but writes only its own (`analytics_daily`, `search_logs`).
- Raw events stay owned by the engagement module, which records and purges them.
- The weekly business summary goes through the notifications module's exported `notify()` (ADR-0016), as the new type `BUSINESS_WEEKLY_SUMMARY`, on Mondays at 09:00 IST.

**Charts:**
- Bar and line charts are plain SVG drawn by our own components; lists use CSS bars.
- Nothing extra to download, nothing that conflicts with the site's security policy, and fast on low-end phones.
- Each chart is hidden from screen readers, which read a one-line text summary instead.

## Consequences
- Businesses see real interest, not only from logged-in customers. Numbers are approximate by nature: clearing the browser storage or switching browsers counts as a new visitor.
- The Phase 5 endpoint `/me/businesses/:id/engagement` still returns all-time taps from raw events, which now cover only the last 180 days. The website uses the new insights endpoint instead.
- Adding a metric means adding an event type (an enum migration) and mapping it in the analytics service; old days have zero for it.
- If the dashboards get slow at scale, the next step is summary tables per week/month or a column store. The API shape need not change.
- Moving to more advanced charts later only replaces the chart components.
