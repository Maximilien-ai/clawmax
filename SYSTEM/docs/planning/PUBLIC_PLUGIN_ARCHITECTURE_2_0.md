# Public Plugin Architecture 2.0

> Status: v2 foundation implemented; action grants, packaging, performance, and file-open follow-through remain
> Target: `2.0.0`
> Last updated: August 30, 2026

## Core Rule

A ClawMax plugin can be anything added to the dashboard or ClawMax runtime.
The host must not assume that plugins share any fixed product concept.

Mail providers, model providers, operational pages, workflow tools, and future
capabilities must use the same generic host contract without adding their
domain objects to the core plugin loader.

## Goals

- Keep the public dashboard and runtime extensible without editing core navigation, routes, storage, or domain unions for every plugin.
- Let one plugin contribute any combination of UI, APIs, data, actions, jobs, events, settings, skills, providers, documentation, and extension points.
- Keep public and separately distributed plugins on the same technical contract. Visibility and distribution are metadata, not execution types.
- Make permissions, compatibility, lifecycle, migrations, health, audit, and failure isolation explicit.
- Allow ClawMax to start and retain core functionality when an optional plugin is absent, disabled, incompatible, or unhealthy.

## Non-Goals

- The core host does not define plugin-specific record schemas.
- The core host does not contain product-specific plugin-kind unions.
- The core host does not infer permissions from a plugin name or source repository.
- The first release does not need arbitrary untrusted browser code downloaded at runtime. Packaged and operator-approved modules are a safer initial boundary.

## Contribution-Based Manifest

The manifest describes identity, compatibility, permissions, and contributions. It does not declare a domain object kind.

```json
{
  "apiVersion": "clawmax.ai/v2",
  "id": "clawmax.lifecycle",
  "slug": "lifecycle",
  "name": "Lifecycle",
  "description": "Read-only history and artifact inspection for agents and workflows.",
  "version": "0.1.0",
  "visibility": "public",
  "compatibility": {
    "clawmax": ">=2.0.0 <3.0.0",
    "pluginApi": "^2.0.0"
  },
  "source": {
    "type": "github",
    "url": "https://github.com/Maximilien-ai/clawmax/tree/main/PLUGINS/public/clawmax-lifecycle"
  },
  "permissions": [
    "agents.read",
    "workflows.read",
    "docs.read",
    "communications.read"
  ],
  "contributes": {
    "navigation": [
      { "id": "lifecycle", "label": "Lifecycle", "location": "plugins", "order": 40, "page": "lifecycle.workspace" }
    ],
    "pages": [
      { "id": "lifecycle.workspace", "module": "client/workspace-page" }
    ],
    "api": [
      { "id": "lifecycle.api", "module": "server/routes" }
    ],
    "dataStores": [
      { "id": "lifecycle.workspace", "scope": "workspace", "version": 1 }
    ],
    "settings": [
      { "id": "lifecycle.settings", "scope": "user", "module": "client/settings" }
    ],
    "jobs": [],
    "events": [],
    "actions": [],
    "skills": [],
    "providers": [],
    "docs": []
  }
}
```

Every contribution section is optional. A plugin with only a scheduled job is valid. A plugin with only a model provider or skill is valid. A plugin may add a page without defining a custom data record, or define actions and event handlers without adding navigation.

## Standard Contribution Points

The public v2 contract should support these generic categories without assuming plugin purpose:

- **navigation**: top-level, System, Plugins, workspace, object-detail, or contextual navigation entries;
- **pages**: full pages, settings pages, detail views, dialogs, and embedded panels;
- **api**: namespaced server routes with host authentication and workspace scoping;
- **dataStores**: workspace, user, instance, or global plugin-owned versioned state;
- **migrations**: ordered, idempotent data migrations and rollback metadata;
- **actions**: commands exposed to the UI, workflows, agents, or operators;
- **jobs**: scheduled and background tasks with health, retry, and cancellation contracts;
- **events**: subscriptions to documented host events and plugin-owned events;
- **settings**: typed configuration and secret references at supported scopes;
- **skills/tools**: agent-facing capabilities with explicit permissions and secret grants;
- **providers**: model, storage, registry, mail, observability, or other provider adapters;
- **docs**: DocHub entries, help, runbooks, and generated artifacts;
- **notifications**: declared notification categories and actions;
- **extensions**: documented slots in existing ClawMax pages, such as workflow details or agent actions.

New contribution categories can be added through a versioned plugin API without changing the meaning of existing manifests.

## Host Versus Plugin Ownership

The host owns:

- discovery, validation, enable/disable, compatibility, and lifecycle;
- authentication, authorization, workspace/user scope, and permission enforcement;
- navigation and extension-slot placement;
- API namespacing and request context;
- storage primitives, migrations, secret references, audit, and backups;
- shared UI components, accessibility, themes, responsive behavior, and error boundaries;
- job scheduling primitives, health, cancellation, and resource limits;
- event delivery contracts and loop protection;
- plugin health, diagnostics, logs, and failure isolation.

Each plugin owns:

- its product concepts, schemas, business rules, UI, routes, actions, jobs, and documentation;
- validation beyond generic manifest and permission checks;
- its migrations and compatibility declarations;
- tests for its contributions and behavior;
- clean behavior when optional host capabilities or other plugins are unavailable.

The core repository should not import plugin domain types into generic host modules.

## Capabilities And Permissions

Use namespaced string permissions rather than a growing interface of booleans. Examples:

