# ADR-0008: Money as integer paise, time as UTC `timestamptz`

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
Offers carry prices and discount percentages that must be exact and trustworthy (price history, consumer transparency). Offers have start and end times that users see in local time.

## Decision
- **Money:** stored as `bigint` in the smallest currency unit (paise), with a `currency` column (default `INR`). The API accepts and returns integer minor units, and clients format them. No floats anywhere in the money path.
- **Discount %:** computed server-side as `round((original − offer) / original × 100, 1)` and stored for filtering and sorting. It is never accepted from input. When the original price is 0 or not applicable, the discount is null.
- **Time:** `timestamptz`, stored in UTC and exchanged as ISO-8601 strings. The default display zone is `Asia/Kolkata`, and cities carry their own time zone for future expansion.

## Consequences
- Clients must divide by 100 for display. This is documented in the OpenAPI field descriptions.
- Multi-currency support is possible later without a migration.
