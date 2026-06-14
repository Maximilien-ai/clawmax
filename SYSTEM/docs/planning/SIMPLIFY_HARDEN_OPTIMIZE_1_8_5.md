# Simplify + Harden + Optimize Sprint: 1.8.5

> Started: June 14, 2026
> Branch: `simplify-harden-optimize`
> Baseline: `main` after `v1.8.4`
> Status: completed and merged for `1.8.5`; remaining follow-through moved back to [BACKLOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/BACKLOG.md)

## Goal

Use the next short `1.8.x` release to keep improving perceived quality without widening product scope:

- remove a few remaining confusing/error-prone UX paths
- make file/link/result handling more reliable
- improve operator-facing error explanations
- keep changes low risk, regression-backed, and releasable within a day

## Best Bets For A 2-Hour Morning

These are the highest-value `1.8.5` candidates given current backlog and recent user reports:

1. **Provider cooldown/auth surfacing**
   - make timeout cooldowns read as transient/retryable
   - make auth/key failures read as configuration issues
   - reduce raw fallback-chain noise in agent/workflow surfaces

2. **Bare filename DocHub resolution**
   - resolve chat/status references like `show.pdf` to a unique workspace path when possible
   - suppress broken links when resolution is ambiguous

3. **Notification/result polish**
   - continue reducing confusing repeated or low-signal notifications
   - tighten channel/file/action deep links where source context already exists

4. **Page responsiveness follow-through**
   - continue trimming low-risk duplicate loads or empty-state jitter on top-level pages
   - prefer helper-level logic + surfaced tests instead of broad refactors

## 1.8.5 Candidate Scope

### Section 1: Error Explanation Hardening

- [x] Improve provider timeout/cooldown messaging in chat/workflow-facing UI.
- [x] Improve provider auth/key failure messaging so users see “invalid/missing credentials” instead of raw fallback chains.
- [x] Keep these explanations generic and operator-safe; do not hide real root cause.

Regression target:

- add or extend visible helper tests for fallback/error explanation mapping

### Section 2: DocHub File Resolution Hardening

- [x] Resolve bare filenames to unique workspace-relative DocHub paths when there is one clear match.
- [x] Keep exact `AGENTS/...`, `GROUPS/...`, `WORKFLOWS/...`, `SYSTEM/...` paths authoritative.
- [x] If multiple matches exist, do not create a misleading link.

Regression target:

- add visible helper tests for exact path, unique filename match, and ambiguous filename suppression

### Section 3: Notification / Result Cleanup

- [x] Continue reducing repeated low-signal notifications where the same event is emitted multiple times.
- [x] Tighten file/channel/result links if enough context already exists.
- [x] Keep the notification center behavior aligned with existing successful fixes from `1.8.2`.

Regression target:

- extend visible notification presentation/link tests when behavior changes

### Section 4: Low-Risk Responsiveness

- [x] Audit one more top-level page or panel for obvious duplicate fetches or jitter.
- [x] Prefer request-local dedupe or short cooldown guards over architectural rewrites.
- [x] Only include if clearly low risk after Sections 1-3.

Regression target:

- helper/unit test, not a large integration rewrite

## Explicitly Out Of Scope For 1.8.5

- private plugin behavior
- guardrails/evals MVP1 runtime work
- large template/apply refactors
- Docker/OpenClaw packaging redesign
- broad UI redesigns

## Likely Release Order

If time stays short, do the work in this order:

1. provider cooldown/auth surfacing
2. bare filename DocHub resolution
3. notification/result polish
4. optional extra responsiveness cleanup

## Release Rule

`1.8.5-test-rc1` was cut after:

- focused tests pass
- full `SYSTEM/test-with-server.sh integration --with-validation` passes
- visible test count increases if behavior materially changed
