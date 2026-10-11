# Android app (`apps/mobile`)

The Android app for customers and shop owners. It is built with Expo SDK 57, React Native 0.86 and Expo Router, and it uses the same `/api/v1` as the website. The reasons for these choices are in [ADR-0019](adr/0019-mobile-app-expo-react-native.md).

> **Status:** built and checked; **not yet released**. It needs the product owner's approval first (CLAUDE.md §13). A public release also needs the Phase 9 items listed under [Before a public release](#before-a-public-release).

## What is in the app

| Area | Screens |
|---|---|
| Customers | Home: search, GPS or city, radius, the sections (near you / from shops you follow / recommended / new / ending soon) · Search: plain-language queries, sort orders, endless list · Offer: photos, price, dates, terms, save, share, call / WhatsApp / directions / website, report · Shop: details, hours, gallery, live offers, follow |
| Account | Log in with a password or a code (phone or email), forgot password, 2-step login step for admins · Welcome step (name + password) · Account: profile, set or change password, log out, delete account · Saved offers (still on / ended) · Shops you follow · Notification inbox and settings |
| Business portal | My shops · Register a shop (address, area, "I am at the shop now", opening hours) · Dashboard: verification checklist, shop and owner photos taken with the camera or picked from the gallery, submit, logo and gallery, the last 30 days at a glance, messages from the team, offers · New and edit offer (all 7 types) · Manage offer: submit, withdraw, pause, resume, end, photos, delete draft · Performance: 7 / 30 / 90 days, daily chart, each offer |
| Admin | Not in the app. The Account screen links admins to the website (it needs 2-step login). |

Views, shares and contact taps are counted for everyone, the same way as on the website. People who are not logged in send a random visitor id, kept in secure storage.

## Layout

```
apps/mobile/
  app.config.ts      Name, Android package id, permissions, deep links, plugins (reads env, see below)
  eas.json           Build profiles (development / preview / production) and Play submission
  src/app/           Screens (Expo Router). Paths copy the website's: /offers/:slug, /business/:id …
    (tabs)/          Home, Search, Saved, My shop, Account
  src/components/    UI kit (ui.tsx), offer cards, forms (business, offer), image upload, date/time
  src/lib/           API client + secure session, auth, location, engagement, links, use-load
                     money.ts, offer-form.ts, types.ts, insights.ts: COPIED from apps/web/src/lib (keep in sync)
  assets/            Icon, adaptive icon, splash (placeholders from the Expo template: replace before release)
```

## Configuration

| Variable | Where | Meaning |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `eas.json` per profile, or the shell | API origin, baked into the bundle at build time |
| `EXPO_PUBLIC_WEB_URL` | `eas.json` per profile | Website origin: share links, admin link, deep-link host |
| `APP_DISPLAY_NAME` | shell / EAS env | Name under the icon (default `Dodoom`, ADR-0009) |
| `ANDROID_PACKAGE` | shell / EAS env | Override `com.craftware.offerplatform`. **Only before the first Play upload; it can never change after that.** |
| `EAS_PROJECT_ID` | shell / EAS env | Set after `eas init` (see below) |

No secrets live in the app. Anything in the bundle can be read by anyone who installs it.

## Run it locally

```bash
pnpm install
pnpm --filter @offer-platform/api start:dev               # API on :3000 (CLAUDE.md §5)
cd apps/mobile
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 pnpm start       # 10.0.2.2 = the computer, seen from the Android emulator
```

- The app uses native modules (secure storage, camera, location, date picker), so it needs a **development build**, not Expo Go: `npx eas-cli@latest build --profile development --platform android`, then install the APK on the phone or emulator.
- On a real phone, use the computer's LAN address (`http://192.168.x.x:3000`). Native apps send no `Origin` header, so `CORS_ORIGINS` does not matter to them.
- Login codes are printed in the API log, as for the website.

**Checks (CI runs them on every pull request through `pnpm turbo run lint typecheck test build`):**

```bash
pnpm --filter @offer-platform/mobile typecheck
pnpm --filter @offer-platform/mobile lint
pnpm --filter @offer-platform/mobile test              # pure helpers: money, pricing, insights, links
pnpm --filter @offer-platform/mobile export:android    # full Metro bundle: proves every import resolves
```

## Building

EAS builds and signs in the cloud, so nobody needs Android Studio.

```bash
cd apps/mobile
npx eas-cli@latest login              # Expo account (create one for Craftware, owned by the product owner)
npx eas-cli@latest init               # creates the EAS project; put the id in EAS_PROJECT_ID (or paste it into app.config.ts)
npx eas-cli@latest build --profile preview --platform android      # APK for testers, against the preview API
npx eas-cli@latest build --profile production --platform android   # signed AAB for Google Play
```

- On the first production build, let EAS **generate the upload keystore**. EAS stores it. Download a backup (`eas credentials`) and keep it with the owner. Never commit it; `.gitignore` already blocks `*.jks` and `*.keystore`.
- Version codes go up automatically (`"appVersionSource": "remote"`, `"autoIncrement": true`). Change `version` in `app.config.ts` for a new user-visible version.

## Publishing on Google Play (step by step)

