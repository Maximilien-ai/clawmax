# ClawMax Plugin System 2.0

Status: integration contract in progress on `main`

The integration baseline and first generic manifest, record schema, template,
storage, declarative UI, diagnostics, and least-privilege capability contract
are implemented. Generic custom actions, packaging validation, and
legacy-adapter removal remain release work. See
[PLUGIN_AUTHORING_2_0.md](PLUGIN_AUTHORING_2_0.md).

## Purpose

ClawMax 2.0 provides a public plugin host. Product-specific plugins can remain in
private repositories, while public and third-party plugins use the same host
contract. Plugin source and production enablement do not belong in the ClawMax
core repository.

The host owns the stable integration boundary:

- plugin discovery and explicit enablement
- manifest validation and compatibility checks
- navigation and a consistent dashboard shell
- workspace-scoped storage and generated documents
- permission declarations and host-mediated actions
- notifications and access to approved workspace context
- diagnostics for missing, disabled, incompatible, or unhealthy plugins

Plugin repositories own their product behavior:

- object schemas and validation rules
- templates and presets
- display metadata and labels
- optional declarative views and actions
- plugin-specific tests and documentation

## Privacy Boundary

- Private plugin repositories are mounted or installed at deployment time.
- Private plugin files are never copied into this repository or its public
  container image.
- `CLAWMAX_PLUGIN_PATHS` supplies mounted plugin roots.
- `CLAWMAX_ENABLED_PLUGINS` explicitly selects enabled plugins.
- A standard ClawMax runtime must work with zero plugins.
- Public host tests use synthetic fixtures, not private plugin source.

The dashboard may expose manifest metadata for a loaded plugin, but must not
serve its source tree or credentials.

## 2.0 Contract Direction

MVP0 recognizes two host-defined object kinds and renders product-specific
forms in core. That is a compatibility layer, not the final 2.0 contract.

The 2.0 manifest supports a generic plugin identifier plus declarative
contracts for:

- record schema and defaults
- list and detail presentation
- create/edit fields
- available actions and required permissions
- host API compatibility version
- storage and document capabilities

Core must not require a new TypeScript union member, route, or page component
for every new plugin type. The host should reject unsupported contracts with a
clear diagnostic instead of partially loading them.

Arbitrary remote React bundles or unrestricted server code are not part of the
initial 2.0 contract. New extension points remain declarative and host-mediated
until executable-plugin isolation, signing, and permissions are designed and
validated separately.

## Migration Phases

### Phase 1: Integration baseline

Status: implemented; continue regression validation.

- Keep zero-plugin startup working.
- Load private and public manifests from external roots.
- Require explicit enablement for non-default plugins.
- Validate current private plugin manifests against the public schema.
- Preserve the MVP0 object-kind adapters while 2.0 contracts are introduced.

### Phase 2: Generic manifest and records

Status: first contract, health diagnostics, and capability enforcement implemented; compatibility hardening remains.

- Version the host API and manifest contract.
- Add generic record schemas, defaults, and presentation metadata.
- Validate capability declarations and deny undeclared document, notification, and context access.
- Store unknown plugin records without product-specific coercion.
- Render a useful generic list, detail, and editor experience.
- Report loaded, disabled, invalid, incompatible, duplicate, and missing plugins through a host diagnostics API and System & Logs surface.

### Phase 3: Host-mediated actions

Status: existing host operations enforced; generic custom-action contract pending.

- Declare plugin actions in the manifest.
- Route actions through explicit host capabilities. Document and notification
  actions already enforce their grants.
- Record action results and failures with plugin diagnostics.
- Prevent a plugin from using undeclared capabilities. Workspace context is
  already filtered across agents, workflows, and communications.

### Phase 4: Legacy adapter removal

Status: pending.

- Move product-specific schemas, templates, and presentation out of core.
- Validate equivalent behavior through externally mounted plugins.
- Remove host branches that depend on product-specific object kinds.

## Release Acceptance

The 2.0 plugin host is ready when:

- ClawMax passes its full suite with zero plugins enabled.
- Synthetic external plugins pass discovery, CRUD, document, notification, and
  permission contract tests.
- Private plugins can be mounted into local, cloud, and on-prem runtimes without
  rebuilding the public image.
- A third plugin type can integrate without adding product-specific core code.
- Missing mounts, incompatible API versions, invalid manifests, and denied
  permissions produce actionable diagnostics.
- No private plugin source or production enablement is tracked in this repo.
