# Simplify + Harden + Optimize Sprint: 1.9.1

> Started: June 23, 2026
> Baseline: `v1.9.0`

## Goal

Use `1.9.1` for the next cleanup slice after the `1.9.0` stabilization release.

- backfill tests aggressively so the `1.9.x` line has a stronger safety net before the planned OpenClaw update in `1.9.4`
- finish the remaining operator-facing diagnostics cleanup so auth, network, cooldown, and runtime/config problems read clearly everywhere
- continue the public template/workflow audit and prepare or complete selective sync for `Maximilien-ai/templates` and `Maximilien-ai/workflows`
- close any remaining low-context DocHub/file-open edge cases that surface after `1.9.0`
- keep workflow/thread consistency tightening scoped to real follow-up gaps rather than opening new feature families
- defer documentation-only issues and `v2.0.0` planning/docs work to the later `1.9.5` / `2.0` prep window instead of spending `1.9.1` on them

## Scope

### Section 0: Test Backfill and Coverage Measurement

- [ ] measure which areas are already well covered vs. thinly covered
- [ ] maintain a lightweight inventory snapshot at [TEST_INVENTORY_1_9_1.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/testing/TEST_INVENTORY_1_9_1.md)
- [ ] treat wrapper-count growth as a means to broader safety, not the goal by itself
- [ ] require every new counted lane to map to a real area in the inventory/gap view
- [ ] identify the weakest-tested high-risk surfaces first:
  - workflow execution and workflow result handling
  - notification resolution and presentation
  - DocHub/file-open navigation
  - workspace switching and stale-state cleanup
  - Builder / Add Agent provisioning and metadata persistence
  - partner/runtime diagnostics and recovery flows
- [ ] add explicit regression coverage before or alongside remaining `1.9.1` fixes
- [ ] improve the test inventory/readability so we can see what is covered without manually scanning `SYSTEM/test.sh`
- [ ] use `1.9.1` as the stabilization release before the planned OpenClaw update track around `1.9.4`

### Section 0A: Count and RC Targets

- [ ] current visible wrapper baseline: `355`
- [ ] near-term target: reach `400` before treating `1.9.1` as a promotion candidate
- [ ] prefer batches of `5-10` counted lanes at a time so each wrapper rerun meaningfully moves the baseline
- [ ] be more aggressive before image verification:
  - continue adding multiple coverage-directed batches before cutting the next image
  - avoid stopping for image verification after only a tiny count increase
- [ ] planned validation cadence:
  - `1.9.1-test-rc2` after the next substantial jump, roughly `370-380`
  - `1.9.1-test-rc3` after another coverage-directed batch, roughly `390+`
  - promotion only when the suite is near `400`, RC images are stable, and no real regressions are surfacing

### Section 0B: Coverage-Directed Rules

- [ ] prefer batches that move a whole area, not just one isolated helper:
  - `skills-plugins`
  - `workspace-state`
  - `docs-navigation`
  - `notifications`
  - `workflows`
  - `agents-provisioning`
- [ ] after each batch, update the mental or written gap view:
  - which area gained coverage
  - which high-risk area is still thin
  - whether the next batch should stay in the same area or switch
- [ ] use cheap helper lanes where they improve real area coverage, but do not add lanes that are detached from the inventory
- [ ] bias later `1.9.1` batches toward thinner, higher-risk areas once the easy helper wins are mostly exhausted

### Section 1: Operator Diagnostics Cleanup

- [ ] audit the remaining user-visible diagnostics surfaces after `1.9.0`
- [ ] reduce any remaining raw fallback/runtime noise in workflow results, activity, logs, and operator recovery flows
- [ ] keep guidance action-oriented:
  - auth / invalid key
  - missing key
  - quota / rate limit
  - cooldown / timeout
  - runtime mismatch / unsupported model
  - local host-agent / reconnect issues

### Section 2: Template / Workflow Public Sync

- [ ] continue the audit here first
- [ ] build an explicit selective sync list for:
  - `Maximilien-ai/templates`
  - `Maximilien-ai/workflows`
- [ ] sync only reviewed public-facing fixes
- [ ] avoid bulk copy-over into dirty or experimental public repo state
- [ ] continue the template audit for lane/subdirectory assumptions:
  - hidden/helper dirs treated as work items
  - ambiguous lane ownership
  - weak filesystem/output verification
  - success reporting that does not re-check on-disk outputs

### Section 3: Remaining DocHub / File-Open Edge Cases

- [ ] capture any remaining ambiguous or inert file-open surfaces found after `1.9.0`
- [ ] keep direct workspace paths navigable even when the doc index is still warming
- [ ] preserve safe behavior for ambiguous basenames
- [ ] keep workspace-switch correctness/performance under watch where stale cross-workspace state can still linger:
  - notifications
  - activity / budget
  - docs caches
  - selected entities / detail panels

### Section 4: Workflow / Thread Follow-Through

- [ ] only for non-blocking follow-up gaps:
  - residual stale thread noise
  - delivery consistency edge cases
  - waiting-input / failed-run navigation polish
- [ ] specifically re-audit:
  - workflow/channel target mismatch follow-through
  - group communications that can partially fail while the DAG still reports green
  - system-test / workflow diagnostics that should surface upstream model or quota failures before downstream noise

### Section 5: Tomorrow-Start Items

- [ ] start with test coverage measurement / gap analysis, then choose the first backfill targets from the highest-risk under-tested surfaces
- [ ] keep the `355 -> 400` push tied to area coverage movement, not just raw lane growth
- [ ] continue the current helper-lane backfill in grouped batches until the next meaningful RC checkpoint, rather than stopping immediately after each small increase
- [ ] verify and, if confirmed, close `#158` and `#159` against the shipped `1.9.0` fixes
- [ ] continue provider cooldown/auth surfacing follow-through in remaining workflow/result/log/operator surfaces
- [ ] audit local metering under-reporting where Activity/Budget can still show real calls with `0.0k` tokens / `$0.00`
- [ ] inspect cloud logs reconnect churn and decide whether it belongs in `1.9.1` or a later runtime-focused slice

## Explicitly Deferred

- [ ] documentation-only issues such as demo-video refresh and `v2.0.0` wish-list docs are intentionally deferred to the later `1.9.5` / `2.0` prep window
- [ ] the OpenClaw version update should not land in `1.9.1`; use `1.9.1` through roughly `1.9.3` to backfill tests and stabilize, then target the OpenClaw bump around `1.9.4`

## Guardrails

- [ ] every user-visible fix adds explicit regression coverage
- [ ] every new counted test batch should have a short explanation of which inventory area it strengthens
- [ ] no new broad feature families
- [ ] keep the release line stable while doing follow-through
