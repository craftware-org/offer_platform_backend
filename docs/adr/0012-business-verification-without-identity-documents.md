# ADR-0012: Business verification without identity documents

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
Only verified businesses may publish live offers, so verification is how customers learn to trust the platform. The original spec suggested collecting PAN, GSTIN and registration documents. The product owner decided the platform should **not** hold sensitive identity documents: storing them creates legal duties (DPDP Act 2023) and makes the platform a target, with little benefit for local shops.

## Decision
A business provides:

| Item | Default | Who can see it |
|---|---|---|
| Shop photo(s), up to 3 | Required | Owner and admins only |
| Owner photo, 1 | Optional | Owner and admins only |
| Shop registration number | Optional | Owner and admins only |
| Shop phone and address with door/shop number | Always required | Public once verified |

- An admin reviews these and **manually** sets `VERIFIED`, or `REJECTED` with a reason the owner sees. There is no automatic verification.
- The required/optional rules are the admin-editable setting `business.verification` (SUPER_ADMIN only, audited), so requirements can tighten later without code changes.
- Name, registration number, phone and location **lock** once submitted. After verification only an admin can change them, so a verified shop cannot rename itself and keep the badge.
- An admin cannot verify a business they own or manage.

## Consequences
- No PAN/GST/Aadhaar data exists in the system to leak.
- Verification is weaker than document checks and relies on admin judgement: photos and the shop phone (an admin can call it). Reports (Phase 5) and suspension are the correction mechanism.
- Verification photos are personal data. They are stored privately, never served publicly, and every upload is re-encoded, which strips EXIF metadata including GPS location.
