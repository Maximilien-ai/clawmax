# Dashboard → CLI RC6: public chat fix

## Boundary

Source checkpoint `0f5c0686ce857f75cd31cc3b2e15c074be25449e` fixes the missing
workspace-scoped agent chat submission route. It is **not** full lifecycle
acceptance, a new image, or approval to distribute RC81.

- Installed `/usr/local/bin/clawmax --version`: `2.0.0-test-rc6`.
- MBP14 remains on Dashboard RC79, per the CLI handoff; no installed agent,
  VM, image, profile, shared fixture, or schedule was changed in this checkpoint.
- Existing RC80.1 images predate this fix. Do not install them expecting it.
- [Implementation CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35525352558)
  was running when this handoff was written. Recent full CI duration is about
  27 minutes; focused local passes do not establish full-suite success.

## Implemented

`POST /api/cli/v1/workspaces/:workspaceId/agents/:agentId/chat/sessions`
accepts the RC6 `AgentChatRequest` and emits correlated, sequential
`application/x-ndjson` `ChatEvent` records: `start`, nonempty `delta`, then
exactly one `done` or `error` terminal event.

The route calls the shared Dashboard chat execution owner directly, not a
browser HTTP endpoint. Existing model readiness, budget, runtime, credential
broker, turn registry, transcript persistence, and execution queue remain in
use. Client-supplied BYOK/runtime overrides are rejected. Workspace access is
checked on admission and again when queued execution starts. Agent generation
is pinned; reserved portable Template resources remain execution-blocked.

Public session IDs are actor/workspace/agent-generation scoped. Optional
`sessionId` continues only a session owned by that actor and agent generation.
Idempotency claims are persisted before dispatch; completed streams replay
without another execution. An unfinished claim, including after a crash,
returns `409 chat_outcome_pending`; do not retry it with a new key without
inspecting its outcome. Changed requests using the same key return 409.

Private local receipts under the workspace's `.clawmax/cli-chat` retain replay
events and request hashes, not another copy of the raw prompt. A disconnect
does not cancel the runtime; its eventual terminal stream remains replayable.
Replies are bounded to 2 MiB. Runtime errors are not echoed verbatim through
the public transport, preventing credential-bearing diagnostics from leaking.

## Passed locally

- Server TypeScript and focused ESLint.
- 11 isolated public chat checks, including CLI Go-client interoperability.
- 18 existing/public-mount CLI authentication and workspace checks.
- 4 browser route contracts and 20 gateway/runtime/queue edge checks.
- 39 chat helper checks, 6 helper edge checks, 19 process-safety assertions,
  and 14 browser stream-safety assertions.

Reproduce the isolated cross-repository check without modifying CLI files:

```sh
cd SYSTEM/dashboard
npx ts-node server/routes/instance-chat.test.ts /absolute/path/to/clawmax-cli
```

The CLI checkout observed during validation was
`47ee314fc22e0255480b6c8a6e333e009abc3d5d`; its agent client last changed in
`3e5b77dc3b743ee004c45ca445fc97d4312e5d66`.
The test uses that real strict Go client against an isolated HTTP server with
a synthetic runtime. **No real-model response or MBP14 acceptance is claimed.**

## Remaining Dashboard-owned gates

1. Public Workflow adapters are now implemented in the follow-up checkpoint
   below. Real-model execution, cancellation, Group delivery, and restart
   acceptance are still required; synthetic contracts are not those gates.
2. General chat-session list/show/message/cancel APIs are not implemented by
   this submission-route fix.
3. Complete source lifecycle/model tests before building the next candidate.
   Then coordinate shared fixture use with CLI, validate MBP14 first, and
   proceed to test10 only after its gate passes. Keep recurring schedules off.
4. Portable Template production plan/apply/authority admission remains gated;
   this route does not enable remote Operations deployment.

CLI does not need a new package to issue the fixed chat request. Keep ownership
of packaging and the existing acceptance runner with CLI. Dashboard retains
the remaining runtime and Template work; installed-image acceptance is not
yet unblocked.

## Follow-up: public Workflow lifecycle

- `af463cb9`: single-workflow execution scope, queued cancellation/admission
  checks, and observation of actual runner settlement.
