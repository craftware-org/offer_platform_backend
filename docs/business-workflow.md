# Business workflow

How a shop gets onto the platform and earns the **Verified ✓** badge ([ADR-0012](adr/0012-business-verification-without-identity-documents.md)).

## Lifecycle

```
Owner registers ──▶ PENDING ──submit──▶ UNDER_REVIEW ──admin VERIFY──▶ VERIFIED ✓ (public)
                       ▲                     │
                       │                admin REJECT (reason)
                       │                     ▼
                       └──── owner fixes ── REJECTED ──submit──▶ UNDER_REVIEW

Any state except SUSPENDED ──admin SUSPEND (reason)──▶ SUSPENDED
SUSPENDED ──admin REACTIVATE──▶ VERIFIED (if it was verified before) or PENDING
```

The rules live in one place: `apps/api/src/modules/businesses/business-status.machine.ts`.

## Owner journey (API)

| Step | Endpoint |
|---|---|
| 1. Log in with phone OTP | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| 2. Pick city, locality and category | `GET /cities`, `GET /cities/:slug/localities`, `GET /categories` |
| 3. Register the shop (map pin must lie within the city's service radius) | `POST /me/businesses` |
| 4. Upload the shop photo (and optionally owner photo, logo, gallery) | `POST /me/businesses/:id/images?kind=…` |
| 5. Check what's missing | `GET /me/businesses/:id/dashboard` (`verification.items`, `canSubmit`) |
| 6. Submit for verification | `POST /me/businesses/:id/submit` |
| 7. If rejected: read `statusReason`, fix, resubmit | `GET /me/businesses/:id`, `PATCH /me/businesses/:id` |

Registering a business grants the user the `BUSINESS_OWNER` role. One user can own up to 5 businesses.

## Admin journey (API)

| Step | Endpoint | Permission |
|---|---|---|
| Review queue, oldest first | `GET /admin/businesses?status=UNDER_REVIEW` | `businesses:read` |
| Open a business, view private photos | `GET /admin/businesses/:id`, `GET /admin/businesses/:id/images/:imageId/full` | `businesses:read` |
| Verify / reject (reason required) | `PATCH /admin/businesses/:id/status` `{ action: "VERIFY" \| "REJECT", reason? }` | `businesses:verify` |
| Suspend (reason required) / reactivate | same endpoint, `SUSPEND` / `REACTIVATE` | `businesses:manage` |
| Correct locked details | `PATCH /admin/businesses/:id` | `businesses:manage` |
| Change verification requirements | `PUT /admin/settings/business.verification` | `settings:manage` (SUPER_ADMIN) |

Every step is recorded in the audit log (`GET /admin/audit-logs?entityId=<businessId>`).

## Editing rules

| Field | PENDING / REJECTED | UNDER_REVIEW / VERIFIED | SUSPENDED |
|---|---|---|---|
| Name, registration number, phone, location | Owner | **Admin only** (`FIELDS_LOCKED`) | Admin only |
| Description, category, WhatsApp, email, website, social links, opening hours | Owner | Owner | Admin only |
| Verification photos | Owner | **Locked** | Locked |
| Logo, gallery | Owner | Owner | Locked |

- The public web address (`slug`, e.g. `sri-ganesh-textiles-hubballi`) follows the name until the business is first verified, then never changes.

## Images

| Kind | Max | Public? |
|---|---|---|
| `LOGO` | 1 (a new upload replaces it) | Yes, once verified |
| `GALLERY` | 10 | Yes, once verified |
| `VERIFICATION_SHOP` | 3 | **Never**: owner and admins only |
| `VERIFICATION_OWNER` | 1 (replaces) | **Never**: owner and admins only |

Uploads (multipart field `file`, max 8 MB) are decoded and checked by content: JPEG, PNG, WebP or AVIF, at least 200×200. They are then re-encoded to WebP in two sizes (`full` ≤ 1600 px, `thumb` ≤ 400 px). Re-encoding strips all metadata, including EXIF GPS. Public images are served from `/media/images/:id/:variant` with long cache headers. Private ones are sent with `Cache-Control: private, no-store`.

## Visibility

- Public endpoints (`GET /businesses`, `GET /businesses/:slug`, media) only ever return **VERIFIED** businesses. Registration number, status and verification photos are never included.
- For anyone other than its owner/staff, a business they don't manage returns **404** (never 403), so its existence can't be probed.
