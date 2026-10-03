# Authenticated Dashboard process observation

Dashboard-owned additive RC89 contract. This does not change template authority,
enable remote apply, grant execution, or authorize a restart/deployment.

## Request and authentication

`GET /api/cli/v1/runtime` uses the same `requireCliAuth` middleware as `/identity`.
Use the existing CLI browser/PKCE login and keychain-backed session. Do not place
bearer credentials in arguments, fixtures, or logs. Missing/invalid authentication
returns the existing versioned `401` Error with `authentication_required`.
No workspace selection, config writes, model calls, or CLI probes occur.

Response is HTTP 200 JSON with `Cache-Control: no-store` and
`Vary: Authorization, Cookie`. Exact fields:

| Field | Meaning |
| --- | --- |
| `apiVersion` | `clawmax.instance/v1` |
| `kind` | `RuntimeObservation` |
| `instanceId` | Existing server-derived instance identity, as in discovery |
| `bootId` | Opaque random UUID generated once for this Dashboard process |
| `startedAt` | ISO timestamp estimated from process uptime; informational |
| `scope` | `dashboard-process` |

No keys, actor details, PID, hostname, paths, environment, or workspace contents
are included. The boot ID is not persisted, client-configurable, an authorization
token, or a monotonically increasing counter. Do not compare UUID ordering or rely
on wall-clock ordering. Restarting only OpenClaw does not change it.

## Executable evidence and fixtures

- Route/auth tests: `SYSTEM/dashboard/server/routes/instance-cli.test.ts`.
  Tests stable identity across separately mounted routers and fresh identity in a
  child process, in addition to bounded fields and authentication.
- Synthetic responses: `SYSTEM/dashboard/test/fixtures/instance-runtime-before.v1.json`
  and `instance-runtime-after.v1.json`. Values are illustrative, not live targets.

CLI should inspect the same explicit instance/profile before and after an
operator-authorized restart, reject an unexpected instance ID, and compare boot IDs.
Require independent evidence of that restart and the same pinned target. Behind a
multi-replica load balancer, a different ID can mean a different replica, not a
restart: pin one target or mark restart proof inconclusive. A missing route means
unsupported observation, never successful restart evidence. Health and same-ID
resource persistence must still be verified separately.

Pending joint acceptance: CLI client consumption and real authorized single-target
restart. This endpoint does not resolve workspace cleanup or Template lifecycle
contracts requested in the September 30 handoff.
