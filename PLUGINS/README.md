# ClawMax Plugins

ClawMax 2.0 provides a public, domain-neutral plugin host. Plugins can add
declarative pages, records, settings, documentation, notifications, approved
workspace context, and host-mediated actions without adding product-specific
types to the core dashboard.

## Create A Plugin

Start with the [Plugin Authoring Guide](PLUGIN_AUTHORING_2_0.md). It documents
the `clawmax.ai/v2` manifest, supported fields, workspace records, templates,
least-privilege capabilities, external loading, and health diagnostics. The
[Plugin System Guide](PLUGIN_SYSTEM_2_0.md) explains host ownership, isolation,
release acceptance, and the remaining 2.0 contract work.

Use [`plugin-manifest.schema.json`](plugin-manifest.schema.json) to validate a
manifest. Third-party and deployment-managed plugin source should remain in its
own repository or package; do not copy credentials, customer data, or
non-public implementation details into ClawMax.

## Public Product Plugins

- [Lifecycle](public/clawmax-lifecycle/README.md) provides read-only inspection
  of agents, workflows, groups, communities, retained activity, and artifacts.
- [Review](public/clawmax-review/README.md) organizes release-specific human and
  external-environment checks, notes, evidence, and exports.

Directories under `PLUGINS/test/plugin-*` are synthetic contract fixtures.
They are not product plugins and are not exposed in the plugin manager.

## Plugins And Partners

Use a plugin when the extension contributes a ClawMax product surface or
host-mediated behavior. Use a partner definition when ClawMax needs catalog
metadata and bounded configuration for an external service. A partner may also
use a public host adapter, but partner selection alone never grants activity or
transcript access. See the [Partner Contribution Guide](../PARTNERS/README.md)
for examples and the consent-gated Activity Export boundary.
