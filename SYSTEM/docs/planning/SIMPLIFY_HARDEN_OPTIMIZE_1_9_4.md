# Simplify + Harden + Optimize Sprint: 1.9.4

> Planned: June 30, 2026
> Baseline: `1.9.3-test-rc2` validation in progress

## Goal

Use `1.9.4` as the provider/runtime incident-hardening release after `1.9.3` stabilizes chat archives and the latest cloud/on-prem regressions.

- detect shared provider-auth/config failures as one operator incident instead of noisy per-agent repetition
- make on-prem/cloud runtime auth failures easier to diagnose and faster to recover
- reduce repeated cron/workflow spam when the root cause is unchanged
- keep adding regression coverage around the real provider/runtime failure paths, not generic lane farming

## Scope

### Section 1: Shared Provider Auth Incident Detection

- [ ] detect repeated provider-auth failures across many agents/workflows that share the same runtime/provider configuration
- [ ] show one fleet-level/operator-visible incident summary instead of dozens of near-identical history rows
- [ ] preserve drill-down into affected agents and jobs without forcing users to read every duplicate failure
- [ ] make it obvious when a shared provider issue is broader than one agent or one workflow

### Section 2: Provider-Specific Diagnostics

- [ ] distinguish missing key vs invalid key vs revoked key vs org/project mismatch where the upstream runtime gives enough signal
- [ ] distinguish wrong provider base URL / endpoint shape from true auth failure
- [ ] keep auth/quota/cooldown/timeouts clearly separated in history, workflows, doctor, logs, and notifications
- [ ] make the operator-facing copy point to the likely shared runtime/provider root cause when many scheduled jobs fail the same way

### Section 3: Cron / Workflow Failure Dedupe

- [ ] suppress or group repeated scheduled auth failures when the same workflow/agent/provider root cause repeats unchanged
- [ ] avoid flooding History/Activity with hourly copies of the same runtime auth incident
- [ ] keep the first failure and meaningful state changes visible while reducing noise from unchanged repeats
- [ ] ensure grouped failures still preserve exact timestamps and job context for operator audit

### Section 4: Doctor / Preflight for Runtime Provider Config

- [ ] add a doctor/preflight check for active model provider configuration in managed/on-prem runtimes
- [ ] validate that required provider key/base-url/org/project settings are present before cron jobs keep firing
- [ ] surface whether the runtime host/container can actually use the configured provider credentials
- [ ] make recovery guidance actionable for cloud and on-prem operators

### Section 5: Follow-Through After 1.9.3

- [ ] only pull in `1.9.3` hotfixes if RC validation shows a real ship blocker
- [ ] otherwise keep archive/resume work out of `1.9.4` unless it directly overlaps runtime/provider diagnosis
- [ ] keep the next release line cleanly separated from chat-archive cleanup

### Section 6: Coverage Direction

- [ ] add direct regression coverage for provider-auth normalization and fleet-level grouping logic
- [ ] add direct regression coverage for repeated cron/workflow failure dedupe behavior
- [ ] add direct regression coverage for doctor/runtime provider preflight checks
- [ ] continue using `--coverage` at checkpoints, but prioritize meaningful provider/runtime surfaces over helper-only growth

## Out of Scope

- [ ] no broad new provider integration work
- [ ] no OpenClaw version bump unless forced by a fix we cannot land locally
- [ ] no generic UI redesign unrelated to provider/runtime diagnosis
- [ ] no archive/resume work unless `1.9.3` RC feedback proves it blocks promotion

## Guardrails

- [ ] every new incident-detection or dedupe rule must still preserve enough evidence for operator debugging
- [ ] do not hide real state changes while collapsing duplicates
- [ ] keep cloud and on-prem operator guidance explicit about runtime-host vs laptop/browser context
- [ ] prefer one clear incident over many noisy rows, but never at the cost of losing root-cause visibility
