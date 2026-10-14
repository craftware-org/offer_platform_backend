# ADR-0019: Android app with Expo (React Native) in `apps/mobile`

- **Status:** Proposed (built on a team member's request 2026-10-11; needs the product owner's approval before release)
- **Date:** 2026-10-11

## Context
The plan always had mobile apps "later" (ARCHITECTURE.md, ADR-0010), using the same API and its OpenAPI contract. A team member asked for an Android app covering both customers and the business portal, published on Google Play.

Constraints:
- A team of 3 that already writes TypeScript and React for the API and website.
- Customers in Hubballi-Dharwad mostly use Android phones, often mid-range, on mobile data.
- The app must use the existing API unchanged: rotating refresh tokens, image uploads, view/tap counting.
- Phones cannot be force-updated, so the API contract matters more for the app than for the website.
- Push notifications are planned (FCM proposed), so a real native app beats a wrapped website.

## Options considered
1. **Trusted Web Activity (the website in an Android shell).** Fastest, almost no new code. But it is the website in a frame: no native camera or location flow, harder push notifications later, and it needs a real domain with `assetlinks.json` before it can even ship.
2. **Native Kotlin (Jetpack Compose).** The best Android feel. But it is a second language and a second codebase that nobody on the team writes today, and iOS would need a third.
3. **Flutter.** Good performance and one codebase for Android and iOS. But it means Dart, and none of the web or API code can be shared.
4. **Expo (React Native) in the monorepo.** TypeScript and React like the rest of the repo. The pure helpers (money, pricing rules, types) are shared with the website. Native camera, location and secure storage come from Expo modules. Signed builds and Play submission come from EAS in the cloud, so nobody needs Android Studio. iOS is possible later from the same code.

## Decision
Option 4: **Expo SDK 57 / React Native 0.86 / Expo Router**, in `apps/mobile`, as a pnpm workspace package (`@offer-platform/mobile`).

- **Same API, same rules.** The access token is kept in memory only. The refresh token is kept in `expo-secure-store` (Android Keystore), as ADR-0006 planned for mobile. One refresh request is shared by every caller, because reusing a refresh token revokes the session.
- **Screen paths copy the website's paths** (`/offers/:slug`, `/business/offers/:id` …). Links in notifications and shared links work unchanged, and Android opens `https://<website>/offers/…` links in the app once `assetlinks.json` is published.
- **Pure helpers are copied, not imported** from `apps/web/src/lib` (money, offer-form, types, insights), with a "keep in sync" note. A shared `packages/shared` is a follow-up; it would touch the website build, so it is kept out of this change.
- **Admin screens stay on the website.** They need 2-step login and are used by 3 people at a desk. The app links to them.
- **Privacy:** GPS is rounded to about 11 m and sent only with each discovery request, as on the website. It is kept in memory and never saved on the phone. Only a chosen city is remembered. The app asks for foreground location and camera only; background location, microphone and storage permissions are removed from the manifest.
- **Builds:** `eas.json` profiles `development` (local API), `preview` (APK for testers) and `production` (signed AAB, version code incremented by EAS). Play App Signing holds the release key.

## Consequences
- Easier: one language across the repo. CI already runs the app's lint, type-check and unit tests (`pnpm turbo run lint typecheck test build`). An iOS app later is mostly configuration.
- Harder: Expo SDK upgrades about twice a year. The copied helpers can drift from the website's until the shared package exists.
- Watch for:
  - **The Android package id is permanent once on Google Play.** It is `com.craftware.offerplatform` (neutral codename, ADR-0009) and can be overridden with `ANDROID_PACKAGE` before the first upload only.
  - **A public release needs a production API.** The preview API is team-only, its data may be reset and phone codes go to its log. Until Phase 9 ships, use Play's internal testing track only.
  - **Breaking API changes now need `/api/v2`**, because old app versions stay installed.
