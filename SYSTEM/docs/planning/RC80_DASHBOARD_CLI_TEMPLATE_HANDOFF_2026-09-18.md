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

Afterward, run the Template-first acceptance twice in an isolated development
workspace, proving real Agent replies, Group communication, correlated
Workflow run/results, cancellation, restart persistence, and exact cleanup
while preserving unrelated resources. Only then build immutable public and
combined RC80 images and repeat on test10 (hosted LLM) and MBP14 (local Qwen).
