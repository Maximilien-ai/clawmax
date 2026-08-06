# Public Workspace Dashboards · 2.0

Workspace dashboards remain shareable snapshots, with explicit controls for freshness and interaction.

## Current scope

- Owners can choose an optional human-readable URL slug. Existing token links continue to work.
- Owners can enable auto-refresh and choose a bounded refresh interval (10 seconds to 1 hour).
- Owners can opt in to an interaction section. The shared page then exposes only the selected workspace's agents, workflows, and groups, and sends the visitor's input through the existing runtime APIs.
- Interaction controls are disabled by default so an existing read-only dashboard does not become writable after upgrade.

## Follow-up

- Add per-target interaction permissions and audit events before enabling public dashboards for untrusted audiences.
- Add owner-managed dashboard editing for existing links, including slug changes and refresh settings.
- Add workflow run progress and streamed agent responses to the interaction card.
- Add rate limits and optional approval gates for workflow starts and group messages.
