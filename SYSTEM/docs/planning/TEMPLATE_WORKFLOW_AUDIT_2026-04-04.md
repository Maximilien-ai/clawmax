# Template Workflow Audit — April 4, 2026

## Why This Audit

Templates are one of the main product differentiators and one of the first things users touch. A recurring weakness in the current proposal template set is coarse workflow structure:

- kickoff workflow asks one lead to coordinate a broad multi-agent effort
- only one downstream workflow exists
- specialist work happens implicitly inside agent chat rather than as visible workflow steps

That reduces visibility, restartability, refinement, and trust.

## Audit Summary

- Total organization templates reviewed: `53`
- Templates with only `2` workflows: `18`
- Most of those are tagged `proposal`, `experimental`, and `early-idea`
- The main issue is not missing kickoff workflows; it is missing intermediate specialist workflows between kickoff and final synthesis/output

## Completed Immediately

- `Lu.ma Event Analysis Desk` was expanded from `2` workflows to `6`:
  - `lu-ma-analysis-kickoff`
  - `lu-ma-event-patterns`
  - `lu-ma-audience-patterns`
  - `lu-ma-invite-funnel-review`
  - `lu-ma-engagement-signals`
  - `lu-ma-insight-brief`

This now exposes intermediate work in `Events`, `Attendees`, `Invites`, and `Signals` before the final organizer brief.

- `Product Research Team` was expanded from `2` workflows to `4`:
  - `product-research-kickoff`
  - `user-needs-sweep`
  - `opportunity-framing-review`
  - `product-findings-synthesis`

This now exposes explicit user-needs and opportunity-framing stages before synthesis.

- `Competitive Analysis Desk` was expanded from `2` workflows to `4`:
  - `competitive-kickoff`
  - `competitor-landscape-scan`
  - `market-size-and-segments`
  - `competitive-strategy-brief`

This now exposes separate competitor and market-size passes before final positioning synthesis.

- `Market Signal Desk` was expanded from `2` workflows to `5`:
  - `market-attention-kickoff`
  - `macro-and-sector-scan`
  - `company-catalyst-review`
  - `sentiment-signal-check`
  - `market-signal-digest`

This now exposes separate macro, company, and sentiment lanes before the final digest.

- `Blog Launch Studio` was expanded from `2` workflows to `4`:
  - `blog-launch-kickoff`
  - `positioning-and-voice-review`
  - `editorial-calendar-build`
  - `draft-pack-build`

This now exposes positioning and calendar work before draft generation.

- `AI Model Eval Lab` was expanded from `2` workflows to `4`:
  - `model-eval-kickoff`
  - `benchmark-design-review`
  - `structured-eval-run`
  - `comparison-memo`

This now exposes benchmark design and structured evaluation before final recommendation.

- `ArXiv Digest Lab` was expanded from `2` workflows to `4`:
  - `arxiv-topic-kickoff`
  - `paper-scouting-pass`
  - `paper-summary-pass`
  - `paper-digest-build`

This now exposes scouting and summary work before digest synthesis.

- `Idea To Site Studio` was expanded from `2` workflows to `4`:
  - `site-idea-kickoff`
  - `site-positioning-and-copy`
  - `site-build-pass`
  - `site-build-review`

This now exposes positioning/copy and implementation work before final ship review.

## High-Priority Decomposition Targets

These templates have multiple specialists and a clear multi-stage research/build pattern, so they should be split beyond `kickoff -> final output`.


## Medium-Priority Decomposition Targets

These would benefit from at least one extra middle step, but the risk from keeping them coarse is lower than the set above.

- `astronomy-club`
- `family-ops-hub`
- `homework-support-team`
- `household-bills-desk`
- `movie-club`
- `movie-trivia-night`

## Likely Fine As Lightweight Templates

These can stay relatively compact unless testing shows users expect deeper staging.

- `friday-night-movie-picker`
- `home-cooking-studio`
- `photography-studio`
- `trip-memory-studio`

## Full Two-Workflow Set

- `ai-model-eval-lab`
- `arxiv-digest-lab`
- `astronomy-club`
- `blog-launch-studio`
- `competitive-analysis-desk`
- `family-ops-hub`
- `friday-night-movie-picker`
- `home-cooking-studio`
- `homework-support-team`
- `household-bills-desk`
- `idea-to-site-studio`
- `lu-ma-event-analysis-desk`
- `market-signal-desk`
- `movie-club`
- `movie-trivia-night`
- `photography-studio`
- `product-research-team`
- `trip-memory-studio`

## Recommended Template Pattern

For specialist teams with 4+ agents, prefer:

1. kickoff
2. one or more specialist analysis/build workflows
3. synthesis/review
4. optional final handoff or follow-up

Good examples already exist elsewhere in the catalog:

- `real-time-research-desk`
- `conference-ops-hub`
- `technical-writing`
- `meeting-capture-follow-up`

## Next Suggested Pass

1. Reassess medium-priority lightweight templates after real-user testing
2. Return to runtime reliability issues: gateway fallback, model/provider precedence, phantom residue, and any remaining workflow-execution regressions

## Audit Notes

- This is a structure audit, not a full content-quality audit.
- A template having more workflows is not automatically better; the goal is meaningful visible stages, not workflow inflation.
- Proposal / experimental templates can remain lightweight when the user value is mostly a single decision or single artifact.
