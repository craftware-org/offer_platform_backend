# Offer workflow

Offers are the core of the platform. Every offer is reviewed by an admin before customers see it (product owner decision, 2026-09-30).

## The seven offer types

`pricing.type` selects the type. Money is always **integer paise** (₹1,199 = `119900`).

| Type | Example | Business enters | Platform computes / checks |
|---|---|---|---|
| `PRICE_DROP` | ₹1,999 → ₹1,199 | `originalPrice`, `offerPrice` | **`discountPercent` (40.0) computed server-side**; offer price < original |
| `PERCENTAGE_OFF` | Flat 30% off / up to 50% off | `discountPercent` (1–99), `isUpTo`, optional `maxDiscountAmount`, `minPurchaseAmount` | Stated claim, checked by the admin |
| `FLAT_AMOUNT_OFF` | ₹200 off above ₹1,000 | `flatAmountOff`, optional `minPurchaseAmount` | Amount off < minimum purchase |
| `BUY_X_GET_Y` | Buy 2 Get 1 Free | `buyQuantity`, `getQuantity` (1–20), optional `itemName` | Whole numbers |
| `FREE_GIFT` | Free dessert with every meal | `itemName`, optional `minPurchaseAmount` | Required item |
| `COMBO` | Shirt + trousers for ₹1,499 | `offerPrice`, `comboItems` (2–10), optional `originalPrice` | Discount computed if `originalPrice` is given |
| `OTHER` | Free home delivery | nothing extra (title and description) | Admin review |

A discount percentage is **never accepted** for price-based types (the request is rejected). Every response includes a ready-made `headline` ("40% OFF", "₹200 OFF on ₹1,000+", "Buy 2 Get 1 Free", …). Pricing rules live in `apps/api/src/modules/offers/pricing.ts`. The database repeats the core rules as `CHECK` constraints.

## Lifecycle

```
DRAFT ──submit──▶ automated checks ──▶ PENDING_REVIEW ──admin──┬─ APPROVE ─▶ SCHEDULED ──(start)──▶ ACTIVE ──(end)──▶ EXPIRED
  ▲    ◀──withdraw────────────────────────────┤                ├─ REJECT (reason) ─▶ REJECTED ──submit──▶ PENDING_REVIEW
  └────────────── REQUEST_CHANGES (notes) ────┘                └─ (approve after start ─▶ ACTIVE directly)
ACTIVE ⇄ PAUSED (business)     SCHEDULED/ACTIVE/PAUSED ──end──▶ EXPIRED (business ends early)
PENDING_REVIEW/SCHEDULED/ACTIVE/PAUSED ──admin SUSPEND (reason)──▶ SUSPENDED ──REACTIVATE──▶ by dates
```

The rules live in one place: `offer-status.machine.ts`. `APPROVED` is recorded as an audit event, not a status.

### Automated checks on submit (and on re-review after edits)
- The business must be **VERIFIED** (`BUSINESS_NOT_VERIFIED` otherwise). Drafts are allowed before verification.
- The end date must be in the future.
- Duration ≤ `offers.limits.maxDurationDays` (default **90**, admin setting).
- Category must be active.

### Editing rules
| Status | Business can edit? |
|---|---|
| DRAFT, REJECTED | Yes |
| PENDING_REVIEW | No: withdraw first |
| SCHEDULED, ACTIVE, PAUSED | Yes, but the offer **goes back to PENDING_REVIEW and is hidden** until approved again. The same applies to adding or removing photos. |
| EXPIRED, SUSPENDED | No |

- Only drafts that were never submitted can be deleted. Everything else is kept for history (offers are never physically deleted).
- The public URL (`slug`, e.g. `40-off-selected-mens-shirts-k2p9`) is fixed from the first approval onwards.

### Price history
Every pricing change is appended to `offer_price_history`: price, original price, discount, a full pricing snapshot, who made the change, and the source (`CREATED` or `UPDATED_BY_BUSINESS`). It is visible to the business (`/me/offers/:id/price-history`) and to admins.

## Time-based transitions (worker)

The **worker process** (`pnpm --filter @offer-platform/api start:worker`, or `start:worker:dev`) runs a BullMQ job every `OFFER_LIFECYCLE_INTERVAL_MS` (default 60 s):
- `SCHEDULED → ACTIVE` when the start time has passed.
- `SCHEDULED / ACTIVE / PAUSED / PENDING_REVIEW → EXPIRED` when the end time has passed.

Each transition is a single conditional `UPDATE`, safe to run late, twice or on several workers. **Correctness doesn't depend on the worker:** public queries also require `starts_at ≤ now < expires_at`, so an offer disappears from lists exactly at its end time.

## What customers see

- `GET /offers`: only **ACTIVE** offers within their dates, from **VERIFIED** businesses. Filters: `city`, `locality`, `category` (a parent category includes its children), `business` (all slugs).
- `GET /offers/:slug`: ACTIVE, PAUSED or EXPIRED offers, with `availability`, so shared links to an ended offer say "expired" instead of breaking. Drafts, offers under review, rejected, scheduled and suspended offers are 404.
- If a business is suspended, all its offers disappear immediately (no per-offer change needed).
- Each offer includes the business contact details needed for **Call / WhatsApp / Directions** (phone, WhatsApp, address, coordinates).
