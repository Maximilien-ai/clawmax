# Enterprise Session Bootstrap v0.1

Dashboard accepts the Enterprise `session-bootstrap` v0.1 claims contract as a
disabled-by-default server-to-server session bridge. The public gateway must
keep both the exchange credential and returned Dashboard session outside the
browser.

## Exchange

`POST /api/auth/session-bootstrap` with:

- `Authorization: Bearer <CLAWMAX_SESSION_BOOTSTRAP_SECRET>`
- `Content-Type: application/json`
- a strict v0.1 claims object as the request body

The claims object must contain exactly `contract_version`, `bootstrap_id`,
`actor_id`, `membership_id`, `tenant_id`, `workspace_id`, `runtime_id`,
`policy_version`, `entry_origin`, `audience`, `issued_at`, and `expires_at`.
The audience is `clawmax-dashboard-session`; the lifetime is positive and at
most five minutes; the bootstrap ID is one-time; and the entry value is an
exact HTTPS origin. Unknown fields are rejected.

A successful response is non-cacheable and contains:

```json
{
  "ok": true,
  "contract_version": "v0.1",
  "dashboard_session_token": "<opaque JWT>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

The gateway stores that token in its encrypted public-session binding and
injects it as an upstream bearer credential. It must not return the token to
browser JavaScript, forward it as a browser cookie, or reuse it after tenant
switching, logout, revocation, or expiry.

## Runtime configuration

The endpoint returns `404` unless session bootstrap configuration is present.
All values are required once any value is configured:

| Variable | Meaning |
|----------|---------|
| `CLAWMAX_SESSION_BOOTSTRAP_SECRET` | Dedicated per-runtime exchange secret, at least 32 characters |
| `CLAWMAX_TENANT_ID` | Exact tenant binding |
| `CLAWMAX_WORKSPACE_ID` | Exact workspace binding |
| `CLAWMAX_RUNTIME_ID` | Exact runtime binding |
| `CLAWMAX_POLICY_VERSION` | Exact current policy binding |
| `CLAWMAX_SESSION_BOOTSTRAP_ORIGINS` | Comma-separated exact HTTPS entry origins |
| `CLAWMAX_ENTERPRISE_SESSION_TTL_SECONDS` | Optional upstream session lifetime, 60–3600 seconds; default 900 |

Partial or invalid configuration fails closed with `503`. The exchange secret
must be distinct per runtime and delivered through the runtime's secret store,
not a stack document, image, URL, or browser response.

## Denial and replay behavior

- Missing or changed exchange credentials return `401`.
- Malformed, expired, future, overlong, or schema-invalid claims return `400`.
- Tenant, workspace, runtime, policy, and entry-origin substitutions return
  `403` without identifying which binding differed.
- Reuse of a consumed bootstrap ID returns `409`.
- The replay ledger persists only SHA-256 bootstrap ID hashes and fails closed
  if it cannot be decoded or updated.

Normal on-prem and single-tenant deployments are unchanged because the bridge
is opt-in. The accepted v0.1 claims contract requires HTTPS origins; a local
HTTP browser fixture therefore needs TLS termination or a separately accepted
contract change rather than an implicit Dashboard exception.
