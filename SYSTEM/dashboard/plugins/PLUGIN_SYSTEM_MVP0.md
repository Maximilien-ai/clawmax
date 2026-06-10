# ClawMax Plugin System MVP0

This document defines the first plugin contract for ClawMax Dashboard.

## Goals

- Allow multiple plugins to extend the dashboard without merging every feature into the core product.
- Give each plugin a first-class tab in the dashboard sidebar.
- Keep plugin data workspace-scoped and visually consistent with the rest of ClawMax.
- Let plugins use a constrained host interface for:
  - notifications
  - generated documents
  - agents
  - workflows
  - communications metadata

## Host Discovery

The dashboard host loads plugin manifests from:

- `SYSTEM/dashboard/plugins/*/clawmax-plugin.json`
- Any extra local directories listed in `CLAWMAX_PLUGIN_PATHS`

Optional filtering:

- Set `CLAWMAX_ENABLED_PLUGINS=plugin-lab-guardrails,plugin-lab-evals` in local `SYSTEM/dashboard/.env`
- Set `CLAWMAX_DISABLE_DEFAULT_PLUGINS=true` in local `SYSTEM/dashboard/.env` to force a zero-plugin runtime for regression checks

Default behavior:

- Plugins with `enabledByDefault: true` load automatically.
- Test fixtures may be enabled by default on a spike branch for faster iteration.
- Release branches can suppress default plugins with `CLAWMAX_DISABLE_DEFAULT_PLUGINS=true` or by shipping only dormant manifests.
- The host must still support zero visible plugins in standard runtimes.

## Navigation Contract

- Plugin tabs render in a dedicated `Plugins` section.
- The section appears after `Communications`.
- The section appears before `Skills` and `Templates`.
- Plugin tabs are host-managed, not end-user reorderable in MVP0.

## Manifest Contract

Each plugin must provide `clawmax-plugin.json` that conforms to `plugin-manifest.schema.json`.

Required fields:

- `id`
- `slug`
- `name`
- `description`
- `version`
- `icon`
- `objectKind`
- `visibility`
- `source`

Important MVP0 rules:

- `visibility` can be `private` or `public`, but MVP0 assumes host-managed plugin enablement.
- `enabledByDefault` should reflect branch intent:
  - `true` for branch-local test fixtures during active plugin development
  - `false` for dormant examples and release-ready defaults
- `nav.section` must be `plugins`.
- `source` should point to the canonical plugin repo or internal source of truth.

## Workspace Storage Contract

Per-workspace plugin state lives under:

`WORKSPACE/SYSTEM/plugins/<plugin-slug>/`

Current files:

- `items.json`
- `docs/<item-id>.md`

## Host Interfaces

Current host-side interfaces exposed to plugins:

- Manifest discovery and nav injection
- Workspace-scoped object persistence
- Generated Markdown documents
- Notification emission
- Workspace context lookup:
  - agents
  - workflows
  - groups
  - communities

## MVP0 Object Shapes

### Guardrails

Guardrail records support:

- enable/disable
- tags
- applies-to:
  - agents
  - workflows
  - groups
  - communities
- controls:
  - `blockEmail`
  - `blockWeb`
  - `blockExternalDocs`
  - `allowedSkills`

### Evals

Eval records support:

- enable/disable
- tags
- target type:
  - `agent`
  - `workflow`
  - `group`
- experiment:
  - `input`
  - `candidateOutput`
  - `expectedOutput`
  - `judge`
- run history
- latest score summary

## Repo Structure

Each plugin repo should converge on the same layout:

```text
.
├── README.md
├── clawmax-plugin.json
├── docs/
│   └── MVP0.md
├── src/
│   └── index.md
├── tests/
│   └── plugin-contract.test.md
└── scripts/
    └── validate-plugin.sh
```

For MVP0, the host can ship local manifests for test plugins. On active plugin branches they may be enabled by default for faster testing, while release branches should keep them dormant or explicitly disabled. The long-term goal is for a plugin repo manifest to become the canonical source when a real plugin is ready.

## Test Requirements

Every plugin integration should keep three classes of tests:

- Host contract tests
  - manifest discovery
  - route behavior
  - workspace storage behavior
- Client contract tests
  - search/filter helpers
  - nav path helpers
- Template contract tests
  - template discovery
  - template apply
  - applied template becomes an editable workspace object
- Plugin repo contract tests
  - manifest presence and required fields
  - docs/scripts/layout parity with the agreed structure

## What MVP0 Does Not Yet Do

- Runtime-loaded remote frontend bundles
- Per-plugin custom React bundles outside the shared host shell
- User-managed enable/disable toggles
- Fine-grained plugin permissions
- Real model-backed eval judges
- Real runtime enforcement of guardrail policies against agent execution

Those belong in MVP1+ after the contract holds up under test plugins and real implementations.

## Local Testing

Use local `SYSTEM/dashboard/.env` to force-enable or force-disable test plugins during development:

```bash
CLAWMAX_ENABLED_PLUGINS=plugin-lab-guardrails,plugin-lab-evals
# CLAWMAX_DISABLE_DEFAULT_PLUGINS=true
```

Do not commit production plugin enablement into the repo. Standard runtimes should still be testable with zero plugins loaded.
