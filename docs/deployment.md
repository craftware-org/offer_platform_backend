# Deployment

Current target: a **team-only preview/staging server** on one EC2 instance ([ADR-0013](adr/0013-preview-staging-on-single-ec2.md)). Everything lives in [`deploy/staging/`](../deploy/staging).

```
Internet ──443──▶ Caddy (auto HTTPS) ──▶ api (NestJS) ──▶ postgres (PostGIS)   [Docker network only]
                                                      └──▶ valkey
                                          worker (BullMQ) ─┘
```

## 1. Create the server (AWS console, once)

| Setting | Value |
|---|---|
| Region | Asia Pacific (Mumbai) `ap-south-1` |
| AMI | Ubuntu Server 24.04 LTS or newer (x86_64); the current preview server runs 26.04 |
| Type | t3.medium recommended. t3.micro (1 GB) works for a small team preview thanks to the 2 GB swap file `setup-server.sh` adds, but image builds are slow |
| Key pair | new, ED25519, `.pem`, kept on the owner's computer only |
| Security group | SSH 22 from *My IP*; HTTP 80 and HTTPS 443 from anywhere |
| Storage | 30 GB gp3 |
| Elastic IP | allocated and associated (a stable address) |

## 2. Prepare the server (once)

```bash
# from the repository root on a dev machine
scp -i <key.pem> deploy/staging/setup-server.sh deploy/staging/.env.example ubuntu@<ip>:
ssh -i <key.pem> ubuntu@<ip> 'bash setup-server.sh <ip-with-dashes>.sslip.io'
```

`setup-server.sh` does the following:
- installs security updates and automatic security patches;
- adds a 2 GB swap file;
- turns on the firewall (22/80/443 only) and turns off SSH passwords;
- installs Docker;
- creates `/opt/offer-platform`;
- **generates `.env` with fresh secrets on the server**;
- schedules nightly backups.

## 3. Deploy (every release)

```bash
bash deploy/staging/deploy.sh <ip> <key.pem>
```

This ships the **committed** source (`git archive`: no `.env`, no local files) and builds the image on the server. The `migrate` service then applies migrations and syncs roles; `api` and `worker` restart, and the script waits for `https://<domain>/api/v1/health/ready`.

## 4. Email login codes (Gmail)

1. On the Google account `craftwaretech@gmail.com`: turn on **2-Step Verification**, then create an **App Password**.
2. On the server, type it into a hidden prompt:
   ```bash
   ssh -i <key.pem> ubuntu@<ip> 'cd /opt/offer-platform/src/deploy/staging && ./set-secret.sh SMTP_PASSWORD'
   ```
   This switches `EMAIL_PROVIDER` to `smtp` and restarts the API. The password never appears on screen, in chat or in git.

## Operations

| Task | Command (on the server, in `/opt/offer-platform/src/deploy/staging`) |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f --tail 100 api` (also `worker`, `caddy`) |
| Preview login code (phone) | `docker compose logs api \| grep "DEV SMS" \| tail -1` |
| Backup now | `bash backup.sh` → `backups/*.dump` |
| Restore | `docker compose exec -T postgres pg_restore -U offer_platform -d offer_platform --clean < backups/<file>.dump` |
| Restore drill (safe; live data untouched) | `bash restore-drill.sh`: restores the newest backup into a temporary database, checks PostGIS, migrations and row counts, then drops it. Run it from the file, not piped through ssh. Last run: 2026-10-09, passed |
| Lost authenticator (emergency) | `docker compose exec api node dist/cli/reset-mfa.js --email <address>` (or `--phone`): clears that person's 2-step login and ends their sessions (ADR-0018). Normally a Super admin does this on the website |
| Add areas (localities) | `docker compose exec api node dist/cli/add-localities.js --city hubballi --names "Area One,Area Two"` (idempotent) |
| First super admin | `docker compose exec api node dist/cli/grant-role.js --email <address> --role SUPER_ADMIN` (or `--phone <number>`), after that person has logged in once |

## Website on Vercel

The website (`apps/web`) is the Vercel project **dodoom** in the **Craftware** team, connected to `craftware-org/offer_platform_backend`. Settings: root directory `apps/web`, region `bom1` (Mumbai, from `apps/web/vercel.json`).

- **Production:** every push to `main` deploys to https://dodoom.vercel.app (also `dodoom-omega.vercel.app`).
- **Previews:** every other branch and pull request gets its own preview URL. The API only allows the production origin in `CORS_ORIGINS`, so on preview URLs the API calls are blocked; add the preview origin temporarily if you need one.

Project environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://13-235-201-166.sslip.io` (the API origin) |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (use pnpm 12 from `packageManager`) |
| `NEXT_TELEMETRY_DISABLED` | `1` |

A manual `vercel deploy` is not needed. If you ever run one, run it from the repository root after `vercel link` to the Craftware project; `.vercelignore` keeps `.env` files, keys and build output out of the upload.

## Moving to the real domain later

1. DNS: `api.<domain>` → the Elastic IP.
2. In `.env`: set `API_DOMAIN`, `APP_PUBLIC_URL` and `CORS_ORIGINS`.
3. Run `docker compose up -d`. Caddy obtains the new certificate automatically.

## Before public launch (Phase 9)

- Move PostgreSQL to RDS (PostGIS, point-in-time recovery), Valkey to ElastiCache, and images and backups to S3.
- Real SMS vendor (TRAI DLT); `PREVIEW_MODE=false`; monitoring and alerts.
- Production deployment from CI with manual approval.
