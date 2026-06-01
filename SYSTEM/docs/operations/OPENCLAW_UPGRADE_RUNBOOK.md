# OpenClaw Upgrade Runbook

Use this runbook when updating ClawMax to a newer OpenClaw release.

## Goal

Keep ClawMax on a recent, deliberate OpenClaw baseline without letting local dev, CI, Docker, and published images drift onto different runtimes.

## Current Baseline

- ClawMax release line: `v1.7.0`
- Tested OpenClaw target: `v2026.5.26`
- Source of truth:
  - [SYSTEM/openclaw-version.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/openclaw-version.sh)

## Where the Pin Matters

When upgrading OpenClaw, verify all of these stay aligned:

1. local/dev scripts
- [SYSTEM/openclaw-cli.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/openclaw-cli.sh)
- [SYSTEM/start.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/start.sh)
- [SYSTEM/test.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/test.sh)
- [SYSTEM/doctor.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/doctor.sh)

2. CI
- `.github/workflows/ci.yml`

3. image/runtime packaging
- [Dockerfile](/Users/maximilien/github/Maximilien-ai/clawmax-codex/Dockerfile)
- any release/image workflow that builds or stages OpenClaw

4. dashboard runtime assumptions
- gateway RPC protocol expectations
- packaged skill/channel discovery paths
- CLI resolution and spawn paths

## Upgrade Procedure

1. Pick the target deliberately
- prefer the latest stable OpenClaw release
- avoid silently drifting to prerelease/beta
- record the target in `SYSTEM/openclaw-version.sh`

2. Read the upstream delta
- inspect release notes
- look specifically for:
  - gateway auth/protocol changes
  - RPC method/shape changes
  - packaging/layout changes
  - CLI flag/command changes
  - skills/channels packaging changes

3. Align the pin everywhere
- update `SYSTEM/openclaw-version.sh`
- update CI/image paths that build or install OpenClaw
- confirm local overrides or global installs do not accidentally test an older runtime

4. Run focused compatibility tests
- `server/lib/openclaw-contract.test.ts`
- `server/lib/openclaw-cli.test.ts`
- `server/lib/gateway-rpc.test.ts`
- `server/routes/chat.test.ts`
- `server/routes/logs-routes.test.ts`
- `server/routes/agents.test.ts`
- `server/lib/workflows.test.ts`

5. Run the standard suite

```bash
DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test-with-server.sh integration
```

6. Run manual smoke
- use [MANUAL_RELEASE_SMOKE_CHECKLIST.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/MANUAL_RELEASE_SMOKE_CHECKLIST.md)
- minimum:
  - Builder handoff
  - agent create/edit/chat
  - one template apply
  - one workflow run
  - Skills assign/setup
  - `/api/system`

7. Validate real built images
- cloud
- on-prem
- verify:
  - `openclaw --version`
  - gateway startup/readiness
  - agent chat
  - workflow execution
  - packaged skills/channels load correctly

## Known High-Risk Areas

- gateway readiness vs fallback timing
- provider/BYOK auth profile handoff
- workflow execution session behavior
- packaged bundled skills/channels layout
- CLI path resolution across local vs image runtimes

## Release Cadence Recommendation

Repeat this pass roughly every two weeks when upstream OpenClaw is moving:

1. check upstream stable release
2. decide whether to adopt it
3. update the pin on a branch
4. rerun focused tests plus the standard suite
5. do a short manual smoke
6. only then merge and ship

## Exit Criteria

Treat an OpenClaw upgrade as release-ready only when:

- local/dev, CI, and image paths are on the same tested target
- the automated suite is green
- manual smoke is green
- cloud/on-prem built images are validated
