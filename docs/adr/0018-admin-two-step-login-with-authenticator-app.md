# ADR-0018: 2-step login for admins with an authenticator app (TOTP)

- **Status:** Accepted (product owner, 2026-10-09: "Authenticator app")
- **Date:** 2026-10-09

## Context
The Phase 8 security audit found that admin accounts were protected by one factor only: a password or a login code. An admin can verify businesses, approve offers, suspend accounts and read private verification photos, so a leaked password would expose the whole platform.

Options the owner was shown:
1. An email code at every admin login (uses the existing email login).
2. **An authenticator app (TOTP, RFC 6238): Google Authenticator, Microsoft Authenticator or similar (chosen).**
3. Nothing until launch.

An emailed code is weaker when the password and the mailbox share a weakness (the same reused password, or a compromised mailbox). An authenticator app keeps the second factor on the admin's phone, works offline and costs nothing.

## Decision
**Which accounts**
- Every **admin permission** requires a session that passed the authenticator step. In practice that is every Admin and Super admin; customer and shop accounts are unaffected.
- The backend enforces it in `PermissionsGuard`:
  - a session without the step gets `403 MFA_SETUP_REQUIRED` (not set up yet) or `MFA_REQUIRED` (set up; log in again);
  - the guard also checks the database, so resetting or removing someone's authenticator ends their admin access at once, not when their 15-minute access token expires.
- Any user may turn it on; the website offers it to admins (and to anyone who already has it on).

**Logging in**
- Code, password and forgot-password logins all end in one shared step:
  - with 2-step login on, the response is `{ mfaRequired, mfaToken }` instead of tokens;
  - the 5-minute `mfaToken` is signed with a separate key (derived from `JWT_ACCESS_SECRET`) and audience, so it can never be used as an access token;
  - `POST /auth/mfa/verify` with the 6-digit code (or a recovery code) starts the session.
- A forgot-password reset can't skip the step.
- The session remembers the step: a `mfa` flag on the refresh-token row and in the access token, kept on every rotation.

**Setting it up**
- `POST /me/mfa/setup` returns a new 160-bit secret, an `otpauth://` link and a QR code (PNG data URL made on the server with `qrcode` 1.5.4). The pending secret is held in Valkey for 10 minutes.
- `POST /me/mfa/enable` with the first code turns it on, returns 10 single-use recovery codes (shown once) and a fresh session that passed the step. Every other session ends.

**Codes**
- HMAC-SHA1, 30-second steps, 6 digits, ±1 step of clock drift.
- A code works once (`last_step`), and two requests at the same moment can't both use it.
- 5 wrong codes (app or recovery) lock the step for 15 minutes.
- The implementation is our own (`modules/auth/totp.ts`, Node crypto only), checked against the RFC 6238 test vectors.

**Storage**
- `user_mfa`: the secret encrypted with AES-256-GCM, the key derived (HKDF) from `OTP_HASH_SECRET`; `last_step`; `enabled_at`.
- `mfa_recovery_codes`: SHA-256 hashes only.
- `refresh_tokens.mfa`.

**Lost phone**
- One of the recovery codes.
- A Super admin's "Reset 2-step login" on the user's page (`roles:assign`, audited).
- On the server, `admin:reset-mfa --email|--phone` (audited), e.g. when the only Super admin lost their phone.

**Audit actions:** `MFA_ENABLED`, `MFA_DISABLED`, `MFA_RESET`, `MFA_RECOVERY_CODE_USED`, `MFA_RECOVERY_CODES_RENEWED`.

## Consequences
- **After deploy:** every existing admin (including the first Super admin on the preview) must set up an authenticator at their next admin visit; the website shows the setup in place of the admin pages.
- **Secret rotation:** rotating `OTP_HASH_SECRET` (planned at launch, Phase 9) makes every stored authenticator secret unreadable. Admins must be reset with `admin:reset-mfa` and set it up again. This is written into the Phase 9 rotation checklist.
- **Mobile apps:** they must handle the `{ mfaRequired, mfaToken }` login answer (only admins see it).
- **Tests:** integration tests use a `makeAdmin()` helper that sets up the authenticator through the real API.
