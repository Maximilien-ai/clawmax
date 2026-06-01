# OpenClaw Upgrade Readiness Audit

> Completed: June 1, 2026
> Target release line: `1.6.6` stabilization before `1.6.7` OpenClaw upgrade work

## Goal

Reduce upgrade risk before moving ClawMax from its current pinned OpenClaw baseline to a newer upstream release.

The intent of this audit is not “add every possible test.” It is:

- confirm what the standard test suite already covers well
- surface important tests that existed but were not part of `SYSTEM/test.sh`
- identify the remaining high-risk gaps that could hide an OpenClaw upgrade regression

## What Is Covered Well Today

### Core backend/runtime helpers

The current suite already has strong direct coverage for:

- skills loading, assignment, import, registry normalization, setup metadata, and runtime-specific install handling
- templates import/apply logic, validation, workflow/channel inference, and markdown import/export
- workflow execution helpers, DAG behavior, scheduling, and workflow route helpers
- BYOK, dashboard env, model discovery, default-model resolution, and AI generator paths
- workspace import/export, workspace status, workspace dashboard/result extraction, and workspace ordering
- auth, OTP, gateway RPC, host-agent status, notifications, metering, budget, and safe env behavior

### Client helper logic

The client helper layer is covered for:

- navigation
- onboarding tour behavior
- Builder routing/session helpers
- BYOK/local secrets
- DocHub tree rendering
- communication bulk/message helpers
- skill selection/setup/tags/deletion/scope helpers
- assigned-agent refresh and related page-state helpers

### Live integration

`SYSTEM/test.sh integration` already exercises:

- health/system/activity endpoints
- agent listing and next-id generation
- docs, channels, notifications, models, templates, workflows, workspaces, skills, budget, and cost-limit APIs
- live template apply into a system-test workspace
- workflow DAG execution
- live agent chat
- workflow notifications/progress
- workspace file/memory side effects

This is the biggest safety net for an OpenClaw upgrade because it validates real end-to-end behavior, not just helpers.

## Improvements Added During This Audit

These tests already existed or were added recently, but were not all part of the default release signal:

- added `client/src/lib/skillPlatform.test.ts` to `SYSTEM/test.sh`
- added `SYSTEM/install.test.sh` to `SYSTEM/test.sh`
- added `SYSTEM/setup.test.sh` to `SYSTEM/test.sh`
- tightened Skills coverage for:
  - Linux-vs-mac install visibility
  - mac-only built-ins hidden on Linux
  - registry-imported skills preserving runtime-specific install guidance

## Remaining Gaps Before OpenClaw Upgrade

### 1. Page-level UI automation is still thin

We have many client helper tests, but very little page-level automation for:

- Agents
- Skills
- Templates
- Workflows
- Communications
- Organization
- Builder

What is missing is not business logic only, but real rendered-state checks for:

- action button visibility/order
- selection-mode behavior
- responsive layout regressions
- page-level filtering/search interactions
- panel/modal follow-through

This is why layout/visibility regressions can still slip through even when helper tests are green.

### 2. `/api/system` and top-bar/runtime identity behavior are still mostly integration-covered

The product depends heavily on:

- packaged version resolution
- deployment kind
- instance label
- runtime platform
- local vs managed defaults

Some of this is covered in helper tests and live integration, but there is still no focused route-level suite for the shape of `/api/system`.

### 3. Installer/update shell coverage is still narrower than runtime coverage

We now surface `install.sh` and `setup.sh` shell tests in `SYSTEM/test.sh`, which is an improvement.

Still missing:

- explicit `update.sh` coverage in the standard suite
- a tighter release-bootstrap smoke that validates latest/pinned installer behavior against release asset naming and handoff assumptions

### 4. Real browser/UI smoke remains manual

For the OpenClaw upgrade, the highest risk user-facing paths are:

- Add Agent
- AI Generate Agent
- template apply
- workflow run / DAG follow-through
- Skills add/setup/install visibility
- chat transcript correctness
- workspace switching

We still rely on manual verification for those rendered flows.

### 5. OpenClaw CLI/runtime contract drift is still mostly caught indirectly

We do have strong indirect coverage via:

- agent execution tests
- integration/system-test workspace
- doctor/gateway/config tests

But we do not yet have a dedicated “OpenClaw contract audit” suite that explicitly checks the assumptions ClawMax makes about:

- config shape
- agent workspace registration
- CLI command availability/arguments
- gateway readiness expectations
- generated runtime file locations

That is the most important next gap to close before upgrading upstream.

## Recommended `1.6.6` / `1.6.7` Sequence

### `1.6.6`

Use `1.6.6` as the stabilization release:

- finish concrete high-signal fixes
- add missing regression tests that are cheap and high value
- write down the OpenClaw contract assumptions clearly
- keep standard suite green locally and in CI

### `1.6.7`

Use `1.6.7` as the OpenClaw upgrade line:

- branch specifically for the upgrade
- update pinned OpenClaw version/ref
- run helper + integration + manual smoke against that branch
- treat any failure as contract drift first, not random regression

## Highest-Value Next Test Additions

If we only do a few more things before the upgrade, these are the best investments:

1. add a focused `/api/system` route test
2. add page-level smoke coverage for:
   - Skills
   - Templates apply
   - Agents create / AI generate handoff
3. add explicit `update.sh` test coverage
4. add a small “OpenClaw contract” suite for config/CLI/workspace assumptions

## Bottom Line

ClawMax is already much better protected than it was earlier in the `1.6.x` line:

- backend helper coverage is broad
- route/helper coverage is meaningful
- live integration/system-test coverage is real

But the main remaining upgrade risk is not low-level helper logic anymore.

The remaining risk is:

- page-level UI/regression drift
- installer/update/release bootstrap assumptions
- undocumented OpenClaw runtime contract assumptions

That is the right place to focus before upgrading OpenClaw.
