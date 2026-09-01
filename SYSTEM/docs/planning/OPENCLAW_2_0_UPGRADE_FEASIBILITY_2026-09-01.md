# OpenClaw 2.0 Upgrade Feasibility

Date: 2026-09-01  
Spike branch: `spike/openclaw-2026.8.1`  
Target: OpenClaw `v2026.8.1` (OpenClaw 2.0)  
Previous ClawMax target: `v2026.6.34`

## Decision

OpenClaw 2.0 is a low-friction upgrade and should be targeted for the next RC.

The keyed-agent migration is contained behind a central adapter. The complete
ClawMax integration, validation, and coverage gate now reports 473/473 passing
checks. Branch coverage is 71.77%, above the 71.54% pre-migration floor.

Recommendation: merge after review, then complete the normal public and
combined-image RC build and smoke matrix. Those packaging checks remain RC
release evidence; they are no longer feasibility blockers.

## Evidence

### Target preparation

- The source pin is aligned in `SYSTEM/openclaw-version.sh`, Docker, and CI.
- OpenClaw `v2026.8.1` cloned and built successfully from source.
- The built CLI reports `OpenClaw 2026.8.1 (ea80657)`.
- TypeScript passed.
- Pin alignment, preparation-contract, and Docker builder tests passed.
- Focused compatibility tests passed 187/187:
  - OpenClaw contract: 8
  - OpenClaw CLI resolver: 3
  - gateway RPC: 4
  - workflows: 76
  - agent routes: 63
  - chat routes: 33
- Live integration passed, including agent chat and workflow execution.

The valid full run explicitly set `OPENCLAW_BIN` to the isolated 2.0 binary.
An earlier partial run was discarded because the wrapper selected the globally
installed OpenClaw binary; it is not upgrade evidence.

### Full gate

Command:

```bash
OPENCLAW_BIN=/path/to/openclaw-2026.8.1/bin/openclaw \
  DASHBOARD_CLIENT_PORT=5174 \
  DASHBOARD_APP_URL=http://localhost:5174 \
  ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

Remediation result:

- passed: 473
- failed: 0
- total: 473
- pass rate: 100%
- statements/lines: 82.12% (48,897/59,543)
- functions: 91.62% (1,882/2,054)
- branches: 71.77% (12,288/17,121)
- branch baseline before migration: 71.54%
- branch change: +0.23 percentage points
- live integration duration: 51 seconds

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
protected Gateway fields. No test invoked `doctor --fix` against a user's real
configuration.

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
- [x] Run the complete integration, validation, and coverage gate with zero
  failures and record the restored check count.
- [ ] Build and smoke the public amd64 and arm64 images.
- [ ] For a combined release, build and smoke the matching private plugin image.
- [ ] Verify packaged runtime identity, plugin/channel discovery, agent create,
  agent chat, workflows, restart persistence, model discovery, and usage.

The source upgrade is ready for review and merge. Keep it on the spike branch
until review completes; do not call the RC release-ready until the remaining
image and smoke evidence is green.
