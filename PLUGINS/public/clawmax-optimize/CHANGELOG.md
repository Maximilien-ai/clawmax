# Changelog

## 0.4.4

- Keep Suggested plan details below the graph for exploration.
- Restore the standard right-side detail drawer when an Active or Archived plan
  is clicked, while retaining non-obstructive relationship previews on hover.

## 0.4.3

- Preview a plan's related attributes, edges, and destination while hovering or
  keyboard-focusing its graph node.
- Keep clicked graph selections locked after the pointer leaves the node.
- Show Active and Archived Optimize details inline below the graph instead of
  covering the graph with the standard right-side drawer.

## 0.4.2

- Highlight a selected plan, its optimization attributes, connecting edges, and
  its agent, workflow, or workspace destination in relationship graphs.
- Mute unrelated graph relationships so combined Suggested and Active views
  remain understandable when several plans are visible.
- Derive displayed attributes from each plan's stated intent instead of
  populated schema defaults that made unrelated attributes appear connected.
- Expose graph selection state to assistive technology.

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
