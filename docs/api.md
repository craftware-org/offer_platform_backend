# API conventions

Base path: `/api/v1`. Interactive docs are at `/api/docs` in non-production environments. The machine-readable contract (`openapi.json`) is exported by CI on every run.

## Responses

Success:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 20, "totalItems": 42, "totalPages": 3 } }
```

`meta` appears only on paginated lists. A `204 No Content` response has no body.

Error:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "fields": { "phone": "Invalid phone number" } },
  "requestId": "01a0f1de-..."
}
```

Clients should branch on `error.code`. Codes are stable and never renamed:

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input failed validation; see `fields` |
| `BAD_REQUEST` | 400 | Malformed request (e.g. invalid JSON) |
| `UNAUTHENTICATED` | 401 | Missing, invalid or expired access token |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token unknown, expired, revoked or reused |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `ACCOUNT_SUSPENDED` | 403 | The account is suspended |
| `NOT_FOUND` | 404 | Resource or route does not exist |
| `CONFLICT` | 409 | Violates a uniqueness or state rule |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 100 KB |
| `RATE_LIMITED` | 429 | Too many requests; wait `Retry-After` seconds |
| `OTP_INVALID` | 400 | Wrong, expired or already-used code |
| `OTP_ATTEMPTS_EXCEEDED` | 400 | Too many wrong codes; request a new one |
| `SERVICE_UNAVAILABLE` | 503 | A dependency (DB, Redis, SMS) is unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected error (details are logged, never returned) |

## Conventions

- JSON only. Field names are `camelCase`. Unknown body fields are rejected.
- Timestamps are ISO-8601 in UTC.
- Money (from Phase 3) is an integer number of **paise** ([ADR-0008](adr/0008-money-and-time.md)).
- Every response carries `X-Request-Id`. A client may send its own safe id (`[A-Za-z0-9._-]{1,64}`), and it will be echoed and logged.
- Pagination: `?page=1&pageSize=20` (maximum 50) for admin lists. Feeds will use cursors (Phase 4).
- Rate limits: a global per-IP budget (default 300/min) plus stricter limits on OTP endpoints.

## Endpoints (Phase 1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness |
| GET | `/health/ready` | public | Database + Redis reachability |
| POST | `/auth/otp/request` | public | Send a login code to a phone |
| POST | `/auth/otp/verify` | public | Verify code, get tokens; creates the account on first login |
| POST | `/auth/refresh` | public (refresh token) | Rotate tokens |
| POST | `/auth/logout` | public (refresh token) | End the session |
| DELETE | `/auth/account` | user | Delete own account (erases personal data) |
| GET | `/users/me` | user | Profile, roles, permissions |
| PATCH | `/users/me` | user | Update name / email |
| GET | `/admin/users` | `users:read` | Search and filter users |
| GET | `/admin/users/:id` | `users:read` | User detail |
| PATCH | `/admin/users/:id/status` | `users:manage-status` | Suspend / reactivate, with reason |
| POST | `/admin/users/:id/roles` | `roles:assign` | Grant ADMIN / SUPER_ADMIN |
| DELETE | `/admin/users/:id/roles/:role` | `roles:assign` | Revoke ADMIN / SUPER_ADMIN |
| GET | `/admin/audit-logs` | `audit:read` | Audit trail, filterable |
