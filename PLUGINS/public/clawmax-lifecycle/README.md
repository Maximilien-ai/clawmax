# Lifecycle

Lifecycle is a public ClawMax plugin that gives users an X-ray view of selected
agents or workflows in a single focused surface.

Agent inspections show creation metadata, current and observed models,
associated file metadata, conversation counts, observed configuration changes,
and a chronological fishbone timeline. Users can inspect multiple agents and
limit the timeline by focus and time window. Conversation and file contents are
not exposed to the plugin.

Dashboard-driven agent configuration and model changes are recorded for future
history. Older history is reconstructed from available workspace timestamps and
OpenClaw session metadata and is labeled with its limitations. Workflow X-ray
parity and links back to owning dashboard surfaces are planned next.

Lifecycle is intentionally diagnostic rather than an enterprise control. It
does not enforce policy, score quality, or change runtime configuration.
