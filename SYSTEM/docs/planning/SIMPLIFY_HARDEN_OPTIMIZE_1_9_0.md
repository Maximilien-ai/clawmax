# Simplify + Harden + Optimize Sprint: 1.9.0

> Started: June 20, 2026
> Branch: `main`
> Baseline: `v1.8.9`

## Goal

Use `1.9.0` to finish the highest-signal remaining hardening work after the `1.8.x` stabilization line:

- close the remaining provider/runtime error-normalization gaps so operators can tell auth, quota, cooldown, timeout, and runtime/config mismatches apart without reading raw fallback chains
- harden workflow/channel delivery correctness where a DAG can still look green while a participant fails to post back into the intended group/community
- fix the remaining agent-chat archive/resume usability bugs so history is dated/labeled correctly and past conversations can actually be continued
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
- [ ] specifically audit the on-prem `dev-team · dev-team-Status / Daily Standup` class of failure where:
  - the workflow/DAG ends green
  - a participant like `dev-team-tech-lead` still reports an embedded-run/session conflict
  - workflow-failed / agent-error / needs-input notifications remain visible from the same run
- [ ] determine whether the fix belongs in:
  - execution success/failure criteria
  - retry/session-conflict handling
  - notification resolution rules when a later step or final workflow outcome succeeds
- [ ] treat the stale auth/runtime message leakage as a generic workflow-thread hygiene bug, not a single-template special case:
  - old auth/runtime failures should not keep polluting multiple workflow group threads after the run moved on
  - successful/final workflow state should resolve or de-emphasize superseded failure/input noise from that same run
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
- [ ] bring the date-separator/timestamp clarity from agent chat into group/community chat too:
  - non-today messages should show either a day separator or explicit date
  - users should not have to infer that `10:00 AM` means “yesterday” in group history
- [ ] audit stale/noisy notifications from prior runs so on-prem users do not keep seeing raw auth failures or resolved workflow blockers long after the relevant runtime/config issue was fixed

### Section 4: Agent Chat Archive / Resume Hardening

- [ ] fix archive list metadata correctness:
  - correct timestamps instead of `12/31/1969`
  - exclude `.trajectory.jsonl` / phantom empty rows
  - generate titles from real user/assistant turns rather than injected runtime context
- [ ] add a real restore/continue path for archived chats:
  - server restore endpoint
  - client `Continue this conversation` affordance
  - active-session handoff back into live chat
- [ ] ensure the current explicit session and archived sessions behave consistently after restore/resume
- [ ] use open bugs as acceptance criteria:
  - `#158` Chat Archives list broken
  - `#159` cannot continue/resume a past conversation

### Section 5: Template / Workflow Audit Follow-Through

- [ ] continue the audit for:
  - hidden/helper subdirectory assumptions
  - weak lane ownership assumptions
  - workflow success criteria that do not re-check on-disk outputs
  - templates that assume a result exists without verifying the file/artifact was actually written
- [ ] build an explicit public sync candidate list after the audit:
  - `Maximilien-ai/templates`
  - `Maximilien-ai/workflows`
- [ ] sync only the clean public-facing template/workflow fixes we actually want exported
- [ ] avoid bulk copy-over into dirty or experimental public repo content; prefer selective, reviewed syncs backed by audit regressions

### Section 6: Metering / Diagnostics / Operator Recovery

- [ ] investigate local/on-prem paths where Activity/Budget can still under-report token or cost totals after real runs
- [ ] improve system-test / workflow diagnostics so upstream model/provider failures are more obvious than downstream noise
- [ ] audit recurring raw auth/runtime failures still visible inside workflow communication threads across groups, where old `401 Incorrect API key provided` or similar runtime noise remains visible even after the workflow moved on or later completed successfully
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
