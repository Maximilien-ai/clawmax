# OpenClaw Upgrade Plan

Date: 2026-06-01
Branch: `openclaw-upgrade`
Goal: upgrade ClawMax from the current pinned OpenClaw ref to the latest stable upstream release, get the full current automated suite green, and prepare the release candidate for `1.7.0`.

## Current State

- Current pinned OpenClaw ref in [Dockerfile](/Users/maximilien/github/Maximilien-ai/clawmax-codex/Dockerfile): `1116ae97662cce066dd130bc07d925fdd1dd3f32`
- Current `main` remains stable on the old OpenClaw pin.
- Upgrade work is isolated on `openclaw-upgrade`.

## Target Selection

- Preferred upgrade target: latest stable upstream OpenClaw release
- Do not target beta/prerelease first unless the stable release is blocked for a specific reason
- If stable is too disruptive, document the blocker instead of silently drifting to prerelease

## First Rule: Keep Old and New OpenClaw Isolated

We should not replace the machine-global `openclaw` binary just to test this branch.

### Isolation strategy

- `main` keeps the old OpenClaw pin
- `openclaw-upgrade` gets the new OpenClaw pin
- local branch testing should use explicit overrides:
  - `OPENCLAW_BIN=/path/to/new/openclaw`
  - `OPENCLAW_SKILLS_DIR=/path/to/new/openclaw/skills`

### Isolation work completed

The following host scripts now honor `OPENCLAW_BIN` instead of assuming global `openclaw`:

- [SYSTEM/openclaw-cli.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/openclaw-cli.sh)
- [SYSTEM/start.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/start.sh)
- [SYSTEM/test.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/test.sh)
- [SYSTEM/doctor.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/doctor.sh)

### Recommended local test pattern

```bash
OPENCLAW_BIN=/absolute/path/to/new/openclaw \
OPENCLAW_SKILLS_DIR=/absolute/path/to/new/openclaw/skills \
DASHBOARD_CLIENT_PORT=5174 \
DASHBOARD_APP_URL=http://localhost:5174 \
./SYSTEM/test-with-server.sh integration
```

## Highest-Risk Contract Surfaces

These are the places most likely to break when OpenClaw changes:

1. Gateway authentication / challenge-response
- handshake shape
- token/device auth expectations
- scope behavior
- control-ui/admin auth assumptions

2. Gateway RPC methods and payloads
- method names
- argument shape
- response shape
- missing/renamed methods

3. CLI behavior
- `openclaw agents add`
- `openclaw workflow run`
- `openclaw gateway status`
- `openclaw config get/set`

4. `openclaw.json` contract
- gateway config shape
- agent list shape
- metadata validation rules
- workspace registration assumptions

5. Skills loading
- skill directory layout
- frontmatter parsing
- install/setup metadata shape
- bundled skills discovery path

6. Shared-gateway assumptions
- single shared gateway vs per-agent behavior
- agent routing in workflows/chat
- status probing

## Existing Automated Coverage That Should Protect the Upgrade

These suites should be run before and after the pin bump:

- OpenClaw contract tests
- OpenClaw CLI resolver tests
- OpenClaw config helper tests
- OpenClaw agent transfer tests
- gateway diagnostics / gateway RPC tests
- route contract tests across all current server routes
- integration suite with live agent execution
- installer / setup / update / uninstall shell tests

## Upgrade Phases

### Phase 1: Confirm upstream target and release delta

- identify the exact latest stable OpenClaw release
- capture release notes and API/runtime changes
- compare against our pinned ref
- list likely breaking areas before changing code

### Phase 2: Make branch-local OpenClaw usage explicit everywhere needed

- done for host scripts via `OPENCLAW_BIN`
- verify whether any remaining local/dev paths still assume global `openclaw`
- decide whether we also need an isolated OpenClaw config home for parallel local testing

### Phase 3: Change the pinned OpenClaw ref on this branch only

- update Dockerfile pin
- update CI/build paths if they also pin or build OpenClaw separately
- keep `main` untouched until upgrade is proven

### Phase 4: Run full automated suite

- unit / route / contract tests
- integration tests
- focused manual smoke:
  - chat
  - workflow execution
  - template apply
  - skills add/setup
  - agent create / AI generate handoff

### Phase 5: Fix breakages until the branch is stable

- treat failures as contract mismatches first
- only relax tests when the old assumption is clearly no longer valid and the new behavior is correct

## Acceptance Criteria for `1.7.0`

- latest stable OpenClaw is pinned on this branch
- full current automated suite passes
- OpenClaw/Gateway contract tests pass without weakening critical assertions
- integration suite passes against the upgraded runtime
- manual smoke passes for:
  - agent chat
  - workflow run
  - template apply
  - skills setup/add
  - `/api/system`
  - Doctor / startup behavior

## Open Questions

- do we need a repo-local OpenClaw config home override in addition to `OPENCLAW_BIN`?
- do any cloud/container paths still bypass the new override model?
- does the latest stable release change gateway auth or method contracts enough that we need a compatibility shim layer?
