# Public Optimize Plugin 2.0

> Status: planned public plugin
> Target: `2.0.0`
> Last updated: July 20, 2026

## Product Goal

Help users understand and reduce the resources consumed by useful work, not just inspect a workspace-wide bill after it has accumulated. Optimize should organize usage around workflows and their participating agents, then recommend model, token, and schedule changes that fit within the workspace budget while preserving required capabilities and measurable quality.

This plugin is public. Its manifest, contracts, source, tests, pricing provenance, recommendation explanations, and user-facing page should ship in the public repository.

## Product Principles

1. **Tokens are the primary usage fact.** Cost is derived only when a trustworthy model/pricing mapping exists.
2. **Work is the main unit.** Show workflows first; when no workflows exist, optimize agents directly.
3. **The workspace budget is the hard ceiling.** Workflow allocations and projections must fit inside it and leave an explicit reserve for manual chats, built-in agents, and unexpected work.
4. **Model changes are workflow-scoped.** An agent may participate in multiple workflows with different cost, capability, and quality requirements. Optimize must not silently rewrite its global model.
5. **Recommendations are explainable and reversible.** Show the evidence, assumptions, expected token/cost effect, confidence, and exact changes before applying anything.
6. **Quality claims require evidence.** A cheaper compatible model is not automatically equivalent. Use public AI scoring when available and label quality as unknown otherwise.
7. **Unknown is better than false precision.** Missing usage, pricing, attribution, or schedule data must produce an explicit incomplete estimate rather than `$0.00`.

## Optimize Page

### Workspace Summary

Show a compact operational summary:

- workspace budget, spend, remaining amount, and warning state;
- total input, cached input, output, reasoning, and normalized total tokens;
- observed spend and projected spend for the active budget period;
- scheduled versus manual usage;
- allocated workflow budget and unallocated reserve;
- potential savings from currently actionable recommendations;
- data coverage and forecast confidence.

The existing Activity/Budget page remains the accounting and historical view. Optimize is the planning and action surface.

### Workflow View

Each workflow row should show:

- workflow name, enabled state, schedule, next run, and participating agents;
- recent run count, median and p95 tokens per run, and median and p95 cost per run;
- projected runs, tokens, and cost for the workspace budget period;
- current model used by each participating agent step;
- target allocation, projected over/under status, and confidence;
- recommendation count and estimated savings.

Expanding a workflow reveals its run history, per-agent contribution, model mix, token classes, outliers, and optimization plans.

### Agent Fallback View

When the workspace has no workflows, show agents with:

- calls, token classes, cost, model mix, and activity frequency;
- configured agent limit and workspace budget relationship;
- compatible model recommendations;
- a clear warning that monthly projections are less reliable without a schedule.

### Budget Control

Use a slider for fast allocation and a numeric currency input or stepper for precision. Do not rely on the slider alone.

For scheduled workflows:

- the primary control is the workflow's budget-period allocation;
- show the implied per-run target based on expected scheduled runs;
- show the equivalent token envelope for each viable model plan;
- prevent total workflow allocations plus reserve from exceeding the workspace budget.

For manual workflows:

- use a per-run target;
- do not invent a period projection without an explicit expected-run assumption;
- allow the user to provide an optional expected runs per period for planning only.

Changing a target recalculates recommendations but does not mutate workflow configuration until the user applies a plan.

## Token-First Accounting

### Normalized Usage Record

Optimize needs a durable normalized record for every attributable model call:

```ts
interface NormalizedUsageRecord {
  workspaceId: string
  workflowId?: string
  workflowExecutionId?: string
  workflowRunId?: string
  agentId: string
  stepId?: string
  provider: string
  model: string
  startedAt: string
  durationMs?: number
  usage: {
    inputTokens?: number
    cachedInputTokens?: number
    cacheWriteTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    totalTokens?: number
  }
  source: 'provider' | 'openclaw' | 'opik' | 'estimated'
  attributionConfidence: 'exact' | 'partial' | 'estimated' | 'unknown'
  pricing?: PricingSnapshot
  estimatedCostUsd?: number
}
```

Preserve raw provider usage separately when practical. Normalization must not double-count reasoning tokens already included in output totals or cached tokens already included in input totals.

### Pricing Snapshot

Cost must be reproducible after provider prices change:

```ts
interface PricingSnapshot {
  provider: string
  model: string
  currency: 'USD'
  effectiveAt: string
  sourceUrl?: string
  sourceVersion?: string
  rates: Array<{
    dimension: 'input' | 'cached_input' | 'cache_write' | 'output' | 'reasoning' | string
    usdPerMillionTokens: number
  }>
}
```

