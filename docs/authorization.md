# Authorization

All checks happen in the backend. Anything a frontend hides is only cosmetic.

## Model

- **Roles:** `CUSTOMER`, `BUSINESS_OWNER`, `BUSINESS_STAFF`, `ADMIN`, `SUPER_ADMIN`
- **Permissions** are what endpoints check (e.g. `users:read`), never role names.
- The single source of truth is `apps/api/src/modules/access-control/access-control.catalog.ts`. `pnpm db:seed` syncs it into the `roles`, `permissions` and `role_permissions` tables, and is safe to run on every deploy.

| Role | Permissions |
|---|---|
| CUSTOMER | none (acts only on own data) |
| BUSINESS_OWNER / BUSINESS_STAFF | none globally; access to a business comes from membership in `business_staff` |
| ADMIN | `users:read`, `users:manage-status`, `audit:read`, `businesses:read`, `businesses:verify`, `businesses:manage`, `categories:manage`, `locations:manage`, `offers:read`, `offers:moderate`, `reports:moderate`, `analytics:read` |
| SUPER_ADMIN | all ADMIN permissions + `roles:assign`, `settings:manage` |

### Business-scoped access

A user can manage a business, and its offers, only if they are listed for it in `business_staff` (the registering user is `OWNER`). Anyone else gets **404**, not 403, so business and offer ids can't be probed. An admin who owns or manages a business can neither verify it nor approve its offers.

## Request pipeline

Three global guards run in order on every request:

1. **IpRateLimitGuard**: per-IP budget in Redis (shared by all instances).
2. **AuthGuard**: requires a valid access token unless the endpoint is marked `@Public()`. It loads the user's current status, roles and permissions from the database, so a suspension or role change applies immediately. `@OptionalAuth()` endpoints (Phase 7: `POST /events`, `GET /discover/offers`) are public too, but a valid token, if sent, still identifies the caller; a missing or invalid token just means "anonymous" and never fails the request.
3. **PermissionsGuard**: enforces `@RequirePermissions(...)`.

Secure by default: a new endpoint without `@Public()` requires login.

**2-step login for admin permissions (Phase 8, ADR-0018):** the permissions guard also requires that the session passed the authenticator step, and checks the database, so a reset takes effect at once. Without it: `403 MFA_SETUP_REQUIRED` or `MFA_REQUIRED`. A test in `test/security.e2e-spec.ts` walks **every** route and checks that visitors get 401, customers get 403 on admin routes, and admins without 2-step login get `MFA_SETUP_REQUIRED`. New routes are covered automatically.

## Rules

- Every registered user has `CUSTOMER`.
- Only `ADMIN` and `SUPER_ADMIN` can be granted through the admin API. `BUSINESS_OWNER` is granted automatically when a user registers a business.
- An admin cannot change their own account status. A super admin cannot remove their own `SUPER_ADMIN` role, which prevents accidental lock-out.
- Suspended users cannot have roles changed (reactivate first).
- Every status change and role change is written to `audit_logs` with actor, old/new values, reason and request id.

## Bootstrapping the first super admin

There is no default admin account. After the person has logged in once, run:

```bash
pnpm --filter @offer-platform/api admin:grant-role --phone <number> --role SUPER_ADMIN
```

The grant is audited as a system action (`via: "cli"`).
