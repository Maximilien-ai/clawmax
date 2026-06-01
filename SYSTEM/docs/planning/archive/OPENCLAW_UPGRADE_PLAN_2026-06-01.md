# OpenClaw Upgrade Plan

Date: 2026-06-01
Branch: `openclaw-upgrade`
Goal: upgrade ClawMax from the current pinned OpenClaw ref to the latest stable upstream release, get the full current automated suite green, and prepare the release candidate for `1.7.0`.

## Current State

- Current pinned OpenClaw ref in [Dockerfile](/Users/maximilien/github/Maximilien-ai/clawmax-codex/Dockerfile): `1116ae97662cce066dd130bc07d925fdd1dd3f32`
- Current `main` remains stable on the old OpenClaw pin.
- Upgrade work is isolated on `openclaw-upgrade`.

## Immediate Problem: We Do Not Have One OpenClaw Version Today

Before changing the upgrade target, we need to acknowledge that ClawMax currently exercises multiple OpenClaw baselines:

1. Docker/runtime image
- pinned by `OPENCLAW_GIT_REF=1116ae97662cce066dd130bc07d925fdd1dd3f32` in [Dockerfile](/Users/maximilien/github/Maximilien-ai/clawmax-codex/Dockerfile)

2. CI
- `.github/workflows/ci.yml` currently clones OpenClaw and attempts `git checkout v0.2.16`
- if that path fails or drifts, CI is not guaranteed to match the runtime image

3. local/dev environments
- local machines may already have a different globally installed `openclaw`
- recent real-machine checks showed a working local CLI around `2026.3.13`

### Upgrade implication

The first upgrade step is not “change to latest”.
The first upgrade step is:

- define one OpenClaw source of truth for this branch
- make Docker, CI, and local branch testing use that same baseline deliberately

Without that, the branch can appear green while each environment is testing a different OpenClaw behavior.

## Target Selection

- Preferred upgrade target: latest stable upstream OpenClaw release
- Do not target beta/prerelease first unless the stable release is blocked for a specific reason
- If stable is too disruptive, document the blocker instead of silently drifting to prerelease

### Current target choice

- target stable: `v2026.5.26`
- do not target `v2026.6.1-beta.1` first

### Important packaging finding

- `v2026.5.26` is no longer a root Go CLI checkout
- it is a Node/PNPM workspace package with:
  - `bin.openclaw = openclaw.mjs`
  - `engines.node = >=22.19.0`
  - explicit `build:docker` packaging flow

Upgrade implication:

- old `git clone && go build -o openclaw .` assumptions are invalid on this branch target
- CI, Docker, and any local isolated branch prep must use the Node package build/install path instead

### Why this target

- it is the latest stable upstream release as of 2026-06-01
- upstream release notes emphasize Gateway/runtime, transcript, channel, provider, and install/update hardening, which overlaps directly with ClawMax’s main OpenClaw dependency surface
- the beta line should only be used if the stable line is blocked and we have a specific reason

### Known likely delta from the current baseline

Even before the exact pin-to-release mapping is finalized, there is already one likely compatibility pressure point:

- stricter exec approval behavior appeared in newer 2026.3.x / 2026.4.x era OpenClaw builds
- that can affect agent runtime behavior, workflow execution, and any assumptions around safe command execution in trusted directories

This means the upgrade work must explicitly validate:

- workflow execution
- agent chat actions that trigger tools/commands
- skill setup/install flows
- any local/runtime command allowlist assumptions

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
- confirm whether the current pinned ref maps roughly to the local/dev `2026.3.13` baseline or another nearby release

### Phase 1.5: Unify the branch on one OpenClaw baseline

- decide the target release/ref for `openclaw-upgrade`
- update Docker runtime pin to that exact target
- update CI so it uses that exact same target and the correct Node-based install flow
- keep local testing branch-scoped via:
  - `OPENCLAW_BIN`
  - `OPENCLAW_SKILLS_DIR`

This must happen before trusting any green test run on the branch.

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
- should CI install OpenClaw from the same packed artifact/ref as the Docker image instead of cloning a separate tag path?
