# Simplify + Harden + Optimize Sprint: 1.9.0

> Started: June 20, 2026
> Branch: `main`
> Baseline: `v1.8.9`

## Goal

Use `1.9.0` to finish the highest-signal remaining hardening work after the `1.8.x` stabilization line:

- close the remaining provider/runtime error-normalization gaps so operators can tell auth, quota, cooldown, timeout, and runtime/config mismatches apart without reading raw fallback chains
- harden workflow/channel delivery correctness where a DAG can still look green while a participant fails to post back into the intended group/community
- finish the lingering low-context DocHub/file-open and notification/workspace-state edge cases
- continue the template/workflow audit for hidden lane/subdirectory assumptions and weak on-disk output verification
- tighten metering/diagnostic/operator recovery paths that still make local or on-prem troubleshooting noisy

## Scope

### Section 1: Provider / Runtime Error Normalization Follow-Through

- [ ] audit the remaining user-visible runtime failure surfaces:
  - workflow result panels
  - workflow rerun/restart flows
  - activity / notification summaries
  - logs/Doctor summaries where the user is expected to diagnose the problem
- [ ] keep the error buckets consistent:
  - invalid key / 401
  - missing key
  - stale auth profile / sticky auth state
  - quota / rate limit
  - cooldown / timeout
  - unsupported model / runtime mismatch
- [ ] prefer concise operator-facing wording over raw fallback-chain text whenever we can classify the failure safely

### Section 2: Workflow / Channel Delivery Correctness

- [ ] audit workflows/templates where one or more participants can still hit communication failures like `COMMS FAIL` or `Unknown channel`
- [ ] ensure workflow success criteria do not report a clean DAG result while participant delivery back into the intended group/community actually failed
- [ ] keep validation conservative:
  - catch wrong communication targets before apply/run when possible
  - surface delivery failures as real workflow failures or blockers when they are execution-critical

### Section 3: DocHub / File-Open and Workspace-State Closure

- [ ] finish the remaining context-poor file-open surfaces
- [ ] keep safe behavior for ambiguous basenames or weak navigation context
- [ ] continue workspace-switch cleanup anywhere stale state still lingers:
  - notifications
  - selected detail panels
  - docs index caches
  - any remaining duplicate fetch / stale visible entity issues

### Section 4: Template / Workflow Audit Follow-Through

- [ ] continue the audit for:
  - hidden/helper subdirectory assumptions
  - weak lane ownership assumptions
  - workflow success criteria that do not re-check on-disk outputs
  - templates that assume a result exists without verifying the file/artifact was actually written
- [ ] sync only the clean public-facing template/workflow fixes we actually want exported

### Section 5: Metering / Diagnostics / Operator Recovery

- [ ] investigate local/on-prem paths where Activity/Budget can still under-report token or cost totals after real runs
- [ ] improve system-test / workflow diagnostics so upstream model/provider failures are more obvious than downstream noise
- [ ] add or tighten operator recovery actions where they reduce support load:
  - gateway restart / recovery affordances
  - clearer “what to do next” actions from Doctor/runtime warnings

## Guardrails

- [ ] every user-visible fix should add or expand explicit regression coverage
- [ ] do not widen scope into new feature families
- [ ] prefer surgical fixes over architectural rewrites unless the current path is provably too fragile
- [ ] keep README compact, CHANGELOG detailed, and archive completed sprint notes once the release is promoted

## Exit Criteria

Do not cut `1.9.0-test-rc1` unless:

- [ ] the focused regression lanes added for this sprint are green
- [ ] the full `SYSTEM/test-with-server.sh integration --with-validation` run is green
- [ ] cloud/on-prem manual checks confirm the targeted runtime/workflow/notification fixes actually hold in real deployments
