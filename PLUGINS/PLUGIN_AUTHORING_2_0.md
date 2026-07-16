# ClawMax Plugin Authoring 2.0

Use this contract for declarative plugins that define object types outside
ClawMax core. Legacy host-defined manifests remain supported temporarily
through the MVP0 compatibility adapters.

## Manifest

A v2 plugin repository provides `clawmax-plugin.json` with:

- `apiVersion: clawmax.ai/v2`
- a unique lowercase `objectKind`
- a `recordSchema` using the supported field subset
- optional `ui.form.order` and `ui.list.fields`
- explicit host capabilities
- `enabledByDefault: false` for private or deployment-managed plugins

```json
{
  "apiVersion": "clawmax.ai/v2",
  "id": "example-review-plugin",
  "slug": "example-review-plugin",
  "name": "Reviews",
  "description": "Workspace review records.",
  "version": "0.2.0",
  "icon": "docs",
  "objectKind": "review-note",
  "visibility": "private",
  "enabledByDefault": false,
  "source": {
    "type": "github",
    "owner": "example",
    "repo": "example-review-plugin",
    "url": "https://github.com/example/example-review-plugin",
    "branch": "main"
  },
  "capabilities": {
    "notifications": true,
    "docs": true
  },
  "labels": {
    "singular": "Review",
    "plural": "Reviews"
  },
  "recordSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["priority", "notes"],
    "properties": {
      "priority": {
        "type": "string",
        "title": "Priority",
        "enum": ["low", "medium", "high"],
        "default": "medium"
      },
      "notes": {
        "type": "string",
        "title": "Notes",
        "format": "textarea"
      },
      "approved": {
        "type": "boolean",
        "title": "Approved",
        "default": false
      }
    }
  },
  "ui": {
    "form": { "order": ["priority", "notes", "approved"] },
    "list": { "fields": ["priority", "approved"] }
  }
}
```

## Supported Fields

The first v2 contract intentionally supports a constrained schema subset:

- `string`, optionally with `enum` or `text`, `textarea`, `date`, or `uri` format
- `number`
- `integer`
- `boolean`
- arrays of strings

Each property requires a `title` and may provide `description` and `default`.
Required fields must name declared properties. Form and list field references
must also name declared properties. Undeclared record fields are discarded by
the host.

## Records And Templates

Generic record state is stored under `fields`:

```json
{
  "name": "Release review",
  "description": "Review release readiness.",
  "tags": ["release"],
  "enabled": true,
  "fields": {
    "priority": "high",
    "notes": "Check acceptance evidence.",
    "approved": false
  }
}
```

Templates use the same record shape in `payload`. The host supplies IDs and
timestamps, applies defaults, validates required fields, and materializes the
workspace JSON and Markdown files.

## Loading An External Plugin

Mount or check out the plugin repository outside ClawMax, then configure:

```bash
CLAWMAX_PLUGIN_PATHS=/absolute/path/to/example-review-plugin
CLAWMAX_ENABLED_PLUGINS=example-review-plugin
```

Multiple plugin roots use the platform path delimiter. Production deployment
must mount private repositories or packaged plugin directories separately from
the public ClawMax image.

## Current Boundary

V2 plugins are declarative. They do not load arbitrary frontend bundles or
execute unrestricted server code. Host-mediated custom actions and finer
permission enforcement are later 2.0 contract phases.
