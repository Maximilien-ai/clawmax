# Prompt Readiness Scoring

> Status: public RC15 baseline for ClawMax 2.0

ClawMax shows a live readiness score while a user writes an AI creation
prompt. The first release covers Builder, agents, skills, templates, workflows,
plugins, and the shared AI Editor.

## What The Score Means

The score estimates whether the prompt contains enough concrete information to
generate a useful first draft. It does not claim that the generated artifact is
correct, safe, or high quality.

- `0-39`: Starting point
- `40-59`: Needs detail
- `60-79`: Promising
- `80-89`: Ready
- `90-100`: Excellent

Generation remains available below 80. The score is guidance, not a gate.

## Baseline Rubric

Every prompt is checked for:

- a concrete goal;
- relevant users or operating context;
- named inputs or source material;
- an output and its format;
- constraints, timing, safety, or approval requirements;
- measurable success criteria;
- details specific to the artifact being created.

Artifact-specific checks cover agent roles and tools, skill usage and failure
behavior, template roles and handoffs, workflow triggers and dependencies,
Builder create-or-reuse intent, and plugin targets and visible results.

The scorer is deterministic, local, and immediate. It does not make an
additional model request, consume tokens, or add cost as the user types.

## Feedback And Privacy

The shared AI Editor lets the user mark scoring guidance Helpful or Not
helpful. RC15 stores only this metadata in the browser:

- artifact domain;
- numeric score;
- suggestion identifiers;
- rating;
- timestamp.

The prompt text is not included in scoring feedback. Feedback storage failure
must never block creation.

## Follow-Up Before 2.0

- Add a public generated-artifact scoring contract that is separate from
  prompt readiness.
- Keep model-fit recommendations separate from prompt and artifact scores.
  Model fit must use runtime availability, capability evidence, representative
  Evals, tokens, pricing, and latency as those inputs become available.
- Score saved artifacts against domain rubrics and expose evidence for each
  score.
- Add explicit opt-in aggregation for feedback used to calibrate rules.
- Add thumbs up/down for generated artifacts with clear data-use disclosure.
- Build a versioned calibration corpus from approved, redacted examples.
- Measure whether suggestions improve completion and artifact quality without
  rewarding prompt length alone.
- Make scoring available to public plugins through domain-neutral host
  contracts.
- Keep scoring useful without requiring Optimize, guardrail, evaluation, or
  any other particular plugin.

The active model recommendation plan is documented in
[Public Model Fit 2.0](../planning/PUBLIC_MODEL_FIT_2_0.md).

## Tests

RC15 includes unit coverage for score thresholds, domain rules, feedback
privacy, every integrated AI creation surface, mobile-safe dialogs, and the
release Review checklist. Manual checks live in Review under
`2.0.0-test-rc15`. Explainable agent model suggestions and their separate
Quality, Balanced, and Cost priorities are introduced in
`2.0.0-test-rc16`.