Do not assume every provider prices the same dimensions. The pricing engine should apply provider/model-specific rate dimensions. A cost is available only when:

- the provider and exact model or documented alias are known;
- required token dimensions are present or safely derivable;
- a dated pricing record covers the execution;
- the pricing calculation reports no unsupported dimension.

When cost cannot be derived, continue showing tokens and mark cost as `Unavailable`, `Partial`, or `Estimated`. Never convert unknown pricing into zero cost.

### Workflow Aggregation

Current workspace metering has aggregate workflow tokens and cost, but Optimize requires per-run and per-agent-step attribution. Aggregate normalized records into:

- median, mean, p75, p95, minimum, and maximum tokens per run;
- the same distribution for cost and duration where available;
- token and cost contribution by agent, model, and workflow step;
- scheduled versus manual runs;
- successful, failed, cancelled, retried, and partial runs;
- confidence and coverage percentage.

Use median for the normal forecast and p95 for the conservative forecast. Do not treat failed partial runs as equivalent to completed runs.

## Budget Semantics

The current workspace budget remains authoritative. The 2.0 budget contract should explicitly define its period, such as calendar month or rolling 30 days, so projections and enforcement use the same window.

Proposed workflow policy:

```ts
interface WorkflowOptimizationPolicy {
  workflowId: string
  periodAllocationUsd?: number
  perRunTargetUsd?: number
  perRunTokenTarget?: number
  expectedManualRunsPerPeriod?: number
  reservePct?: number
  mode: 'observe' | 'recommend' | 'enforce'
  agentModelOverrides: Record<string, string>
  qualityFloor?: number
  updatedAt: string
}
```

Rules:

- allocations cannot exceed the workspace budget after reserve;
- projected cost is not an enforcement fact until enough data exists;
- token ceilings remain useful even when cost cannot be calculated;
- hard enforcement should block a new workflow run or a new step before spend, not terminate an active model response mid-stream by default;
- users can choose observe-only, recommendation, or enforcement behavior;
- workspace pause/enforcement always wins over plugin policy.

## Forecasting

For a scheduled workflow:

```text
projected runs = scheduler occurrences remaining in budget period
projected tokens = selected per-run token statistic × projected runs
projected cost = sum(projected token dimensions × pricing snapshot rates)
```

Offer at least two forecasts:

- **Expected:** median completed-run usage.
- **Conservative:** p95 completed-run usage plus an explicit uncertainty margin when samples are sparse.

Confidence should reflect sample count, recency, completion ratio, attribution coverage, model consistency, pricing coverage, and schedule stability. New workflows should show a cold-start estimate derived from declared workflow participants and comparable runs, clearly labeled as estimated.

## Recommendation Engine

The initial public name-based model-fit foundation is shared with agent
creation and documented in
[Public Model Fit 2.0](PUBLIC_MODEL_FIT_2_0.md). It is advisory and does not
yet provide the sourced capability, pricing, Eval, token, or latency evidence
required for an Optimize plan. Optimize must progressively replace heuristic
signals with the measured and versioned evidence below rather than presenting
the baseline ranking as a cost or quality result.

### Candidate Filtering

Only consider models that:

- are available through a configured provider/runtime;
- are supported by the pinned OpenClaw runtime;
- meet required tool-calling, vision, structured-output, context, and modality capabilities;
- fit observed or declared context/token requirements;
- comply with workspace/provider policy and region restrictions;
- have sufficient pricing data for a cost recommendation.

### Plans

Generate three explainable plans when possible:

- **Quality first:** preserve the current quality floor with modest savings.
- **Balanced:** trade some cost for measured or explicitly unknown quality risk.
- **Lowest cost:** cheapest compatible plan that meets hard capability constraints.

Each plan includes:

- workflow-scoped model override per participating agent;
- expected and conservative tokens and cost per run;
- projected period tokens and cost;
- difference from the current baseline;
- quality score/change when public AI scoring is available;
- capability checks and excluded models with reasons;
- sample size, confidence, and pricing timestamp;
- optional schedule recommendation.

### Schedule Recommendations

Recommend schedule changes only when model changes alone cannot meet the allocation or the user explicitly asks to optimize frequency. Show the work impact plainly:

```text
Current: hourly, ~720 runs/month, projected $41.20
Suggested: every 3 hours, ~240 runs/month, projected $13.90
Impact: results may be up to 3 hours old
```

