# Public Model Fit 2.0

> Status: active public foundation
> Target: `2.0.0`
> Last updated: July 28, 2026

## Goal

Recommend the best currently available model for an agent or workflow without
pretending that a model name proves quality, capability, latency, or price.
The same public engine should support agent creation, Evals, Optimize, and
future plugins through domain-neutral host contracts.

Model fit is separate from:

- prompt readiness, which measures whether a creation prompt is sufficiently
  specific;
- artifact quality, which scores generated or saved content against evidence;
- Evals, which measure representative executions;
- Optimize, which combines measured quality with tokens, price, schedule, and
  budget.

## RC Foundation

The first public implementation:

- extracts likely needs such as coding, reasoning, tools, structured output,
  vision, long context, and local/private execution from an agent description;
- ranks only model IDs reported by the current runtime;
- returns alternatives, reasons, caveats, and low or medium confidence;
- labels the result as a name-based advisory estimate;
- never silently applies a model change;
- exposes the recommendation during AI agent creation and through a reusable
  server endpoint.

RC16 extends that foundation by:

- exposing Quality, Balanced, and Cost priorities during agent creation;
- automatically refreshing suggestions from an existing agent's current
  identity, behavior, and tool instructions;
- presenting the same reasons, alternatives, caveats, and confidence in a
  shared responsive panel;
- requiring the user to select a suggestion and then save before an existing
  agent model changes.

RC17 completes the interactive agent foundation by:

- letting users collapse the suggested-model explanation while retaining the
  top model and confidence in a compact row;
- remembering the disclosure and Auto-selection preferences across Add Agent
  and Edit Agent views in the same browser;
- making Auto-selection explicitly opt-in and tracking the current top
  recommendation as instructions or Quality/Balanced/Cost priority changes;
- preserving and restoring the last manual model when Auto-selection is
  disabled; and
- persisting one concrete runtime-supported model only when the user chooses
  Save or Create. `auto` is never written as an abstract agent model ID.

This baseline intentionally does not claim current pricing, context limits,
vision support, tool support, or measured quality when the runtime catalog does
not provide that metadata.

## Required Catalog Contract

The next model catalog needs versioned, sourced metadata:

```ts
interface ModelCapabilityRecord {
  provider: string
  model: string
  runtimeSupported: boolean
  modalities?: Array<'text' | 'image' | 'audio' | 'video'>
  toolUse?: 'supported' | 'unsupported' | 'unknown'
  structuredOutput?: 'supported' | 'unsupported' | 'unknown'
  contextTokens?: number
  outputTokens?: number
  deployment?: 'hosted' | 'local' | 'gateway'
  regionPolicy?: string[]
  source?: string
  observedAt: string
}
```

Unknown fields remain unknown. Provider marketing labels and model-name
heuristics must not become hard capability facts.

## Recommendation Contract

Recommendations should accept:

- the target description and representative tasks;
- runtime-visible models and workspace policy;
- hard requirements and soft preferences;
- quality, cost, and latency priorities;
- observed Eval results when available;
- token distributions and dated prices when available.

They should return:

- ranked compatible candidates;
- excluded candidates with explicit reasons;
- hard requirements satisfied, failed, or unknown;
- evidence sources and their timestamps;
- predicted quality, token, cost, and latency only when supported by data;
- confidence and missing evidence;
- an exact, confirmable change rather than an automatic mutation.

## Evals Integration

Evals should turn a recommendation into a comparison plan:

1. select representative inputs and acceptance criteria;
2. execute the current model and candidate models under the same conditions;
3. record output quality, failures, tool behavior, tokens, latency, and cost;
4. highlight statistically weak or incomplete evidence;
5. allow the user to approve a model only after reviewing the comparison.

An Eval result can raise recommendation confidence. A model name alone cannot.

## Optimize Integration

Optimize should combine model compatibility and Eval evidence with:

- per-run and budget-period token distributions;
- dated pricing snapshots;
- workflow schedules and expected run counts;
- workspace allocation and reserve;
- workflow-scoped model overrides;
- preview, confirmation, audit, and undo.

The cheapest candidate is not automatically the recommended candidate. When no
compatible model satisfies the quality floor and budget, Optimize must say that
the budget, work, or schedule assumption needs to change.

## Remaining Work

- add sourced capability and pricing catalogs with cache/version semantics;
- support explicit hard requirements in agent and workflow configuration;
- add workflow-level quality, balanced, and cost preference controls;
- include excluded models and missing-evidence details in the UI;
- integrate representative Eval execution and measured model comparisons;
- integrate token/cost/latency evidence into Optimize;
- add workflow participant and step-level recommendations;
- persist approved recommendations, actor, evidence, and reversible changes;
- calibrate ranking against an approved corpus without collecting raw prompts
  by default;
- validate local, hosted, gateway, cloud, and on-prem behavior.

## Release Gate

- only configured, runtime-supported models can be recommended;
- required unknown capabilities are visible and never reported as satisfied;
- recommendations include alternatives, evidence, caveats, and confidence;
- no model changes occur without confirmation;
- shared agent models are not mutated for one workflow optimization;
- representative Evals can compare candidates before application;
- token and cost claims reconcile to observed usage and dated pricing;
- desktop and mobile UI remains usable with long provider/model names.
