# Architecture Decision Records

Each ADR records one significant decision: the context, the options considered, the choice made, and its consequences. ADRs are never edited after acceptance. If a decision changes, a new ADR supersedes the old one.

| # | Decision | Status |
|---|---|---|
| [0001](0001-multi-repo-with-openapi-contract.md) | Multiple repositories, OpenAPI as the contract | Superseded by 0010 |
| [0002](0002-modular-monolith.md) | Modular monolith with API + worker processes | Accepted |
| [0003](0003-nestjs-typescript-zod.md) | Node.js + TypeScript + NestJS, Zod for validation and OpenAPI | Accepted |
| [0004](0004-postgresql-postgis.md) | PostgreSQL + PostGIS as the primary datastore | Accepted |
| [0005](0005-drizzle-orm.md) | Drizzle ORM instead of Prisma | Accepted |
| [0006](0006-auth-phone-otp-and-tokens.md) | Phone OTP with JWT access + rotating refresh tokens | Accepted (SMS vendor pending; passwords added by 0015) |
| [0007](0007-redis-bullmq-jobs.md) | Redis + BullMQ for jobs, cache and rate limiting | Accepted |
| [0008](0008-money-and-time.md) | Money as integer paise, time as UTC `timestamptz` | Accepted |
| [0009](0009-neutral-codename.md) | Neutral codename; brand name is configuration | Accepted |
| [0010](0010-single-repo-monorepo.md) | Single repository (monorepo) with pnpm + Turborepo | Accepted |
| [0011](0011-aws-hosting.md) | AWS hosting, Mumbai region | Accepted |
| [0012](0012-business-verification-without-identity-documents.md) | Business verification without identity documents | Accepted |
| [0013](0013-preview-staging-on-single-ec2.md) | Team-only preview server on a single EC2 instance | Accepted |
| [0014](0014-web-app-nextjs-on-vercel.md) | Web app: Next.js on Vercel, calling the API directly | Accepted |
| [0015](0015-password-login.md) | Password login after a one-time verification code | Accepted |
| [0016](0016-notifications-domain-events-and-email-outbox.md) | Notifications via in-process domain events and an email outbox | Accepted |

Template: [`template.md`](template.md)
