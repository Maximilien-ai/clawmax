# Optimize

Public ClawMax plugin for planning agent, workflow, and workspace efficiency.

Optimize includes eight built-in suggestions covering monthly and per-run token
and cost budgets, workflow latency, schedule efficiency, quality-preserving
model changes, and automatic model-selection priorities.

Editable token, cost, duration, and quality targets use synchronized sliders
and exact numeric inputs. Manifest-declared limits are enforced by both the
browser and server so a plan cannot persist an out-of-range value.

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
