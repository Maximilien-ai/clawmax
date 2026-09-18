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

This is not production deployment acceptance: automatic startup recovery,
execution-time authority enforcement, full graph execution, safe merge-aware cleanup,
public revision APIs, and UI presentation remain outstanding. No apply endpoint
or execution capability was enabled, and neither canary was changed.

Afterward, run the Template-first acceptance twice in an isolated development
workspace, proving real Agent replies, Group communication, correlated
Workflow run/results, cancellation, restart persistence, and exact cleanup
while preserving unrelated resources. Only then build immutable public and
combined RC80 images and repeat on test10 (hosted LLM) and MBP14 (local Qwen).
