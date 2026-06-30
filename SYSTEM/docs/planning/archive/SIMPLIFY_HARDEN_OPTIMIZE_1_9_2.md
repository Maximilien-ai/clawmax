# Simplify + Harden + Optimize Sprint: 1.9.2

> Planned: June 28, 2026
> Baseline: `v1.9.1` promotion candidate

## Goal

Use `1.9.2` as the first cleanup release after the `1.9.1` stabilization push.

- finish the highest-value remaining operator diagnostics cleanup after the broad `1.9.1` coverage push
- close the most visible remaining DocHub / file-open edge cases
- tighten workflow/thread follow-through only where real product gaps remain
- continue selective public template/workflow sync without widening product scope
- keep pushing measured coverage upward, but bias toward real product risk rather than raw lane count

## Scope

### Section 1: Operator Diagnostics Follow-Through

- [ ] audit the remaining user-visible diagnostics surfaces after `1.9.1`
- [ ] normalize the last raw fallback/runtime/provider noise in:
  - workflow results
  - logs
  - activity
  - recovery / reconnect surfaces
- [ ] keep guidance action-oriented and consistent for:
  - missing key
  - invalid key
  - quota / rate limit
  - cooldown / timeout
  - unsupported model / runtime mismatch
  - host-agent reconnect / local runtime availability
- [ ] make upstream model/auth/quota failures more obvious than downstream workflow noise

### Section 2: Remaining DocHub / File-Open Closure

- [ ] capture the remaining visible file-open failures after `1.9.1`
- [ ] keep direct workspace paths navigable even when the doc index is still warming
- [ ] preserve safe handling for ambiguous basenames
- [ ] audit notification/chat/workflow/result file chips that still lack enough context to resolve confidently
- [ ] watch for stale cross-workspace doc state after workspace switches

### Section 3: Workflow / Thread Follow-Through

- [ ] only address real non-blocking product gaps
- [ ] re-audit:
  - green DAG but failed communication delivery
  - waiting-input / failed-run navigation polish
  - residual stale thread noise
  - workflow/channel target mismatch follow-through
  - system-test / workflow diagnostics where upstream failure should dominate downstream stage noise

### Section 4: Public Template / Workflow Sync

- [ ] continue selective sync for `Maximilien-ai/templates`
- [ ] keep `Maximilien-ai/workflows` semantic-review-first unless true content drift is identified
- [ ] continue the template/workflow audit for:
  - hidden/helper directories being treated as work items
  - ambiguous lane ownership
  - weak filesystem/output verification
  - success reporting that does not re-check on-disk outputs

### Section 5: Metering / Workspace-State Accuracy

- [ ] audit local metering under-reporting where real runs still show `0.0k` tokens / `$0.00`
- [ ] keep watching workspace-switch stale state in:
  - notifications
  - activity / budget
  - docs caches
  - selected entities / detail panels
- [ ] inspect cloud logs reconnect churn and decide whether it belongs in `1.9.2` or a later runtime-focused slice

### Section 6: Coverage Direction

- [ ] keep using `--coverage` on meaningful checkpoints, not every tiny patch
- [ ] use the measured `77.25%` statements/lines and `67.18%` branches checkpoint from late `1.9.1` as the current baseline
- [ ] favor deeper server/business-logic coverage over helper-lane farming unless a new counted lane covers a real thin area
- [ ] target the biggest remaining high-risk files first if another coverage sprint is needed

## Guardrails

- [ ] no broad new feature families
- [ ] every user-visible fix adds explicit regression coverage
- [ ] keep `1.9.2` customer-facing and cleanup-oriented
- [ ] do not fold the OpenClaw version bump into `1.9.2`