- `b8a1c30e51569a980c5bcf71e9eec42d48a296a7`: authenticated public Workflow
  adapters, durable actor-owned run receipts, empty-participant admission,
  and strict CLI interoperability.
- [Workflow implementation CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35527318587)
  was queued at this checkpoint. No image build or instance installation ran.

Under `/api/cli/v1/workspaces/:workspaceId`, the implemented routes are:

| Method | Route | Response kind |
| --- | --- | --- |
| GET | `workflows/:workflowId` | `Workflow` |
| POST | `workflows/:workflowId/runs` | `WorkflowRun` |
| GET | `workflows/:workflowId/runs` | `WorkflowRunList` |
| GET | `workflow-runs/:runId` | `WorkflowRun` |
| GET | `workflow-runs/:runId/result` | `WorkflowResult` |
| POST | `workflow-runs/:runId/cancel` | `WorkflowRun` |

Run/list/result/cancel expose only runs started by the same authenticated actor
in the same workspace. Start accepts RC6 `WorkflowRunRequest`; `input` currently
supports string-valued objects, including `{}`, matching the existing runtime
input model. Nested/numeric values and credential/runtime overrides are rejected.
Requests never enable schedules, reset dependent workflows, or auto-start DAG
dependents. Group delivery within the selected Workflow remains runtime-owned.

Idempotency claims precede dispatch. Completed start requests return the same
run. Unfinished durable claims return `workflow_outcome_pending` without
redispatch; failed starts also require inspection rather than silent retry.
Storage assumes one Dashboard writer per workspace volume.

Runtime `completed` maps to public `succeeded` only after the runner settles
and at least one participant has a nonempty response. Orphaned running records
and empty completed replies fail closed. Public results omit internal logs and
artifact paths, and are bounded to 3 MiB; run inputs are not copied into receipts.

Cancellation waits up to five seconds for settlement. If still active, it
returns **409 `cancellation_pending`, `retryable: true`**, never a false terminal
success. Poll run detail until terminal, or retry cancellation with the same
idempotency key. Already-completed runs return `run_already_terminal` without
rewriting their outcome. Cancelled replays remain `cancelled`.

**CLI follow-up:** its acceptance runner currently treats every cancellation
error as failure. Handle `cancellation_pending` by polling that same run to
terminal cancellation; never start another run to compensate. Dashboard has
not edited the CLI-owned uncommitted runner. The ordinary settled-cancellation
path already passes the current strict Go client.

Passed locally: server TypeScript, focused ESLint, 11 public Workflow contracts
(including real Go client validation), 19 CLI auth/mount/workspace contracts,
six runtime admission checks, and all 76 existing Workflow tests in an isolated
test workspace. Existing cron fallback tests emitted unavailable-gateway
diagnostics and passed; this is not evidence of live gateway acceptance.

```sh
cd SYSTEM/dashboard
npx ts-node server/routes/instance-workflows.test.ts /absolute/path/to/clawmax-cli
```

Next release gates remain two consecutive **real** local template create/apply,
chat, Group, workflow/result/cancel, and exact-cleanup cycles; full CI/coverage;
then immutable RC81 public/combined builds and the same checks on MBP14, test10,
and the Mac Mini upgrade. Portable production Template admission is still
disabled and must be completed, not bypassed to make these tests pass.

## Follow-up: internal Template staging verification

Checkpoints `7163ab26`, `da7d5f35`, `92148ec4`, and `7559393b` add fresh
authority revalidation, committed execution-file integrity, exact gateway
receipt/roster verification, and their composition in
`TemplateApplyCoordinator.verifyStagedExecution`.

The coordinator checks actor-owned, uncleaned revision resources and current
server authority before gateway inspection, then repeats revision and authority
checks after the RPC. Gateway expectations come from checked agent graph files,
committed bindings, and the server-owned runtime directory. It rejects authority
revocation, resource changes, or cleanup during that call. Shared Group listings
and mutable Workflow Markdown are not execution evidence; the checked graph
sidecars must drive any future graph executor. No verification operation patches
gateway state or performs automatic recovery.

Passed locally: coordinator, gateway transaction, authority revalidation and
resource-file suites, server TypeScript, and focused ESLint. Tests use isolated
synthetic gateways; they do not establish live-model or installed-image acceptance.
[Composition CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35529034265)
was pending when recorded.

