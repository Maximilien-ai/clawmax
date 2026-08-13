# ClawMax 2.0 Endpoint Authorization Matrix

> Reviewed: August 12, 2026
> Executable source: `SYSTEM/dashboard/server/lib/api-authorization-matrix.ts`

The executable matrix contains 29 unique route families. The static boundary
suite verifies every protected router mount and matrix classification. The live
HTTP suite verifies unauthenticated denial, cloud bypass rejection, configured
and hostile origins, response headers, and API cache policy.

| Route family | Methods | Authorization | Scope |
|---|---|---|---|
| `/api/health` | GET | Public | Readiness only |
| `/api/auth/verify` | POST | Public | Legacy token verification |
| `/api/auth/*`, `/api/auth/config` | GET, POST | Public | Login/callback/logout/session and non-secret login flags |
| `/api/runtime/skill-broker/*` | POST | Signed capability | Exact workspace, agent, skill fingerprint, key, operation, expiry, and persisted grant |
| `/api/runtime/mail/*` | POST | Signed capability | Exact workspace, agent, owner fingerprint, account, capability, expiry, and persisted grant |
| `/api/workspace-dashboards/:token` | GET | Share token | Random 192-bit token; slug alone is rejected |
| `/api/system`, `/api/activity`, `/api/budget`, `/api/metering`, `/api/system/logs` | GET, PUT | Dashboard auth | Active workspace or dashboard process |
| `/api/docs/*` | GET, POST, DELETE | Dashboard auth | Active workspace with canonical path validation |
| `/api/agents/*` | GET, POST, PUT, PATCH, DELETE | Dashboard auth | Active workspace and selected agent |
| `/api/templates/*` | GET, POST, PUT, DELETE | Dashboard auth | System catalog reads and active-workspace writes |
| `/api/template-registry/*` | GET, POST | Dashboard auth | Remote catalog proxy and active-workspace imports |
| `/api/activity-export/*` | GET, POST, DELETE | Dashboard auth | Active user/workspace consent, destination, and queue |
| `/api/skills/*` | GET, POST, PUT, DELETE | Dashboard auth | Active workspace |
| `/api/skill-secret-broker/*` | GET, POST, PUT, DELETE | Dashboard auth | Operator secret and grant administration |
| `/api/mail/oauth/*` | GET, POST, DELETE | Dashboard auth | OAuth connections and grant administration |
| `/api/workflows/*` | GET, POST, PUT, PATCH, DELETE | Dashboard auth | Active workspace and selected workflow |
| `/api/ai/*`, `/api/ai-builder/*` | POST | Dashboard auth | Active workspace AI editing/planning |
| `/api/workspaces/*` | GET, POST, PUT, PATCH, DELETE | Dashboard auth | Validated explicit workspace id |
| `/api/notifications/*` | GET, POST, DELETE | Dashboard auth | Active workspace |
| `/api/integrations/*` | GET, POST, PUT | Dashboard auth | Active workspace configuration |
| `/api/plugins/*` | GET, POST, PUT, PATCH, DELETE | Dashboard auth | Active workspace and installed plugin host |
| `/api/teams/*` | GET, POST, PUT, PATCH, DELETE | Dashboard auth | Active workspace |
| `/api/groups/*`, `/api/communities/*` | GET, POST, PUT, DELETE | Dashboard auth | Active workspace channels |

## Negative Evidence

- `security-boundaries.test.ts`: 42 static/configuration assertions.
- `security-boundaries-dynamic.test.ts`: 14 live HTTP assertions.
- Broker and mail suites reject expired, mismatched, cross-agent,
  cross-workspace, cross-plugin, and wrong-fingerprint capabilities.
- Workspace manager, upload, route, agent execution/model/state, skill, workflow,
  transfer, budget, metering, and shared-dashboard suites verify request-local
  and active-workspace isolation.
- Plugin capability tests verify deny-by-default document and notification
  operations and filtered workspace context.

Authentication proves a dashboard session; it does not broaden the active
workspace. Capability authentication proves only the exact runtime operation
encoded in the signed token and persisted grant.

