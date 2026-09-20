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