Only the product owner can do steps 1–3, because they need Craftware's own accounts and payment.

1. **Developer account:** create one at <https://play.google.com/console/signup> (one-time US$25 fee).
   - An **organisation** account (Craftware) needs a D-U-N-S number. It can publish to production straight away after review.
   - A **personal** account created after November 2023 must first run a **closed test with at least 12 testers for 14 days in a row** before it can apply for production. Check Google's current rules when you sign up.
2. **Create the app** in Play Console: name, default language English (India), App, Free.
3. **App content** (Policy → App content):
   - **Privacy policy URL:** required. Publish it on the website first (`/privacy` is linked from the app's Account screen; the page is part of Phase 9 "legal pages").
   - **Data safety:** see [the answers below](#data-safety-answers).
   - **Account deletion:** the app deletes accounts in Account → Delete account. For the web link, use `<website>/account` (log in → Delete account).
   - **Content rating questionnaire:** a shopping and offers app with no user-to-user chat and no gambling. Answer honestly; it usually comes out as "Everyone / 3+".
   - **Target audience:** 18+ (shop owners and adult shoppers). Do not choose ages under 13.
   - **Ads:** "No ads".
   - **Government apps / financial features / health:** none.
4. **Store listing:**
   - short description (80 characters);
   - full description;
   - app icon 512×512 PNG;
   - feature graphic 1024×500;
   - at least 2 phone screenshots (1080×1920 or larger);
   - category **Shopping**;
   - contact email.
5. **First upload by hand.** Google Play only lets tools upload after the first release exists. Build the production AAB (above), download it from the EAS build page, then go to Testing → Internal testing → Create release → upload the `.aab`. Accept **Play App Signing** (Google keeps the release key; the EAS key becomes the upload key).
6. **Later uploads from the command line:**
   - In Google Cloud, create a service account. In Play Console → Users and permissions, invite it with "Release apps to testing tracks".
   - Download its JSON key to `apps/mobile/play-service-account.json` (git-ignored, never commit it).
   - Run `npx eas-cli@latest submit --platform android --profile production --latest`. It uploads to the **internal** track as a **draft**: promote it in Play Console.
7. **Testing tracks:** internal (up to 100 testers, minutes to go live) → closed (the 12-tester / 14-day rule for personal accounts) → production (staged rollout: start at 10–20 %).
8. **App links:** after Play App Signing is on, copy the **SHA-256 certificate fingerprint** from Play Console → Setup → App signing. Publish `https://<website>/.well-known/assetlinks.json` with the package id and that fingerprint. Android then opens shared offer and shop links straight in the app.

### Data safety answers

These describe what the app and API do today. Re-check them if features change.

| Data type | Collected | Shared | Why | Notes |
|---|---|---|---|---|
| Name, email, phone number | Yes | No | Account management | Required to log in. Deleted on account deletion. |
| Approximate and precise location | Yes, **processed ephemerally** | No | App functionality ("near me"; a shop's address point) | Customer GPS is rounded and sent only with a search, never stored. A shop's location is stored as its public address. |
| Photos | Yes | No | App functionality | Shop, owner and offer photos uploaded by shop owners. Location metadata is stripped by the server. |
| App interactions, in-app search history | Yes | No | Analytics | Views, saves, shares, contact taps, typed searches (counted, kept 180 days) |
| Device or other IDs | Yes | No | Analytics | A random visitor id made by the app (not the advertising id) |

- Data is encrypted in transit: **yes** (HTTPS only).
- Users can ask for their data to be deleted: **yes** (in the app and on the website).

## Before a public release

These are not code tasks in this app, but production depends on them:

1. **The product owner approves the app** (CLAUDE.md §13), and with it ADR-0019.
2. **Production API on a real domain** (Phase 9). The preview API (`*.sslip.io`) is team-only, can be reset, and writes phone codes to its log. Until then, ship to the **internal testing** track only.
3. **Real SMS (MSG91 + DLT)**, so phone login works. Until then the app opens on email login by default (it switches to phone automatically once `/meta` reports SMS delivery).
4. **Privacy policy and terms pages** on the website (Phase 9 legal pages). The app links to `/privacy` and `/terms`.
5. **Brand assets:** replace the Expo template icon, adaptive icon and splash in `apps/mobile/assets/` with the Dodoom artwork.
6. **The Android package id:** confirm `com.craftware.offerplatform` (permanent) or change it before the first upload.
7. **App links:** publish `assetlinks.json` (step 8 above).

## Known gaps and follow-ups

- **Push notifications** (FCM, decision pending). The inbox is polled when a tab opens and every minute while the app is open.
- **Shared helpers:** move `money`, `offer-form`, `types` and `insights` into `packages/shared` and import them from both apps.
- **Map picker for the shop location** (needs the maps vendor). Today it is "I am at the shop now" or typed coordinates, as on the website.
- **Kannada interface.** Search already understands Kannada.
- **iOS:** mostly configuration (bundle id, Apple account), not planned yet.
- **Automated device tests** (e.g. Maestro on an emulator in CI). Today: type-check, lint, unit tests and a full Metro bundle in CI. Before the first release, the screens were also driven in a browser against a real local API (see the change log).
