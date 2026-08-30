# Score Review And Action Plan

Status: active 2.0 plan
Scope: public host contracts and shared UI

## Goal

Turn a score into an explainable review that identifies weak experiments or
optimization dimensions and offers bounded actions. Scores remain advisory.
Nothing changes an agent, workflow, model, schedule, prompt, or skill assignment
without an explicit preview and confirmation.

## Shared Result Contract

Every scored run should expose:

- an overall 0-100 score, scorer version, timestamp, and confidence;
- named subscores with weight, evidence, and per-case or per-dimension results;
- the target revision and runtime/model context used by the run;
- incomplete, unavailable, and failed measurements without treating them as zero;
- ranked improvement suggestions with expected impact and supporting evidence.

Each suggestion declares an action type:

- `change-model`
- `improve-agent-description`
- `improve-workflow-description`
- `assign-skill`
- `change-schedule`
- `change-budget`
- `edit-eval`
- `review-only`

## Action Safety

Actionable suggestions must:

1. show the exact before/after diff and affected targets;
2. revalidate permissions, model availability, and the target revision;
3. require confirmation before mutation;
4. record actor, rationale, scorer evidence, and result;
5. offer undo where the underlying operation is reversible;
6. rerun or link to representative execution evidence so improvement is
   measured.

Multi-target actions require an explicit target checklist. A stale suggestion
must be recomputed instead of overwriting newer configuration.

## Evaluation Result Review

An evaluation result dialog should show:

- overall score and trend against previous runs;
- one subscore row per experiment case and rubric dimension;
- judge mode, input, expected outcome, actual evidence, tokens, cost, and latency;
- failed and incomplete cases before aggregate recommendations;
- ranked actions such as model changes, clearer agent/workflow instructions, or
  missing skills.

The contributing plugin owns its evaluator implementation, prompts, suggested
experiments, and plugin-specific recommendation rules. The public host owns the
generic result, preview, confirmation, audit, notification, and undo contracts.

## Resource Plan Health Score

An active resource plan should show a continuously refreshed health score, not
a claim that the plan itself is correct. Initial dimensions are:

- budget adherence;
- token efficiency;
- latency adherence;
- quality-floor adherence;
- schedule reliability;
- recommendation/application drift.

The score must distinguish projected from observed data, show sample size and
confidence, and remain unavailable until enough evidence exists. Selecting the
score opens dimension details and ranked plan adjustments.

## Delivery

### RC foundation

- shared score summary and detail schemas;
- read-only score dialog with subscores and evidence;
- recommendation cards with preview-only actions;
- progress, empty, insufficient-data, and stale-result states.

### Action pass

- confirmed model, description, skill, budget, and schedule changes;
- permission and revision checks;
- audit, notification, rerun, and undo.

### Release gate

- aggregate math is reproducible from displayed subscores;
- missing evidence never silently becomes zero;
- suggestions never mutate targets without confirmation;
- private evaluator logic is absent from public source and images;
- desktop/mobile score dialogs remain usable with long evidence and many cases.
