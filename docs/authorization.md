# Authorization

All checks happen in the backend. Anything a frontend hides is only cosmetic.

## Model

- **Roles:** `CUSTOMER`, `BUSINESS_OWNER`, `BUSINESS_STAFF`, `ADMIN`, `SUPER_ADMIN`
- **Permissions** are what endpoints check (e.g. `users:read`), never role names.
- The single source of truth is `apps/api/src/modules/access-control/access-control.catalog.ts`. `pnpm db:seed` syncs it into the `roles`, `permissions` and `role_permissions` tables, and is safe to run on every deploy.

| Role | Permissions (Phase 1) |
|---|---|
| CUSTOMER | none (acts only on own data) |
| BUSINESS_OWNER / BUSINESS_STAFF | none globally; access is scoped per business (Phase 2) |
| ADMIN | `users:read`, `users:manage-status`, `audit:read` |
| SUPER_ADMIN | all ADMIN permissions + `roles:assign` |

## Request pipeline

Three global guards run in order on every request:

1. **IpRateLimitGuard**: per-IP budget in Redis (shared by all instances).
2. **AuthGuard**: requires a valid access token unless the endpoint is marked `@Public()`. It loads the user's current status, roles and permissions from the database, so a suspension or role change applies immediately.
3. **PermissionsGuard**: enforces `@RequirePermissions(...)`.

Secure by default: a new endpoint without `@Public()` requires login.

## Rules

- Every registered user has `CUSTOMER`.
- Only `ADMIN` and `SUPER_ADMIN` can be granted through the admin API. Business roles will come from business registration flows.
- An admin cannot change their own account status. A super admin cannot remove their own `SUPER_ADMIN` role, which prevents accidental lock-out.
- Suspended users cannot have roles changed (reactivate first).
- Every status change and role change is written to `audit_logs` with actor, old/new values, reason and request id.

## Bootstrapping the first super admin

There is no default admin account. After the person has logged in once, run:

```bash
pnpm --filter @offer-platform/api admin:grant-role --phone <number> --role SUPER_ADMIN
```

The grant is audited as a system action (`via: "cli"`).
