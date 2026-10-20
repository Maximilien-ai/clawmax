# RC85 Template CLI contract checkpoint

Status: source checkpoint, not RC85 image acceptance or final partner handoff.
This supplements the [RC80 handoff](RC80_DASHBOARD_CLI_TEMPLATE_HANDOFF_2026-09-18.md);
it does not close that document's real-runtime execution gates.

## Release boundary

The user confirmed that **publish/import means importing into an instance's
Template catalog**, not publishing to a shared registry. There is no separate
public `publish` operation; CLI wording must map to `import`.

Implemented source checkpoints:

- `9810dc1e`: live workspace authorization revalidation at lifecycle commit boundaries.
- `8dce1545`: validated original-bundle export through the authenticated public API.
- `b98ddeb8`: conditional staged-lifecycle capability discovery and rejection of
  unsupported policy, Skill, and credential bindings by the production compiler.

These changes are after RC84. Do not claim an RC84 image contains them. No RC85
image tag, digest, full-suite result, or combined-image acceptance is recorded yet.

## Authentication and discovery

All paths below are relative to `/api/cli/v1/workspaces/:workspaceId` and use
CLI bearer authentication plus server-resolved actor/workspace authorization.
No browser session, private route, or direct database access is required.

`GET /capabilities` returns `apiVersion: clawmax.instance/v1`, `kind: Capabilities`,
`workspaceId`, and the existing workspacePackage, templates, skills, communities,
groups, workflows, and runtime sections. Catalog operations are exactly:

```json
["export", "import", "list", "remove", "show", "validate", "versions"]
```

When staged lifecycle admission succeeds, append exactly:

```json
["plan", "apply", "history", "revision-show", "cleanup-plan", "cleanup"]
```

The additional `templates.lifecycle` object is:

```json
{
  "available": true,
  "mode": "staged-no-tools",
  "execution": false,
  "scheduling": false,
  "skillInstallation": false,
  "credentialDelivery": false
}
```

Absent, revoked, unsupported, or mismatched authority yields `available: false`
and catalog-only operation names. Workspace authorization failure remains an
authorization error, not a successful capability response. Discovery is read-only
and is not a cached permission grant; apply revalidates independently.

Production composition is operator-configured through
`CLAWMAX_TEMPLATE_AUTHORITY_DIR` and `CLAWMAX_TEMPLATE_RUNTIME_REVISION`.
The authority directory must be outside the workspace; the per-workspace registry
filename is SHA256(workspaceId) plus `.json`. Registry identities, actor scope,
runtime revision, and the canonical no-tools policy hash must match. No permissive
default registry is created. The fixed policy is defined by
`server/lib/template-execution-policy.ts`.

## Public operations

JSON responses use `application/json`. Every JSON envelope below has
`apiVersion: clawmax.instance/v1`. Bodies shown are exact required field sets;
identifiers and digests must come from actual preceding responses.

| Operation | Method and path | Request | Response kind / status |
| --- | --- | --- | --- |
| Validate | POST `/template-validations` | Portable ZIP and identity headers | TemplateValidation / 200 |
| Publish/import | POST `/templates` | Same ZIP/headers plus Idempotency-Key | TemplateImportResult / 201 new, 200 replay/dedup |
| List | GET `/templates` | None | TemplateList / 200 |
| Show | GET `/templates/:templateId` | None | Template / 200 |
| Versions | GET `/template-keys/:key/versions` | None | TemplateVersionList / 200 |
| Export | GET `/templates/:templateId/export` | No query fields | Original validated ZIP / 200 |
| Remove catalog entry | DELETE `/templates/:templateId` | None | TemplateRemoval / 200 |
| No-write plan | POST `/package-plans` | RevisionRequest below | TemplatePlan / 200 |
| Staged apply | POST `/revisions` | `{ "request": RevisionRequest, "planDigest": string }` | TemplateApplyResult / 201 new, 200 replay |
| History | GET `/revisions` | None | TemplateRevisionList / 200 |
| Revision show | GET `/revisions/:revisionId` | None | TemplateRevision / 200 |
| Cleanup plan | POST `/revisions/:revisionId/cleanup-plans` | `{ "expectedRevision": string or null }` | TemplateCleanupPlan / 200 |
| Cleanup | POST `/revisions/:revisionId/cleanup` | `{ "expectedRevision": string or null, "planDigest": string }` | TemplateCleanupResult / 200 |

RevisionRequest has exactly `templateId`, `expectedRevision`, `idempotencyKey`,
and `bindings`. `bindings` maps artifact IDs to server-owned binding IDs; it
cannot contain policy, credentials, model overrides, filesystem paths, or actor
overrides. `expectedRevision` is the current workspace revision or initially null.

