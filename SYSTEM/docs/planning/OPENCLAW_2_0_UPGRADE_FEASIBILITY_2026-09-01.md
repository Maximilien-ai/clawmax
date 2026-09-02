# OpenClaw 2.0 Upgrade Feasibility

Date: 2026-09-01  
Spike branch: `spike/openclaw-2026.8.1`  
Target: OpenClaw `v2026.8.2` (latest OpenClaw 2.0 patch)
Previous ClawMax target: `v2026.6.34`

## Decision

OpenClaw 2.0 is not yet a low-friction upgrade and must not be merged into the
next RC until the remaining live Gateway lifecycle failure is resolved.

The keyed-agent and persistent-state migrations are contained, and the latest
strict gate reports 475/476 checks passing (99.8%). Branch coverage is 71.76%,
above the 71.54% pre-migration floor. The remaining test is release-critical:
after the launch-managed Gateway claims the OpenClaw state directory, its
process can exit before accepting WebSocket connections. OpenClaw then rejects
local execution because a Gateway owns the state while Gateway execution fails
with `ECONNREFUSED` or an opening-handshake timeout.

Recommendation: keep the spike branch unmerged. Diagnose the v2026.8.2 Gateway
process lifecycle/stale ownership state, prove a stable live chat, and rerun the
476-check gate. Only then reconsider the normal public and combined-image RC
build and smoke matrix.

## Evidence

### Target preparation

- The source pin is aligned in `SYSTEM/openclaw-version.sh`, Docker, and CI.
- OpenClaw `v2026.8.2` cloned and built successfully from source.
- The built CLI reports `OpenClaw 2026.8.2 (0965053)`.
- TypeScript passed.
- Pin alignment, preparation-contract, and Docker builder tests passed.
- Focused compatibility tests passed 187/187:
  - OpenClaw contract: 8
  - OpenClaw CLI resolver: 3
  - gateway RPC: 4
  - workflows: 76
  - agent routes: 63
  - chat routes: 33
- Organization import, keyed Gateway registration, and workflow execution pass.
- Live agent chat remains blocked by the Gateway lifecycle failure described in
  the decision above.

The valid full run explicitly set `OPENCLAW_BIN` to the isolated 2.0 binary.
An earlier partial run was discarded because the wrapper selected the globally
installed OpenClaw binary; it is not upgrade evidence.

### Full gate

Command:

