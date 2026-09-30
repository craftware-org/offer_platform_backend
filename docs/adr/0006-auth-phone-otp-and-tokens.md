# ADR-0006: Phone OTP with JWT access + rotating refresh tokens

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
In India, a phone number is the natural identity for both customers and small businesses. The same auth must work for web and native mobile apps. The MVP has no passwords.

## Options considered
1. **Server sessions in cookies.** Simple for web, awkward for mobile, and needs CSRF handling.
2. **Long-lived JWTs.** Can't be revoked, so a leaked token stays valid.
3. **Short-lived JWT access + opaque rotating refresh tokens.** Stateless checks on every request, while revocation stays possible.
4. **Outsource to a hosted auth provider (Firebase Auth, Auth0, Cognito).** Less code, but vendor lock-in, per-user cost at scale, and roles/permissions still have to live in our DB.

## Decision
Option 3, with OTP delivery behind an `SmsProvider` interface.
- OTP: 6 digits, stored as a hash, 5-minute expiry, at most 5 attempts, single use.
- Rate limits on OTP requests per phone, per IP and per device.
- Access token: JWT, 15 minutes. Refresh token: 256-bit random value, stored as a SHA-256 hash, rotated on each use. Reuse of an old token revokes the whole token family.
- Web clients may keep the refresh token in an `HttpOnly; Secure; SameSite` cookie (the web repo will decide). Mobile keeps it in secure storage.
- Development uses a `console` SMS provider, which is blocked in production.

## Consequences
- We own OTP security (hashing, limits, abuse), which is covered by tests and the Phase 8 audit.
- **An SMS vendor with TRAI DLT registration is needed before launch.** Choosing it doesn't block development.
- Email and social login can be added later as extra ways to get the same tokens.
