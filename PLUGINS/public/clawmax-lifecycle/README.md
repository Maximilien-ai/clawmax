# Lifecycle

Lifecycle is a public ClawMax plugin that gives users an X-ray view of one agent
or workflow in a single focused surface.

The initial skeleton persists an inspection subject, focus, time window, and
review notes through the generic `clawmax.ai/v2` plugin contract. It requests
read-only agent, workflow, document, and communication context from the host.

Planned increments will add a unified timeline, configuration changes, files
and artifacts, workflow executions, agent output, and links back to the owning
dashboard surfaces. The plugin must preserve source links and timestamps, avoid
copying secret values, and clearly distinguish observed facts from inferred
summaries.

Lifecycle is intentionally diagnostic rather than an enterprise control. It
does not enforce policy, score quality, or change runtime configuration.
