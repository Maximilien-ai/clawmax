# Simplify + Optimize Sprint: 1.8.x

> Started: June 12, 2026
> Branch: `simplify-optimize`
> Baseline: `main` after plugin architecture MVP0 merge

## Goal

Use the remaining `1.8.x` line to:

- simplify high-friction dashboard surfaces
- improve perceived UI speed where it is low risk
- keep all changes regression-backed
- avoid mixing private plugin work into the general release track

## Release Intent

- `1.8.1`: plugin architecture host-only follow-through already merged separately
- `1.8.2`: low-risk simplification, responsiveness, and performance wins
- `1.8.3+`: deeper operational/perf cleanup only if still low risk

## Principles

- Prefer making current surfaces faster and clearer over adding new controls.
- Favor caching, fewer redundant fetches, smaller client state churn, and less layout jitter.
- Every material bug fix or optimization should add visible test coverage when practical.
- If a change is hard to validate automatically, keep it out of `1.8.2` unless the risk is tiny.

## Candidate Scope For 1.8.2

### 1. Workspace / Page Responsiveness

- [ ] Audit repeated page-load fetches on Agents, Templates, Workflows, Communications, and Skills.
- [ ] Reduce avoidable duplicate fetches during workspace switches and top-level navigation.
- [ ] Add lightweight memoized or request-local caching where repeated reads are deterministic within one page load.
- [ ] Remove remaining jitter/spinner loops on empty or low-data pages.

### 2. Notifications / Results Polish

- [ ] Continue notification grouping/deduplication.
- [ ] Reduce noisy repeated artifact/result notifications.
- [ ] Add missing bulk or inline affordances only when they reduce user effort without adding clutter.

### 3. Mobile + Narrow Layout Follow-Through

- [ ] Re-audit Templates, System & Logs, notifications, and top-bar popovers on narrow widths.
- [ ] Fix any clipped dropdowns, off-screen panels, or awkward multi-row action bars found during RC testing.

### 4. Agent / Workflow Surface Simplification

- [ ] Continue using Agents as the canonical pattern for actions, summaries, and details.
- [ ] Reduce dead weight in dense views before adding new controls.
- [ ] Tighten details-panel consistency where pages still feel custom.

### 5. Testing / Release Safety

- [ ] Keep visible suite counts increasing when behavior changes materially.
- [ ] Prefer helper/route tests for performance-sensitive logic that can regress silently.
- [ ] Re-run the full suite before cutting any `1.8.2-test-rcN`.

## Best First Bets

If time is short, start here:

1. workspace/page duplicate-fetch audit
2. empty-page/loading jitter cleanup
3. narrow/mobile overflow audit
4. notification/result dedupe follow-through

## Explicitly Out Of Scope

- private plugin features
- guardrail/eval runtime behavior
- major redesigns
- risky runtime packaging changes

