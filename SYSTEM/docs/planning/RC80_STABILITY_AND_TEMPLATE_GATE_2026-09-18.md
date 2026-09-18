# RC80 stability and Template-first acceptance

## Release sequence agreed September 18

1. Source/development: two consecutive end-to-end passes in disposable,
   explicitly scoped workspaces. Prove actual model responses and correlated
   Group/Workflow communication, not just resource creation or green health.
2. After that gate and the normal full integration/validation/coverage gate,
   build matching public and combined RC80 candidates. Do not move RC79 tags.
3. Repeat the same acceptance against test10 with a configured hosted model
   and MBP14 with a configured local Qwen model. Pin exact model IDs and runtime
   image digests in evidence; do not silently choose provider fallbacks.
4. A half-day/day soak is a subsequent endurance check, not required before
   the initial two-run key-path proof. Short-run acceptance is not evidence of
   24-hour availability. Host sleep and provider outages must be distinguished
   from runtime failures.

PDF is complete source work with green CI, not the main release goal:
[PDF evidence](RC80_DOCUMENT_PDF_2026-09-17.md),
[passed CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35283693046).
No RC80 image has been built or deployed for this work.

## Repeatable run contract

Use the installed CLI, explicit instance profile, immutable workspace ID, and
a unique run ID. Never change the operator's selected workspace implicitly.

1. Preflight identity, version, capabilities, model availability, and exact
   cleanup support. Refuse mutation if provisioning or cleanup is unavailable.
2. Create a run-owned workspace and one credential-free reusable Template
   graph: producer and reviewer agents, one permanent Group, and one manual
   Workflow. A third verifier agent may be added when justified by a test.
3. Validate and import/create the Template once; plan without writes; apply
   atomically. Replay apply and prove it returns the same owned resource IDs.
   Groups must initially be stopped and Workflows disabled.
4. Start only the test Group. Send a synthetic nonce through agent chat and
   the Workflow. Verify the producer response, reviewer acknowledgement of
   the producer's content, correlated Group messages and participant IDs,
   terminal Workflow result, and persisted history after reconnect.
5. Repeat execution; inspect run/session IDs and persisted results. Bound
   concurrency and deadlines. Exercise cancellation without stopping unrelated
   Group traffic. Recurring schedules remain disabled.
6. Disable/stop run-owned resources, settle active runs, and remove exactly the
   applied revision's resources. Remove the exact imported Template separately;
   catalog deletion must never cascade. Remove the now-empty run workspace.
7. Compare unrelated resource identities before/after and retain a sanitized
   report of outcomes, timings, IDs, model identity, and cleanup. No raw
   transcripts, credential values, or host broker paths in durable evidence.

Crash/restart/provider-loss injection requires an isolated runtime, not merely
another workspace on a shared gateway. Do not invoke the existing integration
wrapper's gateway restart against the operator runtime for this purpose.

## Executed engineering evidence

- Installed CLI: `2.0.0-test-rc4`.
- Read-only capability commands against `mbp14` and `test10`, workspace
  `default`, both exited 1 with `404 route_not_found` on September 18.
  No canary resources were created, run, or deleted.
- Existing source Dashboard health responded on localhost:3001. Gateway was
  not required by its health configuration; this is not real chat acceptance.
- New `server/lib/stability-foundations.test.ts` passed twice. Each pass uses
  an exact temporary registry and two disposable workspaces, checks 100
  concurrent/nested request scopes, exception restoration, registry persistence
  across manager reconstruction, and unchanged default selection. It then
  checks 30 simulated up/down/error/recovery cycles with 2,400 health requests,
  coalesced probes, correct 200/503 results, and sanitized errors. Its temporary
  workspaces and registry are removed in `finally`; no user data is removed.
- Existing startup-readiness tests passed; server TypeScript and lint passed.
- Tests are wired into `SYSTEM/test.sh`. These are deterministic foundation
  tests, not LLM calls, process-restart tests, or live Workflow/Group acceptance.

## Dashboard / CLI contract handoff — required before packaging

The installed CLI's documented lifecycle currently cannot execute the full
run contract. Do not release a new CLI merely to conceal missing server APIs.

### Existing agreed catalog slice (Dashboard owns implementation)

Implemented in source and verified with the real CLI Go client; see the
[catalog checkpoint and remaining Dashboard ownership](RC80_DASHBOARD_CLI_TEMPLATE_HANDOFF_2026-09-18.md).
The workspace-authorized routes and strict envelopes follow
`clawmax-cli/docs/specs/INSTANCE_CLI_API.md` and the typed decoders in
`src/pkg/instanceclient/{capabilities,templates}.go`:

- workspace capabilities;
- Template validation, import (catalog creation), list, show, versions, and
  exact non-cascading removal;
- independent ZIP/manifest/checksum validation and credential-free enforcement;
- immutable key/version/digest identity, no-write validation, idempotent imports,
  conflict handling, authentication/workspace denial, and JSON-only errors.

Template authoring must produce a valid portable bundle; catalog import creates
the retained server Template. Do not equate this with one-agent-at-a-time setup,
or confuse Dashboard Markdown templates with portable graph bundles.

### Production lifecycle gate (not yet accepted or exposed)

The file transaction and revision core now have focused crash, idempotency,
and cleanup tests. These use a synthetic compiler and do not establish native
runtime atomicity or execution authority. Keep plan/apply unadvertised.

Before activating plan/apply, Dashboard and CLI must agree versioned fixtures
for a non-mutating plan, atomic apply, revision inspection, and exact cleanup:

- plans bind actor/workspace, expected workspace revision, immutable Template
  and runtime/Skill digests, server-owned policy/broker identities, model
  selection, and named credential references only;
- applies require the plan digest and idempotency key; reject stale inputs,
  cross-workspace use, substituted bindings, and concurrent conflicts before
  mutation; replay after response loss returns the committed revision;
- revisions contain complete artifact-to-Agent/Community/Group/Workflow maps;
  failed/crashed applies cannot leave an apparently successful partial graph;
- cleanup plans name revision-owned IDs, detect externally modified/shared
  resources, and fail safely rather than broad-delete; preserve revision
  evidence after cleanup;
- credential/Skill authority never propagates through Group messages; named
  secrets are resolved at execution and never returned in evidence;
- workspace deletion must be exposed safely in the CLI, with immutable IDs
  and empty/run-owned checks; current `instance workspaces` lacks removal;
- real chat, Group messages and Workflow run/result/wait/cancel endpoints must
  be implemented before claiming end-to-end acceptance; current server router
  primarily exposes discovery/auth, workspace creation/listing and agent/
  workflow listing;
- CLI capability runtime validation currently accepts only Linux. Native macOS
  development must either use a real contained Linux runtime or gain an agreed
  host/runtime distinction; never advertise a fictitious Linux runtime.

CLI owns typed clients, commands, help/JSON compatibility tests, and packaging
after the server fixtures pass. Dashboard owns authorization, persistence,
atomicity/recovery, runtime enforcement, and server contract tests. Keep partner
Operations execution explicitly unavailable until those authority gates pass.
