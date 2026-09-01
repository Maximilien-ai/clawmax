# OpenClaw 2.0 Upgrade Feasibility

Date: 2026-09-01  
Spike branch: `spike/openclaw-2026.8.1`  
Target: OpenClaw `v2026.8.1` (OpenClaw 2.0)  
Previous ClawMax target: `v2026.6.34`

## Decision

OpenClaw 2.0 meets the ClawMax low-friction discovery threshold, but it is not
ready to merge or release yet.

The complete ClawMax integration, validation, and coverage gate reported
470/472 passing checks (99.58%). This exceeds the required 90% feasibility
threshold. At least one remaining failure is in a release-critical
configuration contract, so the upgrade must not enter an RC until the agent
roster migration is complete and the full gate, image builds, and smoke tests
are green.

Recommendation: remediate on this spike branch and target the next RC if the
keyed-agent migration remains contained. Defer to a later RC if the migration
requires compatibility writes to both schemas or cannot preserve existing
installations without loss.

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

Result:

- passed: 470
- failed: 2
- total: 472
- pass rate: 99.58%
- statements/lines: 81.91% (48,755/59,520)
- functions: 91.51% (1,876/2,050)
- branches: 71.40% (12,178/17,055)
- live integration duration: 78 seconds
- observed complete-gate wall time: approximately 13 minutes

Coverage from a failing gate is diagnostic only. Re-establish the coverage
baseline after the compatibility fixes and a completely green run.

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

This caused organization-template registration to lose the expected live
agent model after the first registration. The affected test was
`importOrganizationTemplate creates nested teams and workflow handoff metadata`.
The bounded terminal output preserved the final count but truncated the other
failed top-level check. Capture its exact name from a complete retained log on
the remediation rerun instead of inferring it from intermediate artifacts.

The migration is broader than a single template fix. Production server code
currently has 49 `agents.list` references across eight files:

- `server/lib/agent-execution.ts`
- `server/lib/agent-model.ts`
- `server/lib/gateway-rpc.ts`
- `server/lib/openclaw-agent-transfer.ts`
- `server/lib/skills.ts`
- `server/lib/templates.ts`
- `server/lib/workspace.ts`
- `server/routes/agents.ts`

Implement a central roster adapter and explicit one-way migration rather than
performing isolated string replacements. Tests must cover duplicate IDs,
workspace-specific records, model and skill persistence, bindings, rollback,
and existing legacy installations. Never run `doctor --fix` against a user's
real configuration during testing.

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

- Introduce and test one canonical ClawMax adapter for `agents.entries`.
- Migrate legacy `agents.list` without losing IDs, workspaces, agent dirs,
  models, skills, runtime pins, defaults, or bindings.
- Stop writing `meta.lastTouchedAt` while preserving `lastTouchedVersion` if
  supported by the upstream schema.
- Add a disposable-config migration test, including idempotence and rollback.
- Run the focused compatibility suites with zero failures.
- Run the complete integration, validation, and coverage gate with zero
  failures and record the restored check count.
- Build and smoke the public amd64 and arm64 images.
- For a combined release, build and smoke the matching private plugin image.
- Verify packaged runtime identity, plugin/channel discovery, agent create,
  agent chat, workflows, restart persistence, model discovery, and usage.

Until these criteria pass, keep the OpenClaw 2.0 pin on the spike branch and do
not include it in an RC.
