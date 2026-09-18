# RC80 Dashboard → CLI: Template catalog checkpoint

## Release boundary

This is a **source catalog interoperability checkpoint, not deployment
acceptance or the final Operations handoff**. No RC80 image was built or
deployed. MBP14 and test10 remain on RC79. Do not enable recurring schedules,
remote Template apply, or advertise Operations readiness from this checkpoint.

Dashboard owns the unfinished production resource compiler, atomic gateway
registration/recovery, server-owned authority enforcement, public revision and
cleanup APIs, canonical UI visibility, and real execution acceptance. These are
not tasks being transferred to CLI.

## Implemented public catalog

All routes below are beneath `/api/cli/v1/workspaces/:workspaceId` and use the
existing CLI authentication and workspace authorization boundary.

| Method / route | Response kind |
| --- | --- |
| `GET capabilities` | `Capabilities` |
| `POST template-validations` | `TemplateValidation` |
| `POST templates` | `TemplateImportResult` |
| `GET templates` | `TemplateList` |
| `GET templates/:templateId` | `Template` |
| `GET template-keys/:key/versions` | `TemplateVersionList` |
| `DELETE templates/:templateId` | `TemplateRemoval` |

Envelopes follow the existing CLI `INSTANCE_CLI_API.md` catalog contract.
Capabilities advertise only `import`, `list`, `remove`, `show`, `validate`, and
`versions` for `portable-zip`. Other new lifecycle capabilities remain absent.

- Upload media type: `application/vnd.clawmax.portable-template+zip`.
- Identity headers: `X-ClawMax-Template-Key`, `X-ClawMax-Template-Version`,
  `X-ClawMax-Template-SHA256`; import also requires `Idempotency-Key`.
- Format: outer `clawmax.portable-template/v1alpha1`; nested Agent, Group, and
  Workflow definitions are **v1alpha2**. Older nested schemas are rejected.
- Validation does not persist files. Import independently validates the ZIP,
  file inventories, CRC/checksums, canonical graph digests, references, and DAGs.
- Bounds: 64 MiB archive, 256 MiB aggregate expansion, two concurrent uploads.
  Unsafe paths, links, executable agent files, encrypted/ZIP64 archives,
  undeclared files, and unknown schema fields are rejected.
- Portable validation rejects private-state filenames and unknown credential
  fields; it is **not a guarantee that arbitrary authored prose contains no
  secrets**. Authors remain responsible for the contents they upload.
- Catalog identity is immutable key/version/digest. A matching replay returns
  the same ID with HTTP 200; creation returns 201; conflicting identity/key
  reuse returns a structured 409. Removed identities are tombstoned.
- Version lists are descending semantic versions, not lexical versions.
- Removal is non-cascading. `removed: true` describes resulting absence and is
  also returned on successful retries. Invalid IDs still fail validation.
- Errors are JSON, never SPA HTML; authorization failures precede ZIP parsing.
- Storage assumes one Dashboard writer per workspace volume. Shared multiwriter
  deployments are not supported by the file transaction mechanism.

Catalog import creates the retained reusable Template, not its Agents or
Workflows. It does not yet integrate portable entries into the existing
Dashboard Markdown Template browser.

## Tested evidence

Dashboard checkpoints:

- `dc1383c1`: bounded ZIP admission.
- `f7bd6836`: portable manifests and graph validation.
- `d5ea7e97`: authenticated workspace-scoped catalog routes.
- `0b2b8423`: fixed cross-workspace communication-history cache collision.
- `d18bc84c`: durable resource-file transaction and process-crash recovery tests.
- `e99e308b`: revision/idempotency/exact-file-cleanup core tests.
- `7c2e74ca`: blank metadata and calendar-date rejection.
- `4923d3e5`: redirected/symlink storage rejection.
- `6ca8dbe1`: CLI-compatible deletion retry result.
- `cca186ba`: real CLI client interoperability runner.

The revision tests use an injected synthetic compiler. They do **not** prove
atomic native gateway registration, real Group routing, Workflow execution, or
Collector-only authority. Revision/plan/apply routes are not exposed yet.

