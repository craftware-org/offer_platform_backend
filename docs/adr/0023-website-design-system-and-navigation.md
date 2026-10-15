# ADR-0023: Website design system, phone tab bar and dark mode

- **Status:** Accepted (owner approved the UI plan on 2026-10-15: "Bright & friendly", bottom tab bar, dark mode now)
- **Date:** 2026-10-15
- **Numbering:** 0021 is MSG91 (PR #24) and 0022 is kept for the Android app (PR #18), so this is 0023.

## Context
The owner rated the website's look and navigation "1 out of 10". The header was one row of up to nine text links that wrapped on phones; buttons, cards and spacing differed from page to page; there were no icons, no dark mode and almost no motion. Most visitors will use phones.

## Options considered
1. **A component library (shadcn/ui, Radix, MUI).** Many ready parts, but a new styling layer next to Tailwind 4, a larger bundle, and its own CSP needs (some inject style tags).
2. **Our own small design system on Tailwind 4 (chosen).** Tokens and a few `@utility` classes in `globals.css`, plain React components, and one icon package.

## Decision
- **Tokens** in `globals.css` (`@theme`): a warm orange brand scale, warm grays, one font (Plus Jakarta Sans, self-hosted by `next/font`, no request to Google), radii, two shadows, three short animations. Shared classes: `btn-*`, `icon-btn`, `input`, `card`, `badge`, `chip`, `skeleton`, `page-title`, `section-title`.
- **Icons:** `lucide-react` (ISC licence, tree-shaken SVG components, no runtime CSS).
- **Navigation:**
  - **phones:** a fixed bottom tab bar (Home · Search · Saved · Alerts · Account/Log in) and a short top bar; following, the business portal and admin are reached from the Account page;
  - **desktop:** one top bar with search, Saved, notifications and an account menu (which also holds For businesses, Admin and the theme switch).
- **Dark mode:** `data-theme="dark"` on `<html>` overrides the Tailwind palette variables, so existing `bg-white` / `text-gray-*` classes switch without editing every page. The choice (Light / Dark / Device) is kept in `localStorage` (`op.theme`) and applied before the first paint by a small inline script that carries the CSP nonce. Text on orange uses `text-on-brand`, which stays white in both themes.
- Motion respects `prefers-reduced-motion`; focus rings are visible on keyboard focus only.

## Consequences
- Pages get consistent parts by using the shared classes; the next UI pull requests (home and search, offer and shop pages, business portal and admin, forms) restyle the pages on top of this.
- `text-white` on orange must be written `text-on-brand`, or it turns dark in dark mode.
- Dark mode is per browser (not saved to the account). Server-rendered pages briefly start light only if JavaScript is off.
- `--color-white` means "surface" in dark mode: use `text-on-brand` (or a literal colour) when white is really meant.