```bash
OPENCLAW_BIN=/path/to/openclaw-2026.8.2/bin/openclaw \
  DASHBOARD_CLIENT_PORT=5174 \
  DASHBOARD_APP_URL=http://localhost:5174 \
  ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

Latest strict result:

- passed: 475
- failed: 1
- total: 476
- pass rate: 99.8%
- statements/lines: 82.06% (48,977/59,682)
- functions: 91.65% (1,888/2,060)
- branches: 71.76% (12,313/17,158)
- branch baseline before migration: 71.54%
- branch change: +0.22 percentage points
- remaining failure: live agent chat cannot reach the transient Gateway owner

## Confirmed Compatibility Changes

### Exact pnpm toolchain

OpenClaw 2.0 declares pnpm 12.1.0. ClawMax previously preferred any installed
`pnpm`, which attempted to switch versions and left a placeholder native CLI
when preparation used `--ignore-scripts`. Preparation now prefers Corepack,
uses a branch-local Corepack cache, and exposes a scoped pnpm shim to nested
OpenClaw build steps. The cached source build then completes successfully.

### Bundled channel catalog

The old preparation smoke expected `qqbot` in CLI startup metadata. OpenClaw
2.0 treats QQ Bot as an official external channel and no longer lists it as a
bundled startup option. The smoke now verifies the ClawMax-supported bundled
catalog entries: WhatsApp, Discord, Telegram, and Slack.

### Agent roster schema

OpenClaw 2.0 rejects the legacy array at `agents.list` and requires keyed
records at `agents.entries`. It also rejects `meta.lastTouchedAt`; runtime
machine-state now owns that timestamp.

Observed failure:

```text
OpenClaw config is invalid
- meta: Unrecognized key: "lastTouchedAt"
- agents: Unrecognized key: "list"
agents.list moved to keyed agents.entries
```

The initial probe caused organization-template registration to lose the
expected live agent model after the first registration. Remediation introduced
a central mutable-list projection for dashboard code and canonical keyed writes
for OpenClaw 2.0. Legacy duplicate IDs converge deterministically using the
upstream last-record-wins behavior, favoring the most recently appended active
workspace record.

Production roster consumers were migrated across:

- `server/lib/agent-execution.ts`
- `server/lib/agent-model.ts`
- `server/lib/gateway-rpc.ts`
- `server/lib/openclaw-agent-transfer.ts`
- `server/lib/openclaw-config.ts`
- `server/lib/plugin-system.ts`
- `server/lib/skills.ts`
- `server/lib/templates.ts`
- `server/lib/workspace.ts`
- `server/index.ts`
- `server/migrate-live-config.ts`
- `server/routes/agents.ts`

Focused tests cover legacy migration, idempotence, malformed data, duplicate
IDs, workspace selection, model and skill persistence, agent execution,
template registration, transfer, lifecycle deletion, Gateway patches, and
protected Gateway fields. The feasibility exercise also confirmed that an
existing 2.0 state directory may require a one-time `doctor --fix` migration
from per-agent auth JSON to SQLite. The migration preserved archived backups;
normal test runs do not invoke that repair against user state.

### Gateway registration and ownership

OpenClaw 2.0.2 does not grant configuration read/write scopes to the
dashboard's token-only WebSocket client even when those scopes are requested.
ClawMax now falls back to OpenClaw's paired CLI for `config.get` and
`config.patch`, using a single keyed-agent patch so large rosters do not exceed
command argument limits. Imported agents then appear in the canonical config.

The unresolved gap is after registration. A launch-managed Gateway can claim
the state directory while its listener is unavailable. ClawMax detects the
local/Gateway ownership collision and waits up to 30 seconds for authenticated
readiness, but v2026.8.2 can leave the port refused for the entire window. This
must be resolved upstream or with a deterministic lifecycle contract before
the branch is safe to merge.

## Upstream Benefits Verified

- `openclaw models refresh` is available for hosted catalog refresh.
- Model status/list/scan and provider authentication surfaces remain available.
- `openclaw status --usage` exposes provider usage/quota snapshots.
- Deep status explicitly probes WhatsApp, Telegram, Discord, and Slack.
- Secret configuration supports reference-backed values.

References:

- OpenClaw 2.0 release notes: <https://docs.openclaw.ai/releases/2026.8.1>
- Model discovery: <https://docs.openclaw.ai/providers/anthropic>
- Usage and cost reporting: <https://docs.openclaw.ai/reference/api-usage-costs>

## Next-RC Exit Criteria

- [x] Introduce and test one canonical ClawMax adapter for `agents.entries`.
- [x] Migrate legacy `agents.list` while preserving canonical IDs, workspaces,
  agent dirs, models, skills, runtime pins, defaults, and bindings.
- [x] Stop writing `meta.lastTouchedAt` while preserving `lastTouchedVersion` if
  supported by the upstream schema.
- [x] Add disposable-config migration tests, including idempotence and safe failure.
- [x] Run the focused compatibility suites with zero failures.
- [ ] Stabilize the v2026.8.2 Gateway process after it claims state ownership.
- [ ] Run the complete integration, validation, and coverage gate with zero
  failures and record the restored check count (current: 475/476).
- [ ] Build and smoke the public amd64 and arm64 images.
- [ ] For a combined release, build and smoke the matching private plugin image.
- [ ] Verify packaged runtime identity, plugin/channel discovery, agent create,
  agent chat, workflows, restart persistence, model discovery, and usage.

The source upgrade is not ready to merge. Keep it on the spike branch until the
Gateway lifecycle gap and the remaining strict-gate failure are resolved. Do
not start RC image work from this branch.