Focused ZIP, manifest, catalog HTTP, authentication, workspace history isolation,
file transaction/crash, and revision suites passed during implementation.
Server TypeScript and ESLint passed. The focused suites are included in
`SYSTEM/test.sh`; final full-suite CI remains a separate gate.

Initial catalog acceptance passed against CLI checkout `4e3f140a`.
The updated capability and catalog contract passed against CLI checkout
`ad5a32f9d8684e5bd3d91224f36144fd9e2440c7`, including capability fix `7a7839b`:

```sh
cd SYSTEM/dashboard
npx ts-node --transpileOnly scripts/test-template-cli-contract.ts /absolute/path/to/clawmax-cli
```

This creates a disposable loopback server and synthetic two-version bundle
fixture (two Agents, one Group, one Workflow). It uses CLI's real Go ZIP
validator and HTTP clients for validate/import/replay/list/show/versions/remove,
including repeated removal. It deletes its test directory on exit, does not
edit the CLI checkout, and never uses installed profiles or either canary.
Go 1.26 is required by the tested CLI checkout.

The runner now requires successful capability discovery matching the actual
host OS and architecture; the observed result was `darwin/arm64`. It also
asserts the exact catalog operation set and absence of unsupported workspace
package, Skill/platform, Community, Group, and Workflow capabilities. Native
catalog support does not imply Linux Skill execution or remote plan/apply.
This verifies the source Go client, not publication or installation of RC5.

## CLI-owned follow-up

1. Run the interoperability command against the current CLI source; retain the
   strict schemas and capability gating.
2. Resolved: CLI `7a7839b` accepts native macOS catalog capability identity.
   Preserve the separation between actual host identity and supported Linux
   Skill execution platforms; the Dashboard contract test now enforces it.
3. Keep remote plan/apply unavailable until Dashboard publishes and passes the
   production binding/revision/runtime contract. Never forward local policy
   paths or broker executable paths to Dashboard.
4. Once that server contract lands, implement typed clients/commands and exact
   workspace cleanup. Packaging/signing belongs to CLI; this checkpoint does
   not authorize a release claiming full deployment support.

## Remaining Dashboard acceptance

The existing runtime does not natively represent portable Group routing or
Workflow step edges. Import must not flatten those graphs into ordinary
participant lists. The remaining implementation must preserve those semantics,
enforce stopped Groups/disabled schedules and per-Agent authority, and join
gateway changes to resource commit/recovery before apply is enabled.

The first production compiler stage is now implemented in
`server/lib/template-resource-graph.ts`: pure, deterministic resource-ID mapping
with preserved Group entry/routing edges, Workflow success/failure branches,
handoffs, managed ownership, schedules, limits, and inter-workflow dependencies.
Ambiguous digest references are rejected. Compiled Agents remain
`pending-authority`, Groups `stopped`, and Workflows disabled. Focused tests,
server TypeScript, and ESLint passed. This pure stage does not itself persist
resources or register gateway agents. The complex graph
tests exercise lowering directly, not additional ZIP admission or real execution.

Checkpoint `de8ea24b` adds an internal canonical file adapter, exercised through
the revision store in a disposable workspace. Native readers recognize Agent
identity/instruction files, Group membership, and disabled/blocked Workflow
Markdown; adjacent JSON retains the complete graph. Agent model selections
remain requests, not runtime bindings. Skills, credential requirements, and
nonempty bindings are rejected until authority admission exists. Reserved
compiled resource IDs are blocked at Agent turn and Workflow trigger boundaries,
including manual triggers; removing metadata does not bypass that guard.

Tests cover no-write planning, interrupted-write rollback, idempotent apply,
reopened revision state, native discovery, blocked execution without run-state
creation, exact cleanup/reapply, and preservation of unrelated Groups. Cleanup
currently fails safely if the shared Group registry changed after apply; it does
not yet merge removal around later edits. Empty resource directories can remain
after rollback/cleanup, but native Agent discovery excludes them. Legacy Agent
execution, Workflow, and communication-target suites also passed, along with
server TypeScript and ESLint.

