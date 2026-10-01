# ADR-0015: Password login after a one-time verification code

- **Status:** Accepted (product owner, 2026-10-01). Extends ADR-0006; codes remain for sign-up, verification and recovery.
- **Date:** 2026-10-01

## Context
ADR-0006 chose passwordless login: a one-time code on every login. Sessions last 30 days, so a code is needed only after logout, on a new device or after a month away. In practice shop owners and customers log out and switch devices, and waiting for a code each time is friction. Email delivery depends on Gmail, and SMS has no vendor yet. The product owner asked for passwords. The email or phone is still verified once with a code, and a forgotten password is reset with a code.

## Options considered
1. **Keep codes only.** Simplest and nothing to leak. Cons: friction on every new login; fully dependent on SMS/email delivery.
2. **Passwords, verified identity, code recovery (chosen).** Familiar, and works when delivery is slow. Cons: a hash to protect; guessing attacks need limits.
3. **Passkeys / social login.** Strong, but most target users don't know passkeys, and Google login would add a vendor dependency. Can be added later.

## Decision
**Flow:**
- Sign-up and first login use a code (proves the email or phone).
- The welcome step then asks for a name and a **password**.
- Later logins: email or phone + password. "Log in with a code instead" stays available.
- Forgot password: request a code, then `POST /auth/password/reset` with the code and a new password.
- Applies to **email and phone** accounts (owner's choice). Phone reset needs SMS, which in preview means the code comes from the server log.

**Rules (owner's choice: "standard"):**
- 8 to 128 characters, counted as Unicode code points.
- A list of very common passwords is refused, as are the user's own email/phone and single repeated characters.
- No composition rules (NIST SP 800-63B).

**Storage:**
- **Argon2id** via Node's built-in `crypto.argon2` (no native dependency).
- Settings: m=19 MiB, t=2, p=1, 32-byte tag, 16-byte random salt (OWASP minimum).
- PHC string format, so parameters can be raised later.
- The hash is never returned by the API; `hasPassword` is.

**Guessing and enumeration:**
- Password checks are rate-limited.
- 5 wrong passwords lock that account for 15 minutes. The lock also applies to change password, keyed per user.
- 30 tries per IP per 15 minutes.
- One generic `INVALID_CREDENTIALS` error, with equal hashing cost, whether the account is unknown, has no password, or the password is wrong.

**Account safety:**
- An email that is only typed into a profile (unverified) can never be used for password login.
- Changing or resetting a password revokes **every** refresh token and returns fresh tokens for the current device.
- Deleting the account erases the hash.

**Audit:** `PASSWORD_SET`, `PASSWORD_CHANGED` and `PASSWORD_RESET`.

## Consequences
- The database now holds password hashes, so backups need the same care as the live database. Argon2id parameters must be reviewed as hardware gets faster; old hashes keep verifying with the parameters stored in them.
- Admin accounts are as strong as their passwords. Before public launch, consider stricter rules or 2-step verification for staff roles.
- Phone password reset stays unusable for real users until an SMS vendor is connected.
