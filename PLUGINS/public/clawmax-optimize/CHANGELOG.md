# Changelog

## 0.4.1

- Move AI-assisted tuning to a full-width, default-open panel at the top of the
  plan editor and remember its collapsed state in the current browser.
- Render Suggested relationship graphs directly from the visible, unapplied
  plan suggestions instead of requiring persisted Active records.
- Use the editor width more effectively with a two-column manual control layout
  on wide screens and a clear filtered-empty graph state.

## 0.4.0

- Allow built-in suggestions to become editable Active plans before an agent
  or workflow target is selected.
- Add a purpose-built relationship graph connecting optimization dimensions,
  plans, and workspace, workflow, or agent targets.
- Surface suggestion activation progress and actionable failures in every
  Suggested view.
- Add grouped editing, workspace-aware target selection, AI-assisted tuning
  with undo, and semantic quality and duration gauges.
- Keep Suggested graph previews compact and identify their unassigned targets.

## 0.3.0

- Add synchronized slider and exact numeric controls for token, cost, duration,
  and quality targets.
- Enforce declared target limits in browser normalization and server
  persistence.

## 0.2.0

- Add quality-preserving model, workflow latency, and per-run efficiency plans.
- Add structured optimization goals, per-run budgets, latency limits, and
  quality floors.
- Add automatic model-selection and Quality, Balanced, or Cost priority
  recommendations aligned with agent configuration.
