# ADR-0019: Platform listings, shops listed by an admin from the brand's public page

- **Status:** Accepted (product owner, 2026-10-14: "Build it")
- **Date:** 2026-10-14

## Context
The owner wants chain outlets in Hubballi-Dharwad (McDonald's, Domino's, KFC and similar) and their publicly advertised offers on the platform so it looks full at launch, without contacting the outlets.

Constraints found while planning:
- **Google Maps:** scraping it breaks Google's terms. The Places API terms don't allow storing its names and addresses in our own database (place IDs only) or showing them without Google's map and attribution.
- **Brands:** copying their logos, photos and promo artwork risks trademark and copyright claims, and automated scraping of their apps or sites breaks their terms. Restating the facts of an advertised offer in our own words is what deal sites already do.
- **Trust:** the platform promises offers verified and published by the shop. Chain offers often vary by outlet and change without notice.

## Options considered
1. Invite the franchisees to register themselves. Fully legal, but the owner won't do outreach.
2. Demo data on the preview only. Doesn't fill the real site.
3. Copy from Google Maps and the brands' apps automatically. Rejected because of the legal risks above.
4. **An admin types in each outlet and its offers by hand, clearly labelled, linked to the brand's page, with short expiry (chosen).**

## Decision
- New business columns: `listed_by_platform` (boolean) and `source_url` (the brand's public offers page).
- `POST /admin/businesses/listings` (`businesses:manage`) creates the shop already **VERIFIED** (public at once, no photo verification). The admin who lists it becomes its owner, so its offers use the normal business portal and the normal offer review. A second admin has to approve them, because nobody may approve offers for a business they manage.
- **Never shown as verified:** the public views return `isVerified: false`, `verifiedAt: null`, `listedByPlatform: true` and `sourceUrl`. The website shows "Listed by <app name> from the brand's public information" with a link to the brand's page, and "· from brand's website" on offer cards.
- **Offers run 7 days at most** (`LISTED_OFFER_MAX_DAYS`, or less if `offers.limits` is lower), so an admin re-checks the brand's page every week.
- **Content rules** (shown to admins on the screen): type the facts in your own words. No brand logos, photos or artwork. Outlet details are typed by hand (or taken from OpenStreetMap with credit), never stored from Google Places.
- Admins can change the source page with `PATCH /admin/businesses/:id` (`sourceUrl`). Owners can never set it.
- Audit action `BUSINESS_LISTED`. The admin list takes `?listed=true|false`.

## Consequences
- Chain outlets can be on the site within minutes, and customers can see where the information came from.
- The listing admin is the shop's owner on the website. If that admin deletes their account, the listings are closed like any owned shop. Handing a listing over to the real outlet ("claim") is not built yet.
- Listed offers have to be renewed every week or they disappear. That's intended, so stale deals don't stay up.
- Legal risk is reduced, not removed. A lawyer should review this alongside the draft legal pages before launch, and any brand that objects should be taken down at once (suspend the business).