- `agents.read`, `agents.write`
- `workflows.read`, `workflows.policy.write`, `workflows.schedule.write`
- `metering.read`, `budgets.read`, `budgets.write`
- `models.read`, `providers.register`
- `skills.register`, `actions.register`, `jobs.register`
- `notifications.create`, `docs.write`
- `secrets.reference`, `secrets.execute`

Unknown permissions fail manifest validation unless explicitly allowed by a compatible host API version. Runtime calls must still be checked; manifest declaration alone does not grant access.

## Runtime Context

Plugin server contributions receive a constrained host context rather than importing internal singletons:

```ts
interface ClawMaxPluginContext {
  plugin: { id: string; version: string }
  actor: { userId?: string; login?: string; email?: string }
  workspace: { id: string; path?: string }
  permissions: ReadonlySet<string>
  services: {
    agents?: AgentsService
    workflows?: WorkflowsService
    metering?: MeteringService
    budgets?: BudgetService
    models?: ModelsService
    storage?: PluginStorageService
    events?: PluginEventsService
    audit?: PluginAuditService
    notifications?: PluginNotificationService
  }
}
```

Only services backed by granted permissions are present. Private filesystem paths and raw secrets should not be exposed by default.

## UI Contract

- Plugin pages run inside the authenticated dashboard shell and receive workspace/navigation context.
- The host supplies shared components and design tokens so plugins remain consistent with Agents, Workflows, Keys & Secrets, and other operational pages.
- Plugin pages must support dark/light themes, mobile layouts, keyboard navigation, loading, empty, error, offline, and permission-denied states.
- Every plugin page receives an error boundary so one plugin cannot crash the dashboard shell.
- Routes and navigation entries disappear cleanly when a plugin is disabled or incompatible.
- Extension slots are versioned and optional; a missing slot cannot break plugin startup.

## API And Data Isolation

- Plugin routes live under `/api/plugins/{pluginId}/...` unless they implement a separately documented provider contract.
- Host middleware applies authentication, actor identity, workspace scope, request limits, audit correlation, and permission checks before plugin code.
- Plugin storage is namespaced by plugin and scope.
- Plugins cannot read another plugin's store without an explicit shared contract and permission.
- Export, import, delete, backup, and workspace switching must include plugin state through host lifecycle hooks.
- Disabling a plugin preserves its state by default; uninstall can offer an explicit data-removal option.

## Lifecycle

Required lifecycle states:

- discovered;
- compatible or incompatible with a reason;
- enabled or disabled;
- migrating;
- ready;
- degraded;
- failed;
- uninstalling.

Required hooks may include:

- `validateManifest`;
- `install`;
- `migrate`;
- `start`;
- `health`;
- `stop`;
- `exportState`;
- `importState`;
- `deleteWorkspaceState`;
- `uninstall`.

Hooks need timeouts, cancellation, structured errors, and audit events. A failed optional plugin should degrade independently rather than preventing ClawMax startup.

## Public And Separately Distributed Plugins

Distribution describes source and availability, not capability or trust level:

- both use the same manifest and runtime APIs;
- both declare permissions and contributions;
- both receive compatibility, lifecycle, health, audit, and isolation checks;
- public plugins ship source, tests, documentation, and release artifacts publicly;
- separately distributed plugins can be loaded from operator-configured paths or registries without being bundled into the public repository or default image.

The host must not contain code paths named after non-public plugin products.

## Migration From MVP0

The MVP0 contract includes host-defined object-kind unions, templates, and
generic pages that understand specific legacy records. Replace this
incrementally:

1. Introduce the v2 contribution manifest alongside MVP0.
2. Add a generic workspace-page fixture with no product-domain assumptions.
3. Move shared discovery, enablement, navigation, route, health, and storage behavior to v2 services.
4. Move legacy product implementations into independent plugins that register
   their own pages, APIs, stores, and schemas.
5. Remove `PluginObjectKind`, `PluginRecord`, and product-specific template logic from the host.
6. Keep a bounded compatibility adapter only for the migration window.
7. Use the public Lifecycle and Review plugins as proofs that the host supports
   useful products without domain-specific assumptions.

## Test Contract

- accept plugins with any valid subset of contributions, including no page and no record schema;
- reject duplicate IDs, navigation collisions, invalid modules, unsupported API versions, and undeclared permissions;
- verify permissions at manifest validation and every runtime service call;
- isolate workspace, user, instance, global, and plugin data scopes;
- verify enable, disable, migrate, restart, export, import, workspace delete, and uninstall;
- confirm plugin failure does not crash core routes or dashboard navigation;
- test stale/incompatible plugins with actionable diagnostics;
- verify public and separately distributed plugins execute through the same host contracts;
- ensure one plugin cannot access another plugin's state, routes, secrets, or events without a declared shared contract;
- run desktop/mobile/accessibility checks for contributed pages and dialogs;
- prove Lifecycle, Review, mail, and externally distributed plugins require no
  product-specific branches in the host.

## 2.0 Release Gate

- the generic host contains no product-specific plugin-kind assumption;
- a page-only plugin, API-only plugin, job-only plugin, provider-only plugin, and multi-contribution plugin all pass contract tests;
- permissions and scopes are enforced by host services;
- plugin migrations and lifecycle survive restart and workspace operations;
- optional plugin failures remain isolated;
- public and separately distributed plugins use the same technical contract;
- Lifecycle and Review run as public plugins without core product-domain types;
- external product plugins run without core product-domain types;
- the public SDK, schema, examples, tests, and author documentation ship together.
