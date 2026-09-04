# OpenClaw 2.0 Upgrade Feasibility

Date: 2026-09-01  
Spike branch: `spike/openclaw-2026.8.1`  
Target: OpenClaw `v2026.8.2` (latest OpenClaw 2.0 patch)
Previous ClawMax target: `v2026.6.34`

## Decision

OpenClaw 2.0 is ready to merge into the next RC. The strict gate passes all
476/476 checks (100%) against OpenClaw v2026.8.2, including live native agent
creation, immediate chat, workflow execution, restart recovery, and canonical
Gateway configuration. Branch coverage is 71.66%, above the 71.54%
pre-migration floor.

The compatibility work moved agent creation/deletion to OpenClaw's native
lifecycle, migrated legacy credentials and sessions to SQLite-backed state,
and made cold-start readiness deterministic. Large-roster performance remains
the main operational risk: on this heavily populated development host, native
agent mutations can take roughly 40–50 seconds while OpenClaw rebuilds metadata.
The final live chat completed in 65.7 seconds and workflow kickoff in 101.0
seconds. These operations completed correctly and the release gate stayed
green, but RC testing should explicitly watch latency and memory on smaller,
representative on-prem and cloud rosters.

Recommendation: merge the spike and include OpenClaw v2026.8.2 in the next RC.
Treat large-roster performance as follow-up hardening and retain the bounded
version-plus-connectivity readiness gate for CI and local release validation.

## Evidence

### Target preparation

- The source pin is aligned in `SYSTEM/openclaw-version.sh`, Docker, and CI.
- OpenClaw `v2026.8.2` cloned and built successfully from source.
- The built CLI reports `OpenClaw 2026.8.2 (0965053)`.
- TypeScript passed.
- Pin alignment, preparation-contract, and Docker builder tests passed.
- Focused compatibility suites pass, including:
  - OpenClaw contract: 8
  - OpenClaw CLI resolver: 3
  - gateway RPC: 4
  - workflows: 76
  - agent routes: 63
  - chat routes: 33
- Organization import, keyed Gateway registration, and workflow execution pass.
- Live agent chat and workflow execution pass through the v2026.8.2 Gateway.

The valid full run used the wrapper's isolated target preparation and verified
both CLI and Gateway identity as v2026.8.2 before testing. An earlier partial
run was discarded because it selected the globally installed OpenClaw binary;
it is not upgrade evidence.

### Full gate

Command:

```bash
./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

Latest strict result (commit `8aeb1e0a`):

- passed: 476
- failed: 0
- total: 476
- pass rate: 100%
- statements/lines: 81.92% (49,261/60,129)
- functions: 91.52% (1,901/2,077)
- branches: 71.66% (12,373/17,264)
- branch baseline before migration: 71.54%
- branch change: +0.12 percentage points
- live agent chat: passed (`HELLO`, 65.7-second round trip)
- workflow kickoff: passed (101.0 seconds)

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

Agent provisioning and deletion now use the native lifecycle. ClawMax also
waits for exact version identity plus a successful connectivity probe after a
targeted Gateway restart, covering OpenClaw 2's slower cold start without
accepting a merely listening but unresponsive process. The large-roster
metadata rebuild still introduces material latency, but native lifecycle calls,
chat, and workflow execution all completed during the strict gate.

A separate one-time host cleanup quarantined 247 identical synthetic invalid
skill fixtures from the repository workspace at
`/tmp/clawmax-invalid-skill-quarantine-E1cuAB`. A clean restart and rerun still
reproduced the failure, proving those fixtures amplified noise but were not the
root cause.

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
- [x] Integrate OpenClaw 2 native `agents.create`/`agents.update`, or establish a
  deterministic reload-complete contract, for template agent registration.
- [x] Verify registration and immediate chat on the current large-roster host
  without an opening-handshake timeout. Track the observed latency separately.
- [x] Run the complete integration, validation, and coverage gate with zero
  failures and record the restored check count (476/476).
- [ ] Build and smoke the public amd64 and arm64 images.
- [ ] For a combined release, build and smoke the matching private plugin image.
- [ ] Verify packaged runtime identity, plugin/channel discovery, agent create,
  agent chat, workflows, restart persistence, model discovery, and usage.

The source upgrade is ready to merge and proceed to RC image validation. The
remaining exit criteria are packaged-image and representative-environment
checks, not source compatibility blockers.