**Not an execution grant:** the verifier is internal and is not wired into queue
admission. Production lifecycle routes remain gated, and reserved Template IDs
remain blocked. Dashboard still owns actual policy enforcement, verified Skill
installation, named-credential isolation, graph execution, and revalidation at
the execution queue boundary. CLI packaging cannot resolve these runtime gates.
No new release image or MBP14/test10 deployment was performed for these changes.

### No-tools policy binding

`2544fc41` requires a server-owned policy source when verifying staged execution.
The only accepted document is `noToolsTemplatePolicy(id)` from
`template-execution-policy.ts`; its fixed-order JSON SHA-256 must match the
committed binding. Policy lookup and comparison repeat after gateway inspection.
Unknown fields, broader tools, missing policies, digest mismatches, requested
Skills, and named credentials fail closed rather than silently losing authority.
This restricted profile does **not** implement Collector-only execution.

The coordinator regression suite covers these failures, policy removal during
the gateway call, and sanitized lookup failures. Server TypeScript and focused
ESLint passed. [Policy binding CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35529172606)
was pending when recorded. Runtime queue integration and production Template
execution are still disabled; these checks do not establish end-to-end policy
enforcement or release readiness.

## Internal no-tools execution owner

`469abfca` adds `GatewayRPCClient.runNoToolsTemplateAgent`. The fixed request uses
OpenClaw `agent` RPC with `modelRun: true`, `promptMode: "none"`, disabled message
delivery, and an explicit server-selected model/instruction set. It never runs
ordinary chat credential/config/Skill preparation. The protocol was checked
against the prepared v2026.8.2 source: `packages/gateway-protocol/src/schema/agent.ts`,
`src/gateway/agent-turn/agent-run-dispatch.ts`, and
`src/gateway/worker-environments/worker-tool-authority.ts`.

The adapter waits past the accepted acknowledgement for the final response with
the same run ID. It rejects negative envelopes, failed/empty/media-only replies,
and mismatched run identities. Gateway execution is bounded to 120 seconds;
the response wait is 150 seconds. Disconnect/timeout is an uncertain outcome,
not cancellation or permission to redispatch.

`ffcf2689` adds the internal `TemplateApplyCoordinator.executeNoToolsAgent`
owner. It verifies the revision, live authority, policy and gateway, holds the
workspace lock through settlement, and writes a private local idempotency claim
before dispatch. Completed replies replay without another call. Unknown outcomes
block another run and cleanup, including after reopening the workspace. Receipts
contain request hashes and replies, not a second raw-prompt copy; limits are
128 receipts and 3 MiB per revision, with replies bounded to 2 MiB.

Local checks passed: 11 gateway transport checks, seven gateway configuration
checks, coordinator/revision/resource-file suites, HTTP lifecycle contracts,
server TypeScript and focused ESLint.
[Transport CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35534537429)
was running and [execution-owner CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35534697180)
was pending when recorded.

**Still internal, not release-ready:** execution tests use a synthetic model
transport. Real isolated native/model acceptance, pending-run inspection and
reconciliation/cancellation, production route integration, Group/Workflow graph
execution, and CLI-driven end-to-end cycles remain outstanding. Browser and
public CLI Template execution remain blocked. No installed instance was changed.

## Real local Qwen acceptance — September 20 follow-up

Two consecutive fresh-state runs passed on the prepared OpenClaw **2026.8.2**
(`0965053fe6b9341776df147a6934b7485c60b5ca`, with the existing roster-removal
patch), using local **ollama/qwen2.5:latest**. Observed Ollama model digest:
`845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`.
Each run returned a nonempty 34-byte native reply, replayed the saved response
with redispatch explicitly forbidden, and completed exact cleanup while
preserving the unrelated baseline agent. The same runs passed staging replay,
committed journal recovery, two-Agent rollback, stale-revision rejection,
lost-response retry of gateway cleanup, non-mutating cleanup planning, catalog
removal before cleanup, and cleanup replay. This is not a process-crash test.

The live test found issues that synthetic transport tests had not exposed:

