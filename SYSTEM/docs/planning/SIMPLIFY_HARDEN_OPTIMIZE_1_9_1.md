# Simplify + Harden + Optimize Sprint: 1.9.1

> Started: June 22, 2026
> Branch: `simplify-harden-optimize-1-9-1`
> Baseline: `1.9.0-test-rc2/rc3` validation line on `main`

## Goal

Use `1.9.1` for the next cleanup slice after `1.9.0` stabilization, while keeping `main` available for any `1.9.0-rc3` blocker fixes.

- finish the remaining operator-facing diagnostics cleanup so auth, network, cooldown, and runtime/config problems read clearly everywhere
- continue the public template/workflow audit and prepare a selective sync set for `Maximilien-ai/templates` and `Maximilien-ai/workflows`
- close any remaining low-context DocHub/file-open edge cases that surface during `1.9.0` validation
- keep workflow/thread consistency tightening scoped to real follow-up gaps rather than widening into new feature families

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

Current audit snapshot:

- `Maximilien-ai/templates` is currently dirty locally, so no bulk sync should be attempted.
- Public template candidates that already match local audited content:
  - `dev-team`
  - `support-team`
  - `physics-research-group`
  - `statistics-research-lab`
- Public template candidates that differ and should be considered for selective sync:
  - `conference-ops-hub`
    - local change: reduce default interchangeable coordinator count from `3` to `2`
  - `clawmax-dev-team`
    - local change: `pr-review` should depend on `dev-team-kickoff`, not `issue-triage`
  - `email-calendar-manager`
    - local change: `inbox-triage-cycle` disabled by default
  - `meeting-prep-desk`
    - local change: `people-and-topic-research` disabled by default
- `Maximilien-ai/workflows` needs semantic review, not blind sync:
  - this repo does not maintain a matching public `WORKFLOW.md` tree alongside those shipped template/workflow definitions
  - any workflow sync should be intentional and content-reviewed rather than diff-copied

### Section 3: Remaining DocHub / File-Open Edge Cases

- [ ] capture any remaining ambiguous or inert file-open surfaces found during `1.9.0` validation
- [ ] keep direct workspace paths navigable even when the doc index is still warming
- [ ] preserve safe behavior for ambiguous basenames

### Section 4: Workflow / Thread Follow-Through

- [ ] only if `1.9.0` testing reveals non-blocking follow-up gaps:
  - residual stale thread noise
  - delivery consistency edge cases
  - waiting-input / failed-run navigation polish

## Guardrails

- [ ] every user-visible fix adds explicit regression coverage
- [ ] no new broad feature families
- [ ] keep `main` free for `1.9.0` blocker-only fixes until `1.9.0` is promoted

## Exit Criteria

Do not cut `1.9.1-test-rc1` unless:

- [ ] the `1.9.0` line is either promoted or clearly limited to blocker-only follow-up
- [ ] the focused regression lanes added for `1.9.1` are green
- [ ] the resulting public-sync candidate set is reviewed and intentional