If no compatible model and reasonable schedule can satisfy the target, state that the budget must increase. Do not propose disabling necessary work as a hidden optimization.

## Applying And Reverting

Applying a recommendation must:

1. show an exact diff of workflow model overrides, budget policy, and schedule;
2. require separate confirmation for schedule changes;
3. validate that allocation remains within the workspace budget;
4. save a versioned optimization revision;
5. preserve the previous configuration for one-click undo;
6. record the actor, timestamp, assumptions, and pricing snapshot;
7. compare predicted and actual usage after future runs.

The plugin must never change a shared agent's global model merely because one workflow has a lower target.

## Public Plugin Architecture Requirements

The current MVP0 host assumes `objectKind` is `guardrail` or `eval`. That is an implementation limitation to remove, not a valid definition of a plugin. A ClawMax plugin can be anything added to the dashboard or runtime and may contribute any combination of pages, routes, data, actions, jobs, events, settings, skills, providers, documentation, or extension points.

The foundational contract is specified in [PUBLIC_PLUGIN_ARCHITECTURE_2_0.md](PUBLIC_PLUGIN_ARCHITECTURE_2_0.md). Before Optimize implementation, add support for:

- workspace-page plugins with their own navigation entry;
- plugin-owned API routes and versioned workspace data;
- declared read capabilities for metering, budgets, agents, workflows, schedules, models, and pricing;
- declared write capabilities for workflow policy and schedule updates;
- plugin migrations, health/readiness, and compatibility metadata;
- shared dashboard components for tables, filters, tabs, sliders, charts, dialogs, empty states, and mobile layout;
- audit events and notifications emitted through host contracts;
- no dependency on private guardrail or evaluation implementations.

Suggested Optimize contributions under the generic manifest:

```json
{
  "id": "clawmax.optimize",
  "slug": "optimize",
  "name": "Optimize",
  "version": "0.1.0",
  "visibility": "public",
  "permissions": [
    "metering.read",
    "budgets.read",
    "budgets.write",
    "agents.read",
    "workflows.read",
    "workflows.policy.write",
    "workflows.schedule.write",
    "models.read",
    "pricing.read"
  ],
  "contributes": {
    "navigation": [{ "id": "optimize", "label": "Optimize", "location": "plugins", "page": "optimize.workspace" }],
    "pages": [{ "id": "optimize.workspace", "module": "client/workspace-page" }],
    "api": [{ "id": "optimize.api", "module": "server/routes" }],
    "dataStores": [{ "id": "optimize.workspace", "scope": "workspace", "version": 1 }]
  }
}
```

The manifest has no product `kind` or record type. The final schema should use generic contribution and permission collections rather than adding Optimize-specific booleans or product unions to the host.

## Relationship To Public AI Scoring

Optimize and AI scoring are separate public plugins/contracts that become more valuable together:

- Optimize supplies candidate model plans and cost/token projections.
- AI scoring supplies comparable quality measurements and confidence.
- A quality floor prevents recommendations that meet budget only by producing unacceptable results.
- The combined frontier can show cost, tokens, latency, and quality without making any one score opaque.

Optimize must still function without AI scoring. In that state, it can enforce capabilities and calculate resource savings, but it must label comparative quality as unknown.

## Privacy And Security

- Resource optimization should not require storing prompt or response content.
- Usage records contain identifiers and counts; apply the same workspace/user scoping as metering.
- Never expose provider keys to the plugin UI or recommendation engine.
- Pricing refresh uses public provider metadata or operator-approved registries.
- Treat model/provider names and workflow schedules as workspace-sensitive operational metadata.
- Every applied recommendation and revert is audited.
- Prompt content cannot alter budgets, model policies, schedules, or confirmation requirements.

## API Direction

Potential public host/plugin contracts:

- `GET /api/plugins/optimize/summary`
- `GET /api/plugins/optimize/workflows`
- `GET /api/plugins/optimize/workflows/:id/runs`
- `PUT /api/plugins/optimize/workflows/:id/policy`
- `POST /api/plugins/optimize/workflows/:id/recommendations`
- `POST /api/plugins/optimize/workflows/:id/apply`
- `POST /api/plugins/optimize/revisions/:id/revert`
- `GET /api/plugins/optimize/pricing/status`

Recommendation responses must include inputs, assumptions, excluded candidates, confidence, pricing provenance, and an apply-time revision precondition so stale recommendations cannot overwrite newer workflow changes.

## Test Plan

### Token And Pricing

