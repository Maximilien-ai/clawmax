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

1. Public Workflow run/list/detail/result/cancel adapters are still missing.
   Reuse runtime execution, preserve actor/workspace/run correlation and
   idempotency, and do not report cancellation settled while execution is
   still active. Existing runtime cancellation persists its terminal status
   before process shutdown settles; wrapping that status alone is insufficient.
2. General chat-session list/show/message/cancel APIs are not implemented by
   this submission-route fix.
3. Complete source lifecycle/model tests before building the next candidate.
   Then coordinate shared fixture use with CLI, validate MBP14 first, and
   proceed to test10 only after its gate passes. Keep recurring schedules off.
4. Portable Template production plan/apply/authority admission remains gated;
   this route does not enable remote Operations deployment.

CLI does not need a new package to issue the fixed chat request. Keep ownership
of packaging and the existing acceptance runner with CLI. Dashboard retains
the remaining API and runtime work; the full runner is not yet unblocked.
