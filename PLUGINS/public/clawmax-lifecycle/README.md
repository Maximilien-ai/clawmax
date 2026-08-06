# Lifecycle

Lifecycle is a public ClawMax plugin that gives users an X-ray view of selected
agents, workflows, groups, or communities in a single focused surface.

Agent inspections show creation metadata, current and observed models,
associated file metadata, conversation counts, observed configuration changes,
and a chronological fishbone timeline. Workflow inspections show definitions,
status, retained executions, participants, and artifact metadata. Users can
compare multiple objects and limit timelines by focus and time window. Group and
community inspections show retained message activity and archived conversation
metadata without replacing the Communications surface.
Conversation and file contents are not exposed to the plugin.

Dashboard-driven agent configuration and model changes are recorded for future
history. Older history is reconstructed from available workspace timestamps and
OpenClaw session metadata and is labeled with its limitations. Timeline spacing
preserves relative elapsed time while compressing long inactive periods.

Lifecycle is intentionally diagnostic rather than an enterprise control. It
does not enforce policy, score quality, or change runtime configuration.