Uploads and export use `application/vnd.clawmax.portable-template+zip`.
Required upload headers are `X-ClawMax-Template-Key`,
`X-ClawMax-Template-Version`, and `X-ClawMax-Template-SHA256`; all must match
the validated archive. Import also requires `Idempotency-Key`.
ZIP input is limited to 64 MiB; lifecycle JSON to 64 KiB. Compressed HTTP bodies
are rejected. Two concurrent upload validations are admitted per router.
Archive traversal, symlinks, duplicate/case-colliding paths, expansion and entry
limits are enforced separately by `portable-template-zip.ts` and its tests.

Export rereads and validates the stored regular file and catalog digest; it is
not a live workspace export and does not collect runtime credentials or chat
history. It sets `Cache-Control: no-store` and attachment filename `templateId.zip`.

## Response fields and replay rules

- Catalog item: `id`, `workspaceId`, `key`, `name`, `version`, `bundleSha256`,
  `artifactCount`, `secretRequirementCount`, `importedAt`.
- Import result: `created`, `template`. List/version results: `items`. Show: `template`.
- Validation: `valid`, `key`, `name`, `version`, `bundleSha256`, `artifactCount`,
  `secretRequirementCount`.
- Plan: `workspaceId`, `actorId`, `request`, `templateDigest`, `authorityDigest`,
  optional `authority`, `resources`, `changes`, `planDigest`.
- Resources: `agents`, `communities`, `groups`, `workflows`, each mapping artifact
  ID to owned resource ID. Changes contain relative `path`, `before`, `after`;
  before/after are digests or null, not file contents.
- Public revision: `id`, `actorId`, `idempotencyKey`, `planDigest`, `templateId`,
  `templateDigest`, `authorityDigest`, optional `authority`, `resources`, `createdAt`,
  optional `cleanedAt`. Private undo data and request digests are omitted.
- Apply: `workspaceId`, `created`, `revision`. History: `workspaceId`,
  `currentRevision`, actor-filtered `items`. Revision show: `workspaceId`, `revision`.
- Cleanup plan: `workspaceId`, `actorId`, `revisionId`, `expectedRevision`,
  `resources`, `changes`, `planDigest`. Cleanup result: `workspaceId`, `removed`,
  `currentRevision`, `revision`.

Import keys are actor-scoped; reusing a key with different bytes conflicts.
The same Template key/version with different bytes also conflicts. Apply keys
are checked against the request and plan digest; replay does not redispatch.
Reusing an apply key for a cleaned revision conflicts. Cleanup replay returns
`removed: false`; requesting a new cleanup plan for a cleaned revision conflicts.
Catalog removal is distinct from cleanup and never grants removal of staged resources.

## Errors and evidence

Template errors have `{ apiVersion, kind: "Error", requestId,
error: { code, message, retryable } }`. `retryable` is true for 429/503 only;
clients must not interpret it as permission to blindly repeat mutations with new keys.

Important statuses: 400 invalid request/header identity, 401 unauthenticated,
403 workspace/revision forbidden, 404 absent catalog entry, 409 stale revision,
stale plan, idempotency conflict, resource conflict, or unsupported authority/policy;
413 size limit, 415 media/compression, 429 validation busy, 503 unavailable lifecycle
or storage. Match structured codes, not message text. Replan after a stale conflict.

Executable evidence lives in:

- `server/routes/instance-templates.test.ts`: catalog HTTP, export bytes/media,
  cross-workspace denial, replay/conflict, removal, storage safety.
- `server/routes/instance-template-lifecycle.test.ts`: strict requests, no-write
  plans/discovery, capability fields, actor isolation, stale plans, authorization
  revocation around gateway waits, cleanup and preservation.
- `server/lib/template-apply-coordinator.test.ts`: configured resolver admission,
  unsupported policies/Skills/credentials, synthetic execution, process-loss recovery.
- `server/lib/template-gateway-transaction.test.ts`, `template-revisions.test.ts`,
  `template-authority-revalidation.test.ts`, `template-recovery-worker.test.ts`,
  `workspace-file-transaction.test.ts`: ownership, rollback, replay and recovery.

Focused tests and TypeScript passed for the source checkpoints above. Synthetic
gateway tests are not real-provider acceptance. The coordinated journal/ledger
provides recovery across gateway and file commits; this is not a single database
transaction spanning both systems.

## Still required before final handoff

- Versioned, machine-readable request/response/error fixture corpus consumed by
  the strict CLI client (including digest-linked plan/apply/cleanup examples).
- Full integration/validation/coverage results for the final RC85 source.
- Real-runtime acceptance and the remaining RC80 execution/visibility gates;
  staged apply must not be described as automatic execution.
- Public and matching combined RC85 image SHAs, digests, both architectures,
  registry/runtime smoke results and CI links.
- Mike's RC83 model-routing reproduction and RC85 regression acceptance.

Do not mark these gates complete from source tests or green image builds alone.
