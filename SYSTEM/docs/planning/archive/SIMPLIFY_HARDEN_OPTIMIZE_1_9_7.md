# Simplify / Harden / Optimize 1.9.7

> Status: planned
> Owner: Dashboard / Builder / Template generation follow-through
> Last updated: July 6, 2026

## Goal

Use `1.9.7` as the release that turns the current Builder / AI Generate quality concerns into a reliable, testable product surface before the bigger `2.0.0` push.

`1.9.6` is the runtime/OpenClaw validation line.

`1.9.7` should be the generation-quality and handoff-correctness line.

The release should answer:

1. Can Builder and AI Generate produce more consistent company/team outcomes for the same prompt?
2. Can generated workflows and company handoffs be trusted to complete and visibly unblock downstream work?
3. Can the product expose enough quality signals now that `2.0.0` scoring/evaluation/control work lands on a cleaner base instead of on top of known generation ambiguity?

## Scope

### 1. Builder output consistency for ambiguous prompts

- Investigate and tighten cases where the same prompt can land as:
  - a team template
  - a company template
  - a mostly sequential workflow chain wrapped in a company shell
- Use the known example family as the anchor:
  - `AI-Driven Inbound Sales & Support Management`
- Pull the real prompt and real generated artifacts into the test/dev workspace before changing logic.
- Preserve both useful paths when the prompt is genuinely ambiguous, but stop silently drifting between materially different structures without telling the user.

Desired behavior:

- when the prompt clearly implies one agent, route there
- when the prompt clearly implies a team, route there
- when the prompt plausibly implies either team or company, surface both as an explicit choice
- when the prompt is weak, say so rather than pretending confidence

### 2. Team vs company option clarity in Builder and AI Generate

- Make the structure choice visible earlier in the flow.
- Avoid hidden conversion from "team-ish" prompt into "company template" artifact unless the product can justify it clearly.
- Review where this belongs:
  - Builder recommendation UI
  - AI Generate preflight
  - post-generation refine path

Desired behavior:

- user understands whether they are generating:
  - one agent
  - a team
  - a company / team-of-teams
- user can change that choice without restarting from scratch

### 3. Generated workflow handoff correctness

- Verify that generated workflows do not stop at "looks done enough."
- Tighten completion/handoff semantics so downstream generated workflows actually start when they should.
- Explicitly cover:
  - sequential workflow chains
  - cross-team handoffs
  - company-level multi-workflow handoff
  - terminal completion behavior

Desired behavior:

- if a generated artifact implies downstream work, that handoff should happen deterministically
- if a handoff is blocked, the product should show exactly where and why

### 4. Visual handoff inspectability

- Add a practical visual representation of generated workflow-to-workflow handoff state.
- This does not need to become a full orchestration redesign.
- It does need to make debugging generated progression possible.

The user should be able to tell:

- which workflow is upstream
- which workflow is waiting
- whether the next workflow is:
  - waiting
  - ready
  - blocked
  - never triggered

### 5. Builder and AI Generate quality scaffolding

This is the only `2.0`-adjacent work I would deliberately allow into `1.9.7`.

### 6. Builder mention and routing shortcuts

- Let Builder recognize `@` mentions and offer matching agents from the current workspace.
- Use this both as a direct-message shortcut and as a way to ground prompts against existing agents without forcing the user to type exact ids.
- Keep the first pass lightweight:
  - Builder prompt autocomplete only
  - no cross-surface mention protocol yet
  - no automatic send/action on mention selection

Not the full user-facing score.

Only the shared groundwork that makes `2.0.0` simpler and less risky:

- shared quality-signal response shape
- shared prompt-analysis primitives
- shared artifact-completeness primitives
- shared terminology for:
  - prompt weakness
  - missing context
  - missing deliverables
  - missing handoffs
  - missing validation/test steps

Do not ship the full `2.0.0` scoring story in `1.9.7`.

Do ship the parts that reduce rework later.

### 6. Regression corpus for real generated artifacts

- Stop relying only on synthetic builder prompts.
- Save a small real-artifact regression set for:
  - team/company ambiguity
  - weak prompt under-generation
  - handoff failure
  - overly generic company shells
- Keep the corpus small but real.

## What `1.9.7` should not become

Do not let this release become:

- the full Evaluation tab launch
- the full `God Rails` launch
- a giant policy engine
- a major workflow engine rewrite
- a broad `2.0` feature dump under a minor version

`1.9.7` should be a stabilization-and-clarity bridge to `2.0.0`, not a disguised major release.

## Suggested Deliverables

### Must ship

- Builder/team/company ambiguity tightened
- explicit structure choice when prompts are ambiguous
- generated handoff correctness fixes for known failure modes
- practical handoff inspectability in the UI
- regression coverage tied to real generated artifacts

### Should ship if stable

- shared quality-signal primitives reused by Builder and AI Generate
- weak-prompt diagnostics in internal/server responses
- clearer "why this route" explanation in Builder

### Nice to have

- first pass of a prompt-strength hint in Builder without full public scoring
- export/debug artifact for generated handoff graph

## Implementation Order

### Phase 1: evidence and repro

- gather the real prompt and generated artifacts
- classify the failure modes:
  - routing ambiguity
  - generation nondeterminism
  - weak prompt
  - handoff bug
  - post-processing/defaulting bug

### Phase 2: routing and structure choice

- tighten Builder and AI Generate structure selection
- surface explicit team/company choice when needed

### Phase 3: handoff correctness

- fix generated workflow progression failures
- add focused regression tests

### Phase 4: inspectability

- add visual/status handoff debugging surface

### Phase 5: shared quality scaffolding

- add reusable prompt/artifact quality primitives for later `2.0.0` scoring

## Testing Expectations

- tie the release to a small real-artifact regression corpus
- add coverage for:
  - ambiguous team/company routing
  - generated handoff progression
  - stalled downstream workflow visibility
  - weak prompt detection primitives where implemented
- validate manually with at least:
  - one single-agent generation
  - one team template generation
  - one company/team-of-teams generation
  - one known ambiguous prompt family

## Why this release order makes sense

If `1.9.6` lands the runtime update cleanly, the next highest-value work is not another runtime move.

It is making generation output more trustworthy.

That also sets up `2.0.0` better:

- Evaluation has better artifacts to judge
- `God Rails` has clearer generated structures to attach to
- scoring has a cleaner quality model to build on

## Recommendation

Assuming `1.9.6` RC3 validates cleanly, `1.9.7` should be:

- Builder consistency
- generation quality
- workflow handoff correctness
- handoff inspectability
- minimal quality groundwork for `2.0.0`

That is a coherent minor release and a strong bridge into the major release.
