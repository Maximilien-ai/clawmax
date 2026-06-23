# Simplify + Harden + Optimize Sprint: 1.9.1

> Started: June 23, 2026
> Baseline: `v1.9.0`

## Goal

Use `1.9.1` for the next cleanup slice after the `1.9.0` stabilization release.

- finish the remaining operator-facing diagnostics cleanup so auth, network, cooldown, and runtime/config problems read clearly everywhere
- continue the public template/workflow audit and prepare or complete selective sync for `Maximilien-ai/templates` and `Maximilien-ai/workflows`
- close any remaining low-context DocHub/file-open edge cases that surface after `1.9.0`
- keep workflow/thread consistency tightening scoped to real follow-up gaps rather than opening new feature families

## Scope

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

### Section 3: Remaining DocHub / File-Open Edge Cases

- [ ] capture any remaining ambiguous or inert file-open surfaces found after `1.9.0`
- [ ] keep direct workspace paths navigable even when the doc index is still warming
- [ ] preserve safe behavior for ambiguous basenames

### Section 4: Workflow / Thread Follow-Through

- [ ] only for non-blocking follow-up gaps:
  - residual stale thread noise
  - delivery consistency edge cases
  - waiting-input / failed-run navigation polish

## Guardrails

- [ ] every user-visible fix adds explicit regression coverage
- [ ] no new broad feature families
- [ ] keep the release line stable while doing follow-through
