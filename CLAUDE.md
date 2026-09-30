# CLAUDE.md — working rules for this repo

Backend for a local offers and business discovery platform. Read [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/adr/](docs/adr/README.md) before changing anything structural.

## Process
- Work phase by phase (ARCHITECTURE.md §15). Explain the plan and get product-owner approval before implementing each phase or any large feature.
- Never claim a feature works without a passing test against a real database.
- Record any structural or stack decision as a new ADR. Don't silently deviate from an accepted one.

## Hard rules
- Codename `offer-platform` in code. The brand name comes from config only (ADR-0009).
- Money is integer paise. The discount % is computed server-side (ADR-0008).
- Never hard-delete offers or businesses. Never trust frontend authorization. Every endpoint validates input with Zod.
- Modules talk only through exported services (ADR-0002).
- No secrets in code. `.env` is never committed. No mock data paths reachable in production.
- No payments, subscriptions or monetization in the MVP. Future features sit behind feature flags that default to `false`.
