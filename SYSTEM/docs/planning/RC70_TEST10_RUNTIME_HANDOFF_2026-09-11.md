# RC70 Test10 Runtime Handoff — 2026-09-11

## Decision

RC69 is a useful test10 canary but must not be promoted. Both architecture
images and the multi-architecture manifest were published, while the registry
smoke gate failed a real exact-ID lifecycle case. RC70 must close that failure,
make cold gateway startup deterministic, and complete the instance CLI surface
needed by the Maximilien.ai Operations demo.

## RC69 evidence

- Public source: `8213b525` (`fix: keep shared agent turns on gateway`).
- Tag: `v2.0.0-test-rc69`.
- OpenClaw: `2026.8.2` at `0965053`.
- Required local gate: 480 passed, 0 failed.
- Branch coverage: 71.86%, up from 71.71%.
- Public image workflow: <https://github.com/Maximilien-ai/clawmax/actions/runs/34636998016>.
- AMD64 build: passed.
- ARM64 build: passed.
- Multi-architecture manifest: passed.
- Registry smoke: failed; therefore the combined private image was not
  dispatched and RC69 is not promotable.

The registry smoke started healthy on AMD64 in 13 seconds and initially
completed gateway-backed mock-Ollama chat. After create, chat, remove-state,
and immediate same-ID recreation, the new chat failed with:

```text
Error: no such table: session_key_contract: code=ERR_SQLITE_ERROR
```

## Test10 canary state

Test10 currently runs:

```text
ghcr.io/maximilien-ai/clawmax-dashboard:2.0.0-test-rc69-amd64
```

Observed after a complete pod restart:

- `/api/health`: HTTP 200.
- `/api/cli/v1/discovery`: JSON HTTP 200.
- Stable instance ID: `cld-test10-molljk0d`.
- Exact CLI baseline `041754d` returned structured `InstanceStatus` twice.
- Gateway authenticated RPC: healthy, OpenClaw `2026.8.2`.
- PVC: expanded from 2 GiB to 4 GiB; about 2.6 GiB free after expansion.
- Required test10 deployment settings:

```text
CLAWMAX_INSTANCE_KEY=cld-test10-molljk0d
CLAWMAX_GATEWAY_READY_TIMEOUT_SEC=75
CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC=90
```

Test10 has no server-side OpenAI credential. Browser chat still requires the
user's BYOK key. The gateway itself is proven healthy, but a credentialed
streamed chat remains an external-environment acceptance check.

## RC70 required work

### 1. Eliminate the gateway supervisor race

On populated test10 state, the gateway cold start took about 60 seconds. The
RC69 watchdog began recovery while the original process was still starting,
terminated it near readiness, and started a second process that collided with
the first process's state-directory ownership.

RC70 must coordinate initial readiness and watchdog ownership rather than rely
only on larger timers:

- The watchdog must not recover while the initial gateway process is within its
  allowed cold-start window.
- Only one supervisor path may start, stop, or await a gateway process at once.
- A timeout must terminate the complete gateway process tree before retrying.
- Defaults must accommodate populated small-node cold starts while Dashboard
  health remains under 40 seconds.
- Add a shell/container test with a gateway that becomes ready after more than
  30 seconds and prove it is not killed or duplicated.
- Prove an unexpected post-readiness exit is still recovered.

### 2. Repair exact-ID recreated-agent SQLite initialization

Reproduce the registry failure before changing the smoke fixture:

```text
create -> chat -> remove-state -> same-ID recreate -> new-generation chat
```

Investigate together:

- whether the gateway retains the deleted agent/session database handle;
- whether recreated agents need an explicit gateway reload or database
  initialization;
- whether Dashboard session IDs must include the agent lifecycle generation;
- whether remove-state clears every OpenClaw session-key/database reference.

The fix must leave the smoke sequence intact. The recreated chat must return
the mock model response, write valid new session state, and survive restart.
Do not mask the failure by removing the second chat or accepting an empty
database.

### 3. Make cloud identity mandatory and stable

Cloud packaging must always provide `CLAWMAX_INSTANCE_KEY` from the immutable
cloud instance key. Falling back to the Kubernetes pod hostname breaks CLI
trust on every rollout. Add deployment and discovery contract coverage proving
that two pod generations return the same instance ID.

### 4. Handle Civo volume growth as offline expansion

The `civo-volume` StorageClass reports `allowVolumeExpansion=true`, but its CSI
driver rejected expansion while mounted:

```text
volume is not in an available state for OFFLINE expansion
```

The successful test10 procedure was:

1. Request the larger PVC size.
2. Scale the Dashboard deployment to zero and wait for the pod to release the
   volume.
3. Wait for `FileSystemResizePending` or the expanded capacity.
4. Restore the pod; the mount completes filesystem expansion.
5. Verify PVC capacity and `df` before continuing the rollout.

CLI/cloud orchestration should route ingress to maintenance during this
operation, preserve the PVC, bound each wait, and restore the prior deployment
on failure. New small cloud instances should start at no less than 4 GiB.

### 5. Complete the Operations instance CLI vertical slice

RC69 implements discovery, authentication, workspace creation/listing, and
basic agent/workflow inspection. It does not implement the new Operations
Template routes: a request to
`/api/cli/v1/workspaces/default/templates` returns versioned JSON 404.

Before asking the Maximilien.ai team to deploy Operations 0.1.0, implement and
test the authenticated, workspace-scoped public contract for:

- Template validate, import, list, show, versions, plan, and apply;
- application list and show with durable provenance;
- Agent, Skill, Group, and Workflow inspection;
- Group lifecycle;
- manual Workflow execution and run-status inspection.

Keep named credentials as references only. Never put credential values into
Templates, application records, API responses, logs, or UI state. Applied
Groups must start stopped and scheduled Workflows disabled.

## RC70 acceptance order

1. Focused gateway, lifecycle, SQLite, identity, and CLI API tests.
2. Full integration, validation, and coverage suite; branch coverage must be
   at least 71.86%.
3. Public AMD64 and ARM64 image build plus populated registry smoke.
4. Matching combined private image and smoke validation.
5. Test10 rollout with stable instance key and 4 GiB PVC.
6. Health, authenticated gateway, credentialed streamed chat, restart, and
   exact CLI `041754d` status checks.
7. Operations 0.1.0 remote validate/import/plan/apply acceptance only after its
   complete public API contract is present.

