# ADR-0009: Neutral codename; brand name is configuration

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
The working name "Craftfiz" is not final.

## Decision
- Code, packages, database names, Docker services and env vars use the codename **`offer-platform`** (`offer_platform` where a separator is needed).
- The user-facing brand is configuration: `APP_DISPLAY_NAME`, `APP_PUBLIC_URL`. It is used in SMS templates, notification text and SEO metadata.

## Consequences
Renaming the product is a config change plus a copy review, not a refactor.
