# ADR-0013: Team-only preview server on a single EC2 instance

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
The product owner wants to test the platform online now: web on Vercel (`dodoom.vercel.app`), API on an EC2 instance in Mumbai. Some production pieces are not ready yet:
- no SMS vendor (TRAI DLT registration pending);
- no final product name or domain;
- no S3 or managed databases (planned in ADR-0011 for launch).

## Decision
1. **One EC2 instance** (Ubuntu 24.04, t3.medium, ap-south-1) running Docker Compose: Caddy (automatic HTTPS), API, worker, PostgreSQL + PostGIS, Valkey. Only ports 80/443 (and SSH from the owner's IP) are open. The database and cache are never exposed.
2. **HTTPS without a domain:** `<elastic-ip-with-dashes>.sslip.io`, a public wildcard DNS name that resolves to the IP inside it, with a free Let's Encrypt certificate obtained by Caddy. Moving to `api.<real-domain>` changes only `API_DOMAIN`, `APP_PUBLIC_URL` and `CORS_ORIGINS`.
3. **`PREVIEW_MODE=true`** (only valid with `NODE_ENV=staging`; configuration validation refuses it in production) allows:
   - phone login codes written to the server log (team only) until the SMS vendor exists;
   - images on the server disk (Docker volume) until S3.
4. **Email login codes** are delivered for real through Gmail SMTP (`craftwaretech@gmail.com`, App Password). The owner types the password into a hidden prompt on the server (`set-secret.sh`); it never appears in chat, git or logs.
5. **Secrets** (database password, JWT and OTP keys) are generated on the server by `setup-server.sh` and never leave it.
6. **Backups:** nightly `pg_dump` kept 14 days on the server disk.

## Consequences
- Anyone on the internet can open the site. Phone login only works for the team, because codes are read from the server log, while email login works for anyone with an inbox. This is acceptable for testing and must be revisited before public launch.
- A single server is a single point of failure, and backups on the same disk don't protect against losing the instance. **Before public launch (Phase 9):** RDS with point-in-time recovery, ElastiCache, S3 for images and backups, a real SMS vendor, and `PREVIEW_MODE=false`.
- The code is production-ready. Preview behaviour exists only behind the explicit flag, and production refuses to start with console providers or local storage.
