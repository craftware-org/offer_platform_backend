# Security audit: 2026-10-09 (Phase 8)

**Scope:**
- the API (`apps/api`) and website (`apps/web`) at commit `feat/phase-8-security-audit`;
- the preview server (EC2, Docker Compose) and its backups.

**Method:**
- OWASP ASVS 4.0.3 level 2, walked chapter by chapter for the areas in the roadmap: authentication, sessions, access control, input, files, errors and logs, data protection, configuration and dependencies;
- automated checks: an every-route permission test, `pnpm audit`, a git-history secret scan;
- a backup restore drill.

**Author:** Claude (AI agent). Owner decisions were taken on 2026-10-09.

## Result
- **No open Critical or High findings.**
- **11 findings fixed**, each with an automated test or a recorded check.
- **3 decided by the owner** (rotate secrets at launch; retention periods; closing the shops of deleted owners).
- **6 low-risk items accepted by the owner** (2026-10-09). Each has a planned fix in Phase 9 or later.

## Findings

| # | Area (ASVS) | Finding | Severity | Status |
|---|---|---|---|---|
| F1 | V2 Authentication | Admin accounts used one factor only (password or login code). | High | **Fixed:** authenticator-app 2-step login required for every admin permission ([ADR-0018](adr/0018-admin-two-step-login-with-authenticator-app.md)). |
| F2 | V2 / V3 | While building F1: an admin whose authenticator was reset kept admin access until their 15-minute access token expired. | Medium | **Fixed:** the permission guard also checks the database (test: "a Super admin can reset a lost authenticator"). |
| F3 | V2 | Forgot-password could have become a way around the second step. | High (by design risk) | **Fixed:** all three login paths share one final step (test: "logins stop at the authenticator step"). |
| F4 | V4 Access control | Lower-role refusals were tested for 24 routes, not systematically. | Medium | **Fixed:** an automatic test reads every route from Nest's registry (over 100) and proves visitors get 401 on private routes, customers get 403 on admin routes, and admins without 2-step login get `MFA_SETUP_REQUIRED`. New routes are covered automatically. |
| F5 | V14 Dependencies | `pnpm audit`: source-map-js < 1.2.2 (High, event-loop DoS) and esbuild ≤ 0.24.2 (Moderate, dev-server CORS). Both used only at build or dev time. | Medium | **Fixed:** workspace overrides; `pnpm audit` reports no known vulnerabilities; drizzle-kit still works. |
| F6 | V8 Data protection | Account deletion left personal data behind: inbox and settings, saves, follows, user id on past taps, login codes sent to the phone or email, the phone-verified date, and the owner photo of shops they own. | Medium | **Fixed:** one transaction erases or unlinks all of it; owned shops are closed (owner decision): hidden, offers ended, owner photo deleted. Test: "account deletion erases personal data end to end". |
| F7 | V8 Data protection | No retention: login codes (phone or email), ended sessions (browser description), notifications and the activity log were kept forever. | Medium | **Fixed:** nightly job at 03:00 IST, with the owner's periods: login codes 90 days, ended sessions 90 days, notifications 1 year, activity log 7 years. Analytics keeps its own 180-day rule. |
| F8 | V11 / V4 | Public `POST /events` (Phase 7) could be used to inflate counts. | Low | **Fixed in Phase 7:** 30-minute dedupe, bot filter, cap per visitor and per IP. Re-checked here. |
| F9 | V8 | Search logs could hold emails or phone numbers people pasted. | Low | **Fixed in Phase 7:** digit runs of 5+ and email addresses masked. |
| F10 | V14 Secrets | Git history scanned (40 commits) for keys, tokens and passwords. | — | **Clean:** only `.env.example` templates were ever committed. |
| F11 | V14 Backups | Backups were never restored. | Medium | **Fixed:** `deploy/staging/restore-drill.sh`. Drill on 2026-10-09: the 02:30 backup restored in 2 s, PostGIS working, 12/12 migrations, table counts equal to live (one notification newer than the backup). |
| D1 | V14 Secrets | Rotate the database password, JWT and code-hashing secrets, and the Gmail App Password. | — | **Owner decision:** at launch only (Phase 9 checklist). Rotating `OTP_HASH_SECRET` also needs `admin:reset-mfa` for every admin (ADR-0018). |
| D2 | V8 | Retention periods. | — | **Owner decision:** "longer" set (F7). |
| D3 | V8 | Shops of an owner who deletes their account. | — | **Owner decision:** close them (F6). |
| A1 | V3 Sessions | The refresh token is in the browser's `localStorage` (readable by any script that runs on the site). Mitigated by the strict security policy (per-request nonce, no inline scripts) and 30-day single-use rotation with reuse detection. | Low | **Accepted by the owner (2026-10-09)** until Phase 9 moves it to an httpOnly cookie on the real shared domain (ADR-0014). |
| A2 | V14 Headers | The website allows inline styles (`style-src 'unsafe-inline'`), used by the CSS framework and chart bars. Scripts stay nonce-only. | Low | **Accepted by the owner (2026-10-09):** inline styles can't run code. |
| A3 | V14 Config | Interactive API docs (`/api/docs`) are public on the preview (they are off when `NODE_ENV=production`). | Low | **Accepted by the owner (2026-10-09)** for the preview; Phase 9 switch-over sets production. |
| A4 | V2 | Phone login codes are written to the server log in preview mode (no SMS provider yet). | Low | **Accepted by the owner (2026-10-09)** for the team-only preview; Phase 9 adds the SMS provider and turns preview mode off. |
| A5 | V8 | Reports keep the reporter's note after the reporter deletes their account (shown as "Deleted user"). | Low | **Accepted by the owner (2026-10-09):** moderation records; the note is about an offer, not the person. |
| A6 | V14 Infrastructure | Backups sit on the same disk as the database; no monitoring or alerts. | Medium (for launch) | **Accepted by the owner (2026-10-09) for the preview;** Phase 9 moves to RDS with automated backups, S3 copies and alarms. |

## Checked and fine (no change needed)
- **Headers:**
  - API (helmet): HSTS 1 year, nosniff, `frame-ancestors 'self'`, CSP, no-referrer.
  - Website: nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS, Permissions-Policy.
- **Login codes:** hashed (HMAC), single use, limited per IP, per destination and per hour. The same response for new and existing accounts (no account discovery).
- **Passwords:** Argon2id; common passwords refused; 5 wrong tries lock the account for 15 minutes, plus a per-IP limit.
- **Sessions:** 15-minute access tokens; refresh tokens single use, stored hashed; reuse revokes the whole session family.
- **Access control:**
  - the backend is the authority, and shop data is scoped by membership: others get 404, not 403, so ids can't be probed;
  - suspended users are refused on every request.
- **Input:** Zod on every endpoint; JSON body size limit; parameterised SQL only.
- **Uploads:** 8 MB, one file, real image type checked, pixel limit against decompression bombs, metadata (including GPS) removed, re-encoded to WebP. Private photos are served only to the shop and admins.
- **Errors and logs:** unexpected errors return a generic message and are logged with a request id. Logs redact authorization headers and cookies and never include request bodies; coordinates and phone numbers are masked.
- **CORS:** only the configured website origin.
- **Rate limits:** per IP on every request, plus specific limits for codes, passwords, authenticator codes, reports, uploads and events.

## How to repeat this audit
- `pnpm audit`
- the integration tests (`test/security.e2e-spec.ts` covers routes, 2-step login, deletion and retention)
- `bash deploy/staging/restore-drill.sh` on the server
- the git-history scan in the Phase 8 change log of [CLAUDE.md](../CLAUDE.md)