- normalize provider/OpenClaw/Opik token shapes without double counting;
- preserve input, cached input, cache write, output, and reasoning dimensions;
- derive known costs from versioned pricing fixtures;
- return unavailable/partial for unknown model prices rather than zero;
- retain historical calculation after pricing changes;
- cover aliases, provider gateways, local models, and custom endpoints.

### Attribution And Forecasting

- isolate workspaces, users, workflows, runs, agents, and steps;
- distinguish scheduled/manual, success/failure/retry, and partial runs;
- verify median and p95 forecasts and sparse-data confidence;
- calculate scheduler occurrences across DST, month boundaries, pauses, and disabled workflows;
- prevent retries from becoming separate successful workflow runs.

### Recommendations

- exclude incompatible modalities, context windows, tools, and unavailable providers;
- never offer models unsupported by the pinned runtime;
- enforce workspace allocation plus reserve;
- keep workflow overrides from mutating global agent models;
- recommend schedule changes only under the documented conditions;
- report `increase budget` when no viable plan exists;
- integrate quality floors when scoring is installed and degrade honestly when it is absent.

### Apply, Audit, And UI

- reject stale recommendation revisions;
- separately confirm schedule updates;
- apply and revert exact configuration diffs;
- audit actor, assumptions, prices, and results;
- test slider keyboard access plus precise numeric entry;
- verify desktop and mobile layouts with long workflow/model names and unknown values;
- provide useful empty, cold-start, unavailable-metering, and unavailable-pricing states.

### Local And Container Validation

- run with Opik enabled and disabled;
- run with mixed OpenAI, Anthropic, Gemini, OpenRouter, xAI, Ollama, and OpenAI-compatible models;
- compare projected versus actual tokens/cost for a controlled workflow fixture;
- restart and verify policies, revisions, and pricing snapshots persist;
- verify cloud/on-prem scoping and no key leakage in logs or plugin payloads.

## Delivery Plan

### Phase 0: Generic Plugin Contracts

- remove the host's plugin-kind assumption and add generic contribution, navigation, permission, route, data, migration, lifecycle, and audit contracts;
- keep the public host independent from private plugins;
- add a dormant public workspace-page fixture and contract tests.

### Phase 1: Observe

- normalized token ledger and pricing snapshots;
- workspace and workflow token/cost summary;
- per-run and per-agent-step distributions;
- read-only expected/conservative forecasts and data confidence;
- agent fallback view.

### Phase 2: Recommend

- workflow budget allocations and token targets;
- compatible model filtering;
- quality-first, balanced, and lowest-cost plans;
- schedule suggestions and `increase budget` outcomes;
- no automatic mutation.

### Phase 3: Apply

- workflow-scoped agent model overrides;
- confirmed schedule changes;
- observe/recommend/enforce policy modes;
- versioned revisions, stale-write protection, audit, and undo.

### Phase 4: Learn

- predicted-versus-actual calibration;
- outlier and drift detection;
- quality-aware optimization using public AI scoring;
- recommendation confidence improvements without opaque autonomous changes.

### Active Plan Health Score

Active plans expose a 0-100 health score only when sufficient observed data is
available. It combines budget adherence, token efficiency, latency, quality
floor, schedule reliability, and configuration drift. The UI must distinguish
projected and observed values, show sample size and confidence, and open the
shared score-review surface described in
[PUBLIC_SCORE_ACTIONS_2_0.md](PUBLIC_SCORE_ACTIONS_2_0.md). A high score means the
plan is meeting its declared objectives; it is not a general quality or safety
certification.

## 2.0 Release Gate

- token totals reconcile against controlled provider fixtures;
- unknown pricing never appears as zero cost;
- workspace allocation and reserve constraints cannot be bypassed;
- shared agent global models remain unchanged by workflow optimization;
- every applied change has preview, audit, and undo;
- schedule changes require separate confirmation;
- recommendations expose pricing provenance, assumptions, exclusions, and confidence;
- the page is usable with no workflows, no traces, no pricing, and no AI-scoring plugin;
- local and containerized workflow runs validate predicted and actual attribution;
- plugin source, manifest, migrations, tests, and documentation are public.

## Open Decisions

- Calendar month versus rolling 30-day workspace budget periods.
- Default reserve percentage for manual work and built-in agents.
- Whether the first 2.0 release includes enforcement or stops at recommend/apply.
- Minimum completed-run sample size before showing a non-cold-start forecast.
- Pricing data ownership, update cadence, signing/provenance, and offline behavior.
- How local and custom endpoint models declare capability and operator-defined price.
- Whether workflow token targets are hard ceilings or warning targets in the first release.