Checkpoint `5ad09f10` adds server-owned **planning** bindings. The file compiler
can receive an administrator-configured authority source; its bounded strict
registry schema is `clawmax.template-authority/v1alpha1`. There is no public
registry write route or client-selected registry path. Each Agent selection is
bound to its artifact ID/digest, workspace, actor allowlist, binding revision,
model identity/revision, policy digest, runtime identity, exact requested Skills,
and named credential references. Unknown fields, missing/substituted bindings,
disabled bindings, platform mismatch, undeclared credentials, and unbound required
credentials fail closed. Embedded Skill files remain unsupported.

The revision store supplies actor/workspace context and re-resolves bindings
before apply. Plans and revisions retain the projected identities/digests, not
actor ACLs, host paths, or credential values. A changed registry, model, policy,
binding, or credential revision changes the authority digest; stale plans cannot
commit. Tests passed for file-backed resolution, revoked/stale apply, per-Agent
credential-reference isolation, cleanup, persistence, and unchanged execution
blocking. TypeScript and ESLint passed as well.

These records describe intended authority; they do not verify installed Skill
bytes, enforce governed commands, resolve broker secrets, or provision gateway
permissions. Collector-only execution is therefore still **unproven**. The
runtime adapter must verify and enforce these bindings again at execution time,
including revocation and runtime changes. All compiled resources remain blocked.

Checkpoint `d7776eaf` adds the internal gateway transaction half. Inspection of
the cached target OpenClaw `v2026.8.2` configuration handler confirmed keyed
merge patches and revision-hash checks. The Dashboard transport now sends all
Template Agent entries in one `config.patch` with `baseHash`; legacy list rosters
are rejected rather than rewritten. Registrations require no Skills, deny all
tools, and disable heartbeats while the execution admission guard remains shut.

A durable intent journal survives failed calls, lost responses, and process
loss. Recovery takes a trusted durable-revision lookup: committed resource
revisions require exact registrations; uncommitted revisions remove only exact
owned entries with another guarded patch. Missing committed entries, outside
edits, corrupt journals, or unverifiable results fail closed. Unrelated gateway
configuration is neither journaled nor restored from a whole-config snapshot.

The new tests use a disk-backed **simulated gateway**, including a child process
exit immediately after its simulated commit, response-loss/retry cases,
multi-Agent batching, stale hashes, concurrent calls, and preservation of
unrelated/edited registrations. They do not run a real OpenClaw gateway or prove
native SQLite/runtime teardown. Existing gateway-client tests (19), config-edge
tests (7), server TypeScript, and lint also passed. The gateway journal is not
yet wired into Template apply or startup recovery; the resource/runtime
coordinator and isolated real-gateway acceptance remain required.

Checkpoint `2c797deb` connects the gateway and resource journals through an
internal apply coordinator. The resource revision ledger is the durable commit
decision; resource-file recovery runs before gateway reconciliation. Tests exit
a child process after gateway registration and after resource commit: the former
rolls registrations back, while the latter retains the committed revision and
supports an idempotent retry. Bindings are re-resolved after gateway awaits, so
revocation prevents resource commit and triggers scoped rollback. Workspace
mismatches are rejected. This remains staging behind the execution guard, not
the public apply API or automatic startup recovery.