- Token-only WebSocket callers do not receive execution scope. `fe47a11e`
  requests `operator.write` and permits paired native CLI fallback **only** on
  an explicit scope rejection before acceptance. It preserves the idempotency
  key, waits for the final reply, and never retries unknown outcomes. The CLI
  receives a minimal environment without provider or workspace partner secrets.
- Execution uses the already-verified committed agent model, not a model
  override requiring broader native permissions.
- The harness must use its local config/state identity without an explicit URL
  override and must enable the Ollama provider plugin. All other plugins,
  schedules, heartbeats and browser access stay disabled.

Harness checkpoint: `a1f69109`. Reproduce with an explicitly prepared binary:

```sh
cd SYSTEM/dashboard
npx ts-node scripts/test-template-isolated-gateway.ts /absolute/prepared/openclaw --local-model ollama/qwen2.5:latest
```

Each invocation creates its own temporary gateway/state/workspace and removes
only those disposable resources afterward. MBP14's installed agent, its VM,
and test10 were not changed. The preparation failures were not counted as passes.
The native calls use the internal coordinator, **not** public CLI chat routes.

Twelve gateway transport checks, server TypeScript and focused ESLint also
passed. [Acceptance-harness CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35536757878)
was running when recorded; no image build was dispatched.

Remaining gates: production lifecycle/chat integration; pending-run inspection,
reconciliation and cancellation; real Group/Workflow graph execution; then two
complete public CLI-driven cycles. This narrow native/local-model acceptance
does not establish cloud acceptance, Operations deployment readiness, or RC81
release approval.

## Public chat bridge checkpoint — 2026-09-20

`79c0b2a7` connects an explicitly server-composed Template executor to the
public CLI chat route. It selects exactly one active, actor-owned revision,
checks workspace bindings and staged authority before replay, and dispatches
through the no-tools coordinator rather than browser chat. The coordinator
rechecks workspace authorization after gateway awaits and before dispatch.
Template session continuation is explicitly rejected; ordinary chat is unchanged.
Without server composition, reserved Template execution remains blocked.

Validation: server TypeScript, focused ESLint, the coordinator suite, and all
13 HTTP chat contract tests passed. `fb44643c` extends the opt-in native harness:
one isolated cycle passed both internal execution and the public CLI HTTP route
using OpenClaw 2026.8.2 with `ollama/qwen2.5:latest`. The HTTP response contained
a nonempty 34-byte reply, correlated start/delta/done events, and byte-identical
durable replay with exactly one model dispatch. Recovery, rollback, exact cleanup,
cleanup replay and unrelated roster preservation passed; the harness exited 0.

This HTTP check uses synthetic isolated authentication, not installed RC6's
production identity flow. Production router composition is still disabled.
No Group/Workflow execution capability was enabled, no image was built, and
MBP14/test10 were not modified. Remaining release gates above still apply.

## Authenticated native checkpoint — 2026-09-21

The server router now accepts one trusted Template service resolver for lifecycle
and chat (`2506ba45`, fixture correction `1b2f2457`). All 20 authenticated router
tests passed, including rejecting unauthenticated and unknown-workspace requests
before service resolution. Default production composition remains disabled.

`ff9f33d1` adds an isolated WorkspaceManager to native acceptance, preserving
the installed registry. One real Qwen cycle passed through the production CLI
router using a signed session: invalid tokens, wrong workspace and unrelated
actor were rejected without model dispatch; a nonempty 34-byte reply and durable
replay passed. A subsequent cycle additionally obtained its execution token from
the real one-time authorization-code/PKCE exchange, with authentication bypass
disabled. It returned a nonempty 40-byte reply; code reuse was rejected.

Both cycles exited 0 after recovery, rollback, exact cleanup, cleanup replay and
unrelated roster preservation checks. Server TypeScript and focused lint passed.
Only the initial browser identity is seeded in the PKCE harness; there was no
interactive browser login or installed RC6 binary invocation. Signing material,
CLI state, workspace registry and gateway resources are disposable and isolated.

Remaining gates: operator-configured production composition, installed CLI
end-to-end acceptance, pending-run reconciliation/cancellation, real Group and
Workflow graph execution, and full repeated lifecycle cycles before image builds.
No images, instance rollouts or recurring schedules were started.

