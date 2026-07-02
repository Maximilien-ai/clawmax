# Simplify / Harden / Optimize 1.9.6

> Status: planned
> Owner: Dashboard / Builder / Runtime follow-through
> Last updated: July 1, 2026

## Goal

Use `1.9.6` for the next deliberate OpenClaw update and fold in the builder/template-generation consistency work that needs a real before/after runtime comparison.

`1.9.5` should establish the performance baseline first. Then `1.9.6` can answer two questions at the same time:

1. Does the newer OpenClaw improve or regress chat/workflow responsiveness?
2. Does the newer runtime or surrounding builder logic change how company/team templates are generated and handed off?

## Scope

### 1. OpenClaw update with measured before/after comparison

- Upgrade the shipped OpenClaw baseline only after `1.9.5` records stable timing artifacts.
- Compare at least:
  - direct agent chat round-trip
  - workflow first-load / readiness
  - workflow kickoff to first visible progress
- Do not rely on anecdotal impressions alone; use the `1.9.5` perf artifacts as the source of truth.

### 2. Builder output consistency for ambiguous prompts

- Investigate real builder/generation inconsistency reported during the `1.9.4` demo:
  - same prompt producing materially different results
  - one output landing as a team-style sequential workflow set
  - another output landing as a company template with different workflows
  - handoff failing in at least one generated result
- Reported prompt/result family:
  - template name: `AI-Driven Inbound Sales & Support Management`
  - source workspace: user reported it lives in the `1.9.x` workspace
- Confirmed visual evidence from July 1, 2026:
  - the saved artifact is shown in the dashboard as a `Company Template`
  - version: `1.0.0`
  - workspace shown in the UI: `test 1.9.x`
  - visible agent count: `4`
  - visible tags include: `sales`, `customer support`, `AI`, `automation`, `ads`, `company`, `revenue`
- Important current limitation:
  - the `1.9.x` workspace and this exact generated template were **not** present in the local repo checkout on July 1, 2026
  - `WORKSPACES` in this checkout currently only contains `default`
  - follow-up work must pull the real generated template payload(s) or exported markdown/json from the demo/runtime environment before changing builder logic

### 3. Team/company option clarity

- For prompts that plausibly map to either a company template or a team workflow/template, bias toward presenting both options instead of silently picking one mode.
- Preferred product behavior:
  - when the builder thinks a team template may really want company structure, offer both outputs to the user
  - let the user explicitly choose team vs. company when the prompt is ambiguous enough to support both
- Review whether this belongs in:
  - builder routing/classification
  - recommendation UI
  - post-generation confirmation/refinement flow

### 4. Generated workflow handoff correctness

- Verify that generated team workflows and generated company workflows both preserve correct handoff behavior.
- Important distinction from demo behavior:
  - team workflows often still appear to work because they are effectively one sequential chain with occasional parallel branches inside the same local progression
  - company workflows are more fragile because they are composed of multiple workflow collections / lines / pipelines that depend on explicit handoff from one workflow into the next
  - if any workflow in that company-level chain does not reach the correct completion/handoff state, downstream progress stops entirely
- Explicitly test:
  - sequential handoff chains
  - cross-team/company workflow transitions
  - terminal handoff / final workflow completion behavior
  - company-level handoff between separate workflow collections, not just within one local sequential branch
- Specific demo symptom to track:
  - in at least one generated result, the last workflow never kicked off because the upstream workflow never reached a state that allowed the handoff/completion transition
- Desired behavior:
  - if a generated company template creates two lines/pipelines/workflow branches, downstream handoff should complete reliably so the next workflow actually starts
  - every workflow that is expected to unlock a downstream workflow must perform that handoff deterministically; a “completed enough” visual state is not sufficient if the next workflow never starts

### 5. Visual handoff representation

- Add a clear visual representation of workflow-to-workflow handoff for generated company/team templates.
- Today we can infer workflow order, but we do not have a useful cross-workflow handoff view when company templates create multiple lines or branches.
- The goal is to make it obvious:
  - which workflow is expected to unlock which downstream workflow
  - whether the downstream workflow is waiting, ready, blocked, or never triggered
  - where a company-level graph stalled
- This does not need to become a giant new workflow feature; it needs to be good enough for debugging generated template progression and validating builder output quality.

## Required evidence

Before coding the consistency fix, gather:

- the real generated template artifact(s) for `AI-Driven Inbound Sales & Support Management`
- the original builder prompt used during the demo
- both materially different generation outputs if they still exist
- whether the outputs came from the same model/provider and same builder version
- whether the difference is:
  - classification/routing
  - generation nondeterminism
  - post-processing/defaulting
  - runtime/OpenClaw behavior

## Testing expectations

- Add regression coverage tied to the real example, not a purely synthetic stand-in.
- Keep `1.9.6` validation split into:
  - perf comparison before/after the OpenClaw upgrade
  - builder consistency regression tests
  - generated workflow handoff regression tests
  - visual verification that generated handoff structure is inspectable in the product

## Out of scope

- Do not pull this builder consistency work into `1.9.4`.
- Do not dilute `1.9.5` with broad product changes beyond performance measurement.
- Do not change builder defaults based only on one anecdote without preserving the real artifacts that triggered the investigation.