The complete [Dashboard CI run for `2c797deb`](https://github.com/Maximilien-ai/clawmax/actions/runs/35362356678)
passed on September 18, including lint, build, the full test step and coverage.
The run took approximately 27 minutes; its test summary reported all tests
passed. Earlier superseded runs were cancelled by newer pushes, not accepted as
successful evidence.

Checkpoint `74677328` adds the opt-in real-gateway harness:

```sh
cd SYSTEM/dashboard
npx ts-node --transpileOnly scripts/test-template-isolated-gateway.ts /absolute/prepared/openclaw
```

It passed against the cached target OpenClaw `v2026.8.2`: isolated gateway
startup, coordinated two-Agent Template staging, exact retry without another
revision, and preservation of the unrelated baseline Agent. The harness uses
temporary config/state, a random loopback port, no inherited provider keys,
disabled plugins/channels/cron/tools/heartbeats, and no model calls. It verifies
the RPC config port matches its own gateway and terminates only its own process
group, then removes its disposable data. Server TypeScript and lint passed.
The first attempt reached gateway readiness but failed the explicit-URL config
RPC check; the passing harness uses the pinned local-config CLI identity.

The real harness proves staging/registration, not actual Agent execution,
native process-crash recovery, or SQLite teardown. Those remain distinct from
the simulated transport crash tests. MBP14 and test10 were not changed.

This is not production deployment acceptance: workspace-isolated recovery,
execution-time authority enforcement, full graph execution, safe merge-aware cleanup,
public revision APIs, and UI presentation remain outstanding. No apply endpoint
or execution capability was enabled, and neither canary was changed.

### Startup recovery checkpoint (September 18)

- `1d1393d7` prevents legacy startup auto-registration from recreating reserved
  Template Agent IDs outside the restrictive coordinator. The identity guard
  runs before workspace inspection or runtime writes, even without metadata.
  Focused tests cover repeated startup, existing/unrelated Agents, failures,
  unmanaged folders, files, and symbolic links.
- `e57d69b5` recovers registered workspace file journals before gateway journals,
  before persistent-store readiness, HTTP serving, and background services.
  Recovery uses the revision ledger, never a compiler or new authority grant.
  Test-workspace overrides remain isolated; absent journals need no gateway
  configuration or RPC. Gateway construction is lazy.
- Child-process crash tests cover partial resource writes and both sides of
  the gateway/resource commit boundary. Startup recovery preserves committed
  registrations and unrelated entries, rolls back uncommitted resources, and
  retains journals when the gateway is unavailable or evidence is corrupt.
  Coordinator, file-transaction, gateway-transaction, registration, and startup
  readiness suites passed, as did server TypeScript and lint.
- At this checkpoint uncertain recovery rejected the entire Dashboard startup.
  The isolation follow-up below narrows that restriction; neither checkpoint
  completes the RC80 stability gate.

CLI: no packaging, install, capability expansion, or canary action is requested
at this checkpoint. Execution admission and public plan/apply remain disabled.
Live native-gateway crash recovery and real Agent/Group/Workflow execution are
still required; the new crash evidence uses a simulated gateway transport.

### Inactive workspace quarantine checkpoint

`6186eb38` continues startup recovery across workspace failures. A healthy
active workspace can start while unresolved inactive workspaces remain blocked.
Journal presence and in-process recovery state gate workspace access; recovery
errors cannot be swallowed into the legacy fallback workspace. Switching,
explicit lookup, contextual execution, deletion, and overwrite of affected
workspaces are rejected. Workspace listing avoids scanning their partial
resources and returns `recoveryState: "blocked"` through the existing Dashboard
workspace list (the strict CLI workspace schema is unchanged). Dashboard token
lookup skips blocked workspaces instead of preventing unrelated lookups.

Evidence: quarantine/admission tests, coordinator crash recovery, seven workspace
manager tests, seven workspace-dashboard tests, resource-file and registration
tests, 17 CLI HTTP tests, Template catalog HTTP tests, server TypeScript, and
lint passed. HTTP checks prove retryable 503 responses for affected CLI Agent,
Workflow, Template and capability routes, continued workspace discovery, and
absence of local filesystem paths in those error responses.

**Remaining availability boundary:** an affected *active* workspace still stops
startup; the server does not silently select another workspace. Background retry
was added in the follow-up below; there is no recovery-control UI yet. Some Dashboard routes
still wrap admission failures as generic errors. Full active-workspace recovery
UX and retry, execution-time authority enforcement, native crash acceptance,
graph execution, cleanup and public apply/revision APIs remain outstanding.
No execution capabilities, schedules, images, CLI packaging or canary changes
were enabled by this checkpoint.

### Automatic quarantine retry checkpoint

`6362bfcd` adds an internal retry worker for the startup quarantine snapshot.
The first retry is after 30 seconds, doubling to a maximum five-minute delay.
Only one awaited recovery runs at a time; an in-flight gateway operation is not
abandoned to start a competing mutation. Healthy workspaces and newly active
apply transactions are not scanned into the retry queue. A workspace leaves
the queue only after recovery returns and its admission check succeeds.

The authenticated `/api/system` response includes `templateRecovery` status,
pending count, attempt count, next retry time and last completion time. It does
not expose transport errors, filesystem paths, credentials or workspace IDs.
Timers do not keep a shutting-down process alive; shutdown cancels future
retries and does not start another workspace after an in-flight attempt settles.

Deterministic clock tests passed for unavailable-then-recovered gateway state,
exact rollback preserving unrelated entries, corrupt journal preservation,
duplicate roots/start calls, capped backoff, overlapping callbacks, shutdown
during recovery, and an empty queue. Quarantine/admission and coordinator crash
tests, server TypeScript, and lint also passed. The new suite is in `SYSTEM/test.sh`.
These tests use a simulated gateway, not either installed canary.

At this checkpoint active-workspace failure still stopped startup before the
retry worker. The follow-up below adds the required recovery request gate.
The worker does not enable Template execution, recurring schedules, or CLI
plan/apply.

### Active workspace recovery serving checkpoint

`a342b8e7` keeps HTTP serving in recovery-only mode after initial recovery fails
or persistent-store readiness remains unavailable. Normal API requests, including
authentication, CLI, runtime broker and resource routes, receive a versioned,
retryable 503 before audit or route handlers can access workspace state. No
workspace selection is changed. Static frontend assets can still be served;
this checkpoint does not add a recovery-screen UI.

- `GET /api/health/live`: process liveness only, **not deployment readiness**.
- `GET /api/health`: remains 503 until store readiness and required gateway checks
  pass.
- `GET /api/recovery`: minimal public recovery mode and retry counters/times,
  with no workspace identity, paths, transport errors, or credentials.

The retry worker now includes the active workspace when needed. Successful
journal recovery is insufficient: persistent-store checks must also pass before
the request gate opens. Background services wait for both successful checks and
the HTTP listener, start once, and cannot resume after shutdown. No blanket
Template execution restriction is removed.

Focused serving-gate tests cover the method/path allowlist, auth/runtime/CLI
blocking, retryable error contract with request IDs, no-store responses,
readiness failure then retry success, exactly-once service startup and shutdown.
Recovery-worker, coordinator crash, workspace quarantine and 15 startup-readiness
checks passed; server TypeScript and lint passed. These are local contract tests,
not live cloud/on-prem or real native-gateway crash acceptance.

**Deployment follow-up:** configure liveness separately from readiness before
canary acceptance; a supervisor using `/api/health` as a restart trigger may
still interrupt recovery. No probe configuration, image, CLI package, installed
instance, or recurring schedule was changed here. Full CI, live recovery,
execution-time authority enforcement, graph execution and exact cleanup remain
release gates.

### Live HTTP acceptance and native rollback blocker

`6d6b95ac` adds a real loopback HTTP acceptance test using the production request
gate, recovery worker, journal recovery and health handler, with a simulated
gateway transport. It passed: liveness 200/readiness 503 throughout failure,
blocked workflow/broker/CLI mutations, private-detail-free status, successful
recovery followed by readiness 200, one service start, unrelated roster
preservation and blocked mutations after shutdown. It is included in the full
test runner. This is not a complete Dashboard-process boot test.

`516da0db` extends the opt-in native harness to committed-journal replay and
uncommitted registration rollback. Tested prepared OpenClaw target: `v2026.8.2`,
clean source SHA `0965053fe6b9341776df147a6934b7485c60b5ca`. The harness remains
isolated: temporary config/state and process group, no installed profiles,
disabled cron/tools/heartbeats, no model calls. Both runs cleaned up their own
processes and disposable state; neither canary was touched.

**Historical checkpoint: native rollback acceptance FAILED.** The patched-runtime
checkpoint below supersedes this failure; the unpatched runtime is not approved.

1. First run: `config.patch` rejected removal of the staged Agent's `skills`
   and `tools.deny` arrays without exact `replacePaths` acknowledgements.
2. Dashboard now generates those exact paths for null/deletion entries only,
   retains the revision `baseHash`, and shares that production payload builder
   with the native harness. Focused gateway/coordinator tests, TypeScript and
   lint passed.
3. Second run passed the array-intent check but failed in the native config
   writer: `Config write would drop agent roster entries without an explicit
   deletion`. The gateway journal remained pending; recovery did not report
   success. Staging/replay and committed-journal preservation passed before this
   failure. These manually prepared checkpoints are not native process-crash
   acceptance.

Runtime source evidence: `src/gateway/server-methods/config.ts` passes its
existing `writeOptions` to `commitGatewayConfigWriteOrRespond` without translating
explicit null Agent entries into roster-removal authorization.
`src/config/io.write-prepare.ts` enforces that authorization;
`src/gateway/server-methods/agents-config-mutations.ts` supplies
`allowedAgentRosterRemovals` for the separate single-Agent deletion operation.
Sequential single-Agent deletion is not a substitute for the required atomic
revision-checked rollback.

Required native-runtime handoff: support exact Agent-removal intent for
revision-checked keyed config patches (or an equivalent atomic batch deletion
contract). Derive permitted IDs only from explicit deletions, retain stale-hash
rejection and unrelated-roster preservation, and test multi-Agent rollback,
unexpected external edits and response loss. Dashboard should rerun this native
harness after the prepared runtime contains that change. Do not publish an
Operations-ready claim or enable public apply while this acceptance fails.

CLI/deployment handoff: keep Docker/Compose health checks and rollout readiness
on `/api/health`. For the new Dashboard candidate, separate process-restart
decisions onto `/api/health/live`; recovery status is `/api/recovery`. Validate
the endpoint against the pinned image before changing supervisors—RC79 images
must not be assumed to implement it. Test that recovery-mode readiness 503 with
liveness 200 does not cause a restart loop or mark rollout ready. No CLI source,
packages, runtime source, supervisor configuration or image was changed here.

Afterward, run the Template-first acceptance twice in an isolated development
workspace, proving real Agent replies, Group communication, correlated
Workflow run/results, cancellation, restart persistence, and exact cleanup
while preserving unrelated resources. Only then build immutable public and
combined RC80 images and repeat on test10 (hosted LLM) and MBP14 (local Qwen).

### Patched native rollback and upstream submission

`cc2f775c` adds the maintained source patch that derives exact existing keyed
Agent-removal intent for revision-checked native config patches. Docker builds
and local prepared-runtime builds apply it; the local cache stamp includes the
patch checksum. It preserves revision checks and destructive-array acknowledgments.

`d24e837f` extends the isolated native harness. The rebuilt `v2026.8.2` target
passed staging/replay, committed-journal recovery, two-Agent rollback, stale
revision rejection, retry after a deliberately lost response, and unrelated
roster preservation. The harness cleaned up its disposable state/processes and
made no model calls. This is not a native OS-process-crash acceptance claim.

Upstream-only fix submitted as
[OpenClaw PR #152052](https://github.com/openclaw/openclaw/pull/152052), linked to
[issue #152047](https://github.com/openclaw/openclaw/issues/152047). Candidate
commit: `9ca97086acf19482c854c13589ba350af6642dfa`, based on upstream main
`df84d4a2cddbc0ae2c3d422cf8f147cbe916d3a2`. Only OpenClaw source and synthetic
regression tests were submitted; no Dashboard implementation or instance details.
The registered-handler regression failed before the fix; afterward 58 handler
tests passed with one pre-existing skip. Persistence-preparation and write-flow
suites, `pnpm check:changed`, and the required independent review also passed.
The full upstream build/test suite was not run. Submission is not upstream merge
or release acceptance.

Dashboard [CI run 35375477872](https://github.com/Maximilien-ai/clawmax/actions/runs/35375477872)
at `d24e837f` failed in the test job's **Start dashboard server** step; diagnosis
is still required. RC80 is not approved. Public Operations apply remains disabled;
no images, schedules, or canary installations changed in this checkpoint.
