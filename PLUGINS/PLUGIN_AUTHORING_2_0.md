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

## Capabilities And Least Privilege

Capabilities are optional, deny-by-default host grants. Declare only what the
plugin needs:

- `docs`: generate a workspace document for a plugin record
- `notifications`: emit a dashboard notification for a plugin record
- `agents`: include non-archived agents in plugin workspace context
- `workflows`: include workflows in plugin workspace context
- `communications`: include groups and communities in plugin workspace context

The host filters `GET /api/plugins/:pluginId/context` to the declared grants.
Undeclared context collections are returned as empty arrays. Explicit document
or notification operations without the matching grant return HTTP `403` with
the manifest property needed to authorize the operation. Unknown capability
names and non-boolean values make the manifest invalid.

Generating a document emits an artifact notification only when the plugin has
both `docs` and `notifications`; the grants do not imply one another.

Granted capabilities are visible on the plugin page and in **System & Logs >
Plugins**. Changing a manifest requires reloading the plugin host; grants cannot
be expanded from the dashboard UI.

## Loading An External Plugin

Mount or check out the plugin repository outside ClawMax, then configure:

```bash
CLAWMAX_PLUGIN_PATHS=/absolute/path/to/example-review-plugin
CLAWMAX_ENABLED_PLUGINS=example-review-plugin
```

Multiple plugin roots use the platform path delimiter. Production deployment
must mount private repositories or packaged plugin directories separately from
the public ClawMax image.

## Health Diagnostics

Before debugging a missing navigation entry, open **System & Logs > Plugins**
or request `GET /api/plugins/diagnostics`. The response reports the host API
version, configured roots, a status summary, and one entry per discovered or
requested plugin. Each entry also reports its recognized capability grants:

- `loaded`: valid and enabled
- `disabled`: valid and discovered, but not selected by the current enablement policy
- `invalid`: unreadable JSON or a manifest that does not satisfy its declared contract
- `incompatible`: the manifest requests an unsupported host API version
- `duplicate`: another discovered plugin already owns the same `id` or `slug`
- `missing`: a configured root does not exist, or an explicitly enabled plugin was not found

Disabled plugins do not make the host unhealthy. Invalid, incompatible,
duplicate, and missing entries do. Each failing entry includes remediation and
the relevant manifest or configured-root path. Duplicate identities are
diagnosed and only the first discovered manifest is eligible to load.

## Current Boundary

V2 plugins are declarative. They do not load arbitrary frontend bundles or
execute unrestricted server code. The existing document, notification, and
workspace-context operations are host-mediated and capability-enforced.
Manifest-declared custom actions and finer action-specific grants are later 2.0
contract phases.
