# Simplify + Harden + Optimize Sprint: 1.8.8

> Started: June 16, 2026
> Branch: `main` until the `1.8.8` working branch is cut
> Baseline: `v1.8.7`

## Goal

Use `1.8.8` to close the remaining high-signal edge cases from the `1.8.5` through `1.8.7` hardening line without opening new feature scope:

- audit templates/workflows for unnecessary default requirements, conservative parallelism opportunities, and group-chat participation gaps
- sync polished public-facing template/workflow changes back to the public registries where appropriate
- finish the remaining file-open ambiguity cases
- normalize the last raw provider/runtime failure surfaces
- turn notification dedupe into clearer grouped summaries
- harden workflow restart/rerun edge cases further
- complete the model lifecycle audit across all relevant selectors/defaults

## Scope

### Section 1: Template / Workflow Audit

- [ ] audit built-in/public-bound templates and workflows for unnecessary default requirements or over-specified assumptions
- [ ] identify workflows that can safely run more in parallel because their DAG dependencies are looser than the current content implies
- [ ] verify all workflow participants are included in the intended community/group chat surfaces
- [ ] capture a public-sync candidate list for `Maximilien-ai/templates` and `Maximilien-ai/workflows`

### Section 2: File-Open Closure

- [ ] audit every remaining visible file chip / file-open surface:
  - chat
  - group chat
  - notifications
  - activity
  - workflow results
  - agent detail
  - organization/workspace outputs
- [ ] ensure opens only happen when the target resolves uniquely
- [ ] degrade safely when a path is ambiguous, missing, or lacks enough context

### Section 3: Provider Error Normalization

- [ ] remove remaining raw fallback-chain noise from user-visible surfaces
- [ ] standardize wording for:
  - auth / missing key
  - quota / rate limit
  - transient cooldown / timeout
  - config / unsupported model
  - session takeover / concurrency
- [ ] keep wording consistent across chat, workflow results, rerun/restart, and notification summaries where applicable

### Section 4: Notification Grouping

- [ ] improve grouping beyond simple dedupe for:
  - same file updated by many agents
  - same channel burst
  - same workflow/run progress burst
- [ ] tighten grouped labels so the summary is readable without opening each event

### Section 5: Workflow Restart Hardening

- [ ] audit restart/rerun edge cases around:
  - session takeover
  - stale run/session files
  - overlapping reruns
  - partial output residue
- [ ] add explicit regressions for real restart/rerun failures observed in cloud/on-prem

### Section 6: Model Lifecycle Completion

- [ ] audit every selector/defaulting path:
  - Add Agent
  - BYOK
  - Edit Agent Config
  - Apply Agent Template
  - Apply Org Template
  - any workflow-related model override UI that still exists
- [ ] verify deprecated first-party OpenAI, Anthropic, and Gemini models warn/filter correctly
- [ ] verify current saved deprecated selections remain visible and migratable
- [ ] verify `openai-compatible/*` never inherits first-party OpenAI lifecycle filtering

### Section 7: Optional Workspace / Mobile Polish

- [ ] if time remains, close one more low-risk stale-state or duplicate-fetch issue
- [ ] if time remains, audit small-screen overflow for popovers, sheets, confirm modals, and detail panels touched by the work above

## Testing Rule

- [ ] every section must add or extend visible regression coverage
- [ ] no behavior change should land without a focused helper/route/client test where practical
- [ ] template/workflow content changes should add or update validation/smoke coverage where practical
- [ ] full `SYSTEM/test-with-server.sh integration --with-validation` must pass before cutting `1.8.8-test-rc1`

## Release Rule

Do not cut `1.8.8-test-rc1` unless:

- focused tests are green
- full integration validation is green
- cloud/on-prem manual checks confirm the remaining hardening edge cases are actually closed
- the work still reads as closure for the `1.8.x` line, not a new feature family
