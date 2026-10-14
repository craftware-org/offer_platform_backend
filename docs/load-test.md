# Load test of search and login (Phase 9)

How much traffic one preview-sized server can take, what slows down first, and how to run the
test again. Latest run: **2026-10-13**.

## What was tested

| Scenario | Request | Why |
|---|---|---|
| Home page sections | `GET /discover/home?city=hubballi` | first screen of the app |
| Search (typed words) | `GET /discover/offers?city=hubballi&q=…` with 20 real phrases: products, typos ("sare", "shoos"), "shoes under 2000", "50% off" | the heaviest public request |
| Near me (5 km) | `GET /discover/offers?lat=…&lng=…&radiusKm=5` at random points in Hubballi | the main mobile use |
| Offer page | `GET /offers/:slug` | the most common page |
| Password login | `POST /auth/password/login` | CPU-heavy by design (Argon2id) |

Each scenario ran for 20 seconds with 10 and then 50 simultaneous users (autocannon). Every
request came from a random IP address, so the per-IP limits (300 requests a minute, 30 password
tries per 15 minutes) behaved as they would for many different people.

**Data:** 300 verified shops (Hubballi and Dharwad) with 10 live offers each, 3,000 offers in all,
with varied titles, categories, prices and locations (`apps/api/test/load/seed.sql`). That is more
than the first months after launch are likely to have.

**Machine:** the production Docker image (`apps/api/Dockerfile`, `NODE_ENV=staging`, request logs
on) on a developer laptop, limited to **1 CPU and 512 MB for the API and 1 CPU and 512 MB for
PostgreSQL**, the same 2 vCPUs and 1 GB the preview's t3.micro shares between them. A laptop core is
somewhat faster than a t3 core, so treat the numbers as an upper estimate.

## Results

| Scenario | 10 users: req/s | median | p99 | 50 users: req/s | median | p99 | Errors |
|---|---|---|---|---|---|---|---|
| Home page sections | 59 | 161 ms | 294 ms | 57 | 867 ms | 1,120 ms | 0 |
| **Search** | **45** | 206 ms | 652 ms | 40 | 1,190 ms | 1,572 ms | 0 |
| Near me (5 km) | 111 | 90 ms | 182 ms | 99 | 490 ms | 651 ms | 0 |
| Offer page | 231 | 36 ms | 120 ms | 204 | 232 ms | 434 ms | 0 |
| Password login | 20 | 493 ms | 761 ms | 21 | 2,305 ms | 3,321 ms | 0 |

Memory stayed low: the API used about 205 MB and PostgreSQL about 65 MB.

**Found and fixed during the test:** every search ran its expensive text matching twice, once for
the page of results and once to count them, and PostgreSQL was at 100 % CPU. The count now comes
from the same query (`count(*) over ()`). Search went from **24 to 45 requests a second** (median
402 → 206 ms) and "near me" from 74 to 111. An integration test checks the totals on every page.

## What it means

- **The busiest realistic moment is far below these numbers.** If 5,000 people a day used the
  site, each searching 10 times, that is about 1–2 searches a second on average and perhaps 10 at
  the evening peak; one server handles about 40.
- **Search is the first limit**, and it is PostgreSQL CPU: the typo-tolerant text matching is
  checked on every live offer. It grows with the number of offers: at 30,000 offers expect
  roughly a tenth of today's search rate.
- **Login is slow on purpose:** about 20 logins a second, because passwords are hashed with Argon2id
  to make guessing expensive. People log in rarely (a session lasts 30 days), so this is fine.
- **The t3.micro "burst" caveat:** a t3.micro runs at full speed only in bursts; its baseline is
  20 % of its 2 vCPUs. T3 instances default to "unlimited" mode, where sustained use above the
  baseline is billed extra instead of being slowed down. Short peaks cost nothing extra; hours of
  heavy load would. CloudWatch shows the CPU credit balance.
- **Moving the database to RDS (Phase 9)** gives PostgreSQL its own CPU, which removes the first
  limit from the API server.

## Next improvements (when traffic or offers grow; none is needed for launch)

1. Text matching that uses the trigram indexes (`pg_trgm` operators instead of
   `word_similarity(...) > 0.45` inside one big OR), so search no longer checks every offer.
2. Cache the home page sections per city in Valkey for 30–60 seconds.
3. Re-run this test on the real production setup after the RDS move, in a quiet hour.

## How to run it again (local machine only; never against the preview or production)

```bash
docker compose up -d                                                   # local PostGIS + Valkey
docker compose exec -T postgres psql -U offer_platform -d offer_platform < apps/api/test/load/seed.sql
docker build -f apps/api/Dockerfile -t offer-platform-api:loadtest .
docker update --cpus 1 --memory 512m --memory-swap 512m offer-platform-postgres-1
# API env: apps/api/.env with localhost replaced by host.docker.internal, plus
# NODE_ENV=staging PREVIEW_MODE=true TRUST_PROXY_HOPS=1 SMS_PROVIDER=console EMAIL_PROVIDER=console
docker run -d --name op-loadtest-api --cpus 1 --memory 512m --memory-swap 512m -p 3100:3000 --env-file <that env file> offer-platform-api:loadtest
LOAD_API=http://localhost:3100 LOAD_EMAIL=<a local test account> LOAD_PASSWORD=<its password> pnpm --filter @offer-platform/api test:load
```

Options: `LOAD_SECONDS` (default 20), `LOAD_CONNECTIONS` (default `10,50`), `LOAD_ONLY=search,login`
(scenario names). Without `LOAD_EMAIL`/`LOAD_PASSWORD` the login scenario is skipped. Afterwards:
`docker rm -f op-loadtest-api`, run `apps/api/test/load/cleanup.sql`, and
`docker compose up -d --force-recreate postgres` to remove the CPU and memory limits.
