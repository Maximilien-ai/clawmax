# Optimize

Public ClawMax plugin for planning agent, workflow, and workspace efficiency.

Optimize includes eight built-in suggestions covering monthly and per-run token
and cost budgets, workflow latency, schedule efficiency, quality-preserving
model changes, and automatic model-selection priorities.

Editable token, cost, duration, and quality targets use synchronized sliders
and exact numeric inputs. Manifest-declared limits are enforced by both the
browser and server so a plan cannot persist an out-of-range value.

Using a suggestion immediately creates an Active plan and opens its editor.
Agent and workflow suggestions can be activated before a target is chosen, so
the target and slider values can be selected together in that editor.

The relationship view connects each plan's optimization dimensions to the plan
and then to its workspace, workflow, or agent targets. Plans that still need a
target show a dashed selection placeholder. Suggested plans render as previews
with placeholder targets; Active plans render their saved relationships.
Selecting any Suggested or Active plan emphasizes only its applicable
attributes, connecting edges, and destination while muting unrelated
relationships in the combined graph. Attribute labels come from the plan's
stated goal, name, description, and tags rather than unrelated default values.

The plan editor puts AI-assisted tuning in a full-width panel above the manual
controls. It is open by default and remembers when the current browser collapses
it. A user can describe a budget, target, quality floor, duration, model
priority, or schedule, review the fields that changed, undo the draft update,
and then save. Manual controls use grouped columns on wide screens. Quality and
maximum-duration controls use directional gauges; cost and token budgets remain
neutral because lower values are not inherently better when they make a plan
infeasible.

Optimization plans are advisory. Guardrails constrain behavior and Evals
measure representative results; Optimize records the quality floor and safety
evidence that should be preserved before a recommendation is applied.

## Model Selection

Plans can recommend the same automatic model settings available on agents:

- automatic or manual model selection
- Quality, Balanced, or Cost priority
- a specific recommended model when manual review is appropriate

The current plugin records the recommendation. Applying a plan directly to
agent and workflow configuration remains separate work and must expose a clear
confirmation and history entry.
