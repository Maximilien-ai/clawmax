# ClawMax Plugin Authoring Guide MVP0

Status: historical compatibility guide. Examples refer only to synthetic
plugin fixtures. New plugins should use
[PLUGIN_AUTHORING_2_0.md](../PLUGIN_AUTHORING_2_0.md).

This guide is for users or AI coding assistants creating a new ClawMax plugin.

This MVP0 guide documents the compatibility adapter. New 2.0 plugin work should
also follow the public-host/private-plugin boundary in
[PLUGIN_SYSTEM_2_0.md](../PLUGIN_SYSTEM_2_0.md).
New generic plugins should use [PLUGIN_AUTHORING_2_0.md](../PLUGIN_AUTHORING_2_0.md).

## Minimum Steps

1. Create a plugin directory under `PLUGINS/<collection>/<plugin-slug>/` or use a standalone plugin repo root
2. Add `clawmax-plugin.json`
3. Add optional `templates/*.json`
4. Restart the dashboard or refresh the app
5. Confirm the plugin appears in the `Plugins` section

If the plugin should remain dormant until explicitly enabled, keep `enabledByDefault: false` and start the dashboard with:

```bash
CLAWMAX_ENABLED_PLUGINS=plugin-slug
```

For local development, prefer setting that in `SYSTEM/dashboard/.env` instead of shell startup files or committed repo config.

If you are iterating on a standalone private plugin repo, add its absolute repo path to:

```bash
CLAWMAX_PLUGIN_PATHS=/absolute/path/to/private-plugin-repo
CLAWMAX_ENABLED_PLUGINS=plugin-slug
```

If you need to regression-test the host with zero plugins loaded, set:

```bash
CLAWMAX_DISABLE_DEFAULT_PLUGINS=true
```

## Minimal Manifest

```json
{
  "id": "plugin-slug",
  "slug": "plugin-slug",
  "name": "Example Plugin",
  "description": "A starter plugin for ClawMax MVP0.",
  "version": "0.1.0-mvp0",
  "icon": "shield",
  "objectKind": "guardrail",
  "visibility": "private",
  "enabledByDefault": false,
  "source": {
    "type": "github",
    "owner": "example",
    "repo": "plugin-repo",
    "url": "https://example.invalid/plugin-repo",
    "branch": "main"
  },
  "nav": {
    "section": "plugins",
    "order": 30
  },
  "capabilities": {
    "notifications": true,
    "docs": true,
    "agents": true,
    "workflows": true,
    "communications": true
  },
  "labels": {
    "singular": "Guardrail",
    "plural": "Guardrails"
  }
}
```

## Starter Template Format

```json
{
  "id": "no-outbound-email",
  "name": "No outbound email",
  "description": "Block outbound email by default.",
  "recommended": true,
  "tags": ["starter", "email", "safety"],
  "payload": {
    "kind": "guardrail",
    "name": "No outbound email",
    "description": "Prevent outbound email until approved.",
    "enabled": true,
    "tags": ["starter", "email", "safety"],
    "appliesTo": {
      "agents": [],
      "workflows": [],
      "groups": [],
      "communities": []
    },
    "controls": {
      "blockEmail": true,
      "blockWeb": false,
      "blockExternalDocs": false,
      "allowedSkills": []
    }
  }
}
```

## Current Host Capabilities

- Plugin nav section and shared plugin surface
- Workspace-scoped objects
- Search and tag filters
- Generated docs
- Notifications
- Context access to agents, workflows, groups, and communities
- Recommended templates

## Markdown Item File Contract

Each plugin object should materialize as markdown so it behaves like the rest of ClawMax in DocHub.

MVP0 expectation:

- Store canonical state in `items.json`
- Also write `items/<item-id>.md`
- Use YAML front matter for stable metadata
- Keep the body human-readable for manual review and AI tooling

Recommended front matter fields:

- `plugin`
- `kind`
- `id`
- `name`
- `status`
- `updated_at`
- `tags`

## Current Limitations

- Shared host UI only
- No remote frontend bundle loading
- No end-user plugin enablement
- No runtime guardrail enforcement yet
- Evals use a placeholder heuristic judge

## Test Plugin

Use these dormant test plugins in this repo as examples:

- `plugin-guardrails`
- `plugin-evals`