## CLI client interoperability — 2026-09-21

The native harness now optionally runs the actual `instanceclient` Go package
from an explicit CLI checkout. Acceptance passed against CLI checkout
`47ee314fc22e0255480b6c8a6e333e009abc3d5d`: the PKCE-issued access token was
provided on stdin, a nonempty Qwen reply completed through the public route,
and byte-equivalent event replay caused no second model dispatch. The complete
native harness exited 0 after its recovery and exact-cleanup checks. Server
TypeScript and focused lint passed. The CLI checkout was read, not edited.

```sh
cd SYSTEM/dashboard
CLAWMAX_ACCEPTANCE_CLI_CHECKOUT=/absolute/clawmax-cli \
  npx ts-node scripts/test-template-isolated-gateway.ts /absolute/prepared/openclaw --local-model ollama/qwen2.5:latest
```

Installed `/usr/local/bin/clawmax` reports `2.0.0-test-rc6`, but its `instance`
commands currently use the user profile and OS Keychain. This client-package
check is **not** an installed-binary or interactive-login pass. No installed
profile, credential, agent, VM, or cloud instance was changed.

CLI handoff request: provide a supported opt-in isolated profile root and
isolated test credential mechanism for installed-binary acceptance. Preserve
normal Keychain defaults; do not put tokens in process arguments or logs.
Dashboard still owns production composition, public Group execution/history,
revision-owned graph execution, terminal cancellation/reconciliation, and
full lifecycle acceptance. Do not advertise those gates as satisfied.

## Group discovery and interruption recovery — 2026-09-21

`e4f147f4` adds authenticated workspace-scoped Group list/detail routes. Names
that are not valid resource IDs receive deterministic hashed IDs. Duplicate
identities, symlinked catalogs and unauthorized workspaces fail closed. The
routes are read-only, and all Groups report execution status `unavailable`.
Public chat/history return explicit `group_execution_unavailable` and
`group_history_unavailable` errors: legacy messages are not relabeled with
invented actor/session identities. All 21 router tests, TypeScript and focused
lint passed. [Implementation CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35623536569)
and CodeQL passed.

After an interruption removed the old temporary runtime, acceptance stopped
before gateway startup. The repository preparation script rebuilt pinned
OpenClaw 2026.8.2 (`0965053`) with the maintained patches in a fresh cache:
`/private/tmp/clawmax-rc81-runtime.kFsPtH/v2026.8.2/bin/openclaw`.
The resumed native harness exited 0. The actual CLI Go client validated Group
list/detail and exact gated error codes, then completed Qwen chat and durable
replay without duplicate model dispatch. Recovery, rollback, exact cleanup
and unrelated roster preservation also passed. Disposable test resources were
cleaned; the rebuilt runtime cache remains available for the next run.

Group communication, correlated Group history, Workflow graph execution and
terminal cancellation remain unproven and gated. This is discovery acceptance,
not Operations deployment readiness. No installed profiles, credentials, VMs,
MBP14/test10 instances, schedules or release images were changed.

## Internal native Group communication — 2026-09-21

`c27fc5ff` adds an explicit bounded, no-tools Group execution owner under the
coordinator workspace lock. It verifies revision ownership and server authority
at each handoff, follows only configured `sendTo` edges, and honors turn/message
limits. Results record member/agent identity, preceding sender, native run IDs,
reply text and an explicit stop reason. Limit termination does not claim the
Group's objective succeeded. The Group stays stopped; schedules remain disabled.

One real native Qwen cycle passed four turns across two agents:
producer → reviewer → producer → reviewer. Each recipient received the exact
preceding response. The recorded stop reason was `turn_limit`, and durable
replay made no new model calls. The full harness exited 0 after recovery,
rollback, exact cleanup and unrelated-resource preservation checks.

Coordinator tests passed for handoffs, identity, oversized/empty input,
idempotency conflicts, replay, and revocation after the first response. Uncertain
or partial runs retain a pending claim and block redispatch and cleanup.
TypeScript and focused lint passed. This does not yet provide cancellation,
pending-run reconciliation, retention enforcement, public Group chat/history,
or Workflow graph execution. Those remain release gates; no deployment changed.
