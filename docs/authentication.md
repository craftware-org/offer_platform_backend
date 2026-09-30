# Authentication

Phone number + one-time code (OTP). There are no passwords. Registration and login are the same flow ([ADR-0006](adr/0006-auth-phone-otp-and-tokens.md)).

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

`DELETE /api/v1/auth/account` erases phone, name and email, sets the status to `DELETED`, removes roles and revokes every session, in one transaction. The row itself is kept so audit history and references stay intact. The same phone can later register as a brand-new account.

## Email login (Phase 4)

The same flow works with an email address: `POST /auth/otp/request {"email": "…"}`, then `verify`. It has identical protections (HMAC-stored single-use codes, 5 attempts, 5-minute expiry, rate limits). Codes are sent through SMTP (`EMAIL_PROVIDER=smtp`, Gmail App Password on the preview server).

**Account-safety rule:** an email that someone only *typed* into their profile (`emailVerified: false`) never logs anyone into that account. Otherwise an attacker could pre-register a victim's email and wait for the victim to "log in" (pre-account hijacking). When someone proves control of the inbox by entering the emailed code, any unproven claim on that address is removed (audited as `UNVERIFIED_EMAIL_RELEASED`), and they log into their own account. Changing the profile email makes it unverified again.

Phone and email logins are separate accounts for now. Linking both to one account is future work.

## Preview mode

On the team-only preview server (`PREVIEW_MODE=true`, [ADR-0013](adr/0013-preview-staging-on-single-ec2.md)), codes for channels without a real provider are written to the server log. Configuration validation refuses `PREVIEW_MODE` in production.
