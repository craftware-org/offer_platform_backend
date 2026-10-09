# Authentication

Phone number or email + one-time code (OTP) to register and to verify; after that, **password** login ([ADR-0015](adr/0015-password-login.md)). Registration and code login are the same flow ([ADR-0006](adr/0006-auth-phone-otp-and-tokens.md)).

## Flow

1. `POST /api/v1/auth/otp/request` with `{ "phone": "98450 12345" }`. The number is normalised to E.164 (`+919845012345`, default country from `DEFAULT_PHONE_COUNTRY`). The response is the same whether or not an account exists.
2. The user receives a 6-digit code by SMS, valid for 5 minutes. A new request invalidates earlier codes.
3. `POST /api/v1/auth/otp/verify` with `{ "phone", "code" }`. The response contains:
   - `accessToken`: JWT (HS256), valid 15 minutes. Send it as `Authorization: Bearer <token>`.
   - `refreshToken`: an opaque random value, valid 30 days, **single use**.
   - `isNewUser`, `user`.
4. Before the access token expires, call `POST /api/v1/auth/refresh` with `{ "refreshToken" }` to get a new pair. The old refresh token stops working.
5. `POST /api/v1/auth/logout` with `{ "refreshToken" }` ends that session. The access token remains valid until it expires (at most 15 minutes).

## Protections

| Threat | Protection |
|---|---|
| Guessing codes | 5 attempts per code, counted atomically; 10 verifications per phone per 15 minutes |
| SMS bombing | 30 s resend cooldown; 5 codes per phone per hour; 20 per IP per hour |
| Database leak | Codes stored only as HMAC-SHA256 (keyed with `OTP_HASH_SECRET`, bound to the phone); refresh tokens stored only as SHA-256 |
| Stolen refresh token | Rotation with reuse detection: presenting an already-exchanged token revokes the whole session and writes an audit entry |
| Suspended/deleted user | The user is re-loaded on every request; suspended accounts get `ACCOUNT_SUSPENDED`, and deleted accounts' tokens stop working |
| Token forgery | Signature, algorithm (`HS256` only), issuer and audience are verified |
| Leaking secrets in logs | `Authorization` and cookie headers are redacted; phone numbers are masked in SMS logs |

## SMS provider

The real SMS vendor is **pending** (it needs TRAI DLT registration). Until then the `console` provider prints codes to the API log. Configuration validation **refuses to start** production (and staging without `PREVIEW_MODE`) with `SMS_PROVIDER=console`. A new vendor is a new `SmsProvider` implementation in `src/infrastructure/sms/`.

## Account deletion

`DELETE /api/v1/auth/account` erases personal data in one transaction (completed in Phase 8):
- the account: phone, name, email, password, verification dates; the status becomes `DELETED`; roles are removed;
- every session, every login code sent to the phone or email, 2-step login and recovery codes;
- notifications and notification settings, saved offers and follows; past taps stay counted but no longer point at the person;
- shops the person owns are **closed** (owner decision 2026-10-09): hidden everywhere, their offers end, the owner photo is deleted; the shop record stays for history.

The user row itself is kept so audit history and references stay intact. The same phone can later register as a brand-new account.

## 2-step login (Phase 8, [ADR-0018](adr/0018-admin-two-step-login-with-authenticator-app.md))

- **Required for admins:** every admin permission needs a session that passed the authenticator step. Without it the API answers `403 MFA_SETUP_REQUIRED` (not set up) or `MFA_REQUIRED` (log in again).
- **Setting it up:** `POST /me/mfa/setup` (QR code + key) → `POST /me/mfa/enable` with the first code. It returns 10 one-time recovery codes and a new session, and every other session ends.
- **Logging in:** code, password and forgot-password logins answer `{ mfaRequired, mfaToken }` instead of tokens. `POST /auth/mfa/verify` with the 6-digit app code, or a recovery code, finishes the login.
- **Protections:**
  - a code works once;
  - 5 wrong codes lock the step for 15 minutes;
  - secrets are encrypted at rest;
  - resetting or turning it off ends admin access immediately.
- **Lost phone:** a recovery code; a Super admin's "Reset 2-step login"; or on the server `admin:reset-mfa --email|--phone`.

## Retention (Phase 8)

A nightly job (03:00 IST) deletes:
- login codes after 90 days;
- ended sessions 90 days after they end;
- notifications after 1 year;
- activity-log entries after 7 years.

Owner decision 2026-10-09. Analytics has its own 180-day rule (ADR-0017).

## Email login (Phase 4)

The same flow works with an email address: `POST /auth/otp/request {"email": "…"}`, then `verify`. It has identical protections (HMAC-stored single-use codes, 5 attempts, 5-minute expiry, rate limits). Codes are sent through SMTP (`EMAIL_PROVIDER=smtp`, Gmail App Password on the preview server).

**Account-safety rule:** an email that someone only *typed* into their profile (`emailVerified: false`) never logs anyone into that account. Otherwise an attacker could pre-register a victim's email and wait for the victim to "log in" (pre-account hijacking). When someone proves control of the inbox by entering the emailed code, any unproven claim on that address is removed (audited as `UNVERIFIED_EMAIL_RELEASED`), and they log into their own account. Changing the profile email makes it unverified again.

Phone and email logins are separate accounts for now. Linking both to one account is future work.

## Passwords (ADR-0015)

| Step | Endpoint |
|---|---|
| Sign up / first login | `/auth/otp/request` + `/auth/otp/verify` (proves the email or phone). The website then asks for a name and a password. |
| Set the first password | `POST /auth/password` `{ password }` (logged in; only when none is set yet, otherwise 409) |
| Log in | `POST /auth/password/login` `{ email | phone, password }` → same response as `/auth/otp/verify` |
| Change | `POST /auth/password/change` `{ currentPassword, newPassword }` → new tokens; **every other session ends** |
| Forgot password | `/auth/otp/request`, then `POST /auth/password/reset` `{ email | phone, code, newPassword }` → tokens; **every session ends** |

**Rules:**
- 8–128 characters, counted as Unicode code points.
- Refused: very common passwords, the user's own email or phone number, and a single repeated character.
- No composition rules.
- Stored as **Argon2id** (Node built-in, m=19 MiB, t=2, p=1, PHC string). The hash is never returned; `users/me` has `hasPassword`.

**Protections:**

| Threat | Protection |
|---|---|
| Password guessing | 5 wrong passwords lock the account for 15 minutes (`RATE_LIMITED` + `Retry-After`). 30 tries per IP per 15 minutes. Change password has its own per-user lock. A successful login or reset clears the counter. |
| Finding out which accounts exist | One `INVALID_CREDENTIALS` error with equal hashing cost for unknown account, no password yet, or wrong password. Reset behaves like code login (a new identity gets an account). |
| Hijack via a typed email | Only **verified** emails work for password login. |
| Stolen session after a leak | Change and reset revoke every refresh token. |

## Preview mode

On the team-only preview server (`PREVIEW_MODE=true`, [ADR-0013](adr/0013-preview-staging-on-single-ec2.md)), codes for channels without a real provider are written to the server log. Configuration validation refuses `PREVIEW_MODE` in production.
