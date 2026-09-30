# Moderation (admin guide)

Admins keep the marketplace trustworthy. There are two review queues. Both are oldest-first, and every decision is recorded in the audit log with the admin's id, the old and new status, and the reason.

## 1. Business verification queue

`GET /api/v1/admin/businesses?status=UNDER_REVIEW`

| Decision | Call | Needs |
|---|---|---|
| Verify (gives the **Verified ✓** badge) | `PATCH /admin/businesses/:id/status {"action":"VERIFY"}` | `businesses:verify` |
| Reject | `{"action":"REJECT","reason":"…"}` (shown to the owner) | `businesses:verify` |
| Suspend / reactivate | `{"action":"SUSPEND","reason":"…"}` / `{"action":"REACTIVATE"}` | `businesses:manage` |

Check the private shop and owner photos (`/admin/businesses/:id/images/:imageId/full`), the address and map pin, and optionally call the shop phone. See [business-workflow.md](business-workflow.md).

## 2. Offer review queue

`GET /api/v1/admin/offers?status=PENDING_REVIEW`

| Decision | Call (`PATCH /admin/offers/:id/status`) | Result |
|---|---|---|
| Approve | `{"action":"APPROVE"}` | ACTIVE, or SCHEDULED if the start is in the future |
| Request changes | `{"action":"REQUEST_CHANGES","reason":"Add a photo of the shirts"}` | Back to DRAFT with your notes |
| Reject | `{"action":"REJECT","reason":"…"}` | REJECTED; the business may fix and resubmit |
| Suspend | `{"action":"SUSPEND","reason":"…"}` | Hidden immediately |
| Reactivate | `{"action":"REACTIVATE"}` | Back to SCHEDULED / ACTIVE / EXPIRED by its dates |

All of these need `offers:moderate`. Things to check:
- Is the discount **real and not misleading**? For `PRICE_DROP` the percentage is calculated by the platform, but the original price itself is the business's claim. For `PERCENTAGE_OFF`, `FLAT_AMOUNT_OFF` and the other types, the claim is the business's.
- Are the terms clear, and are the photos appropriate and relevant?
- `GET /admin/offers/:id/price-history` shows every price the business has entered.

## Safeguards built in

- An admin **cannot verify their own business or approve offers of a business they own or manage**.
- Offers of a business that isn't verified can't be approved or reactivated.
- Editing an approved offer, or changing its photos, sends it back to this queue automatically.
- Suspending a business hides all its offers at once.

Customer reports (Phase 5) will feed into these same actions.
