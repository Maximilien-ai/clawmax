# Simplify / Harden / Optimize 1.9.8

> Status: first bounded feature batch in validation
> Baseline: `v1.9.7` / OpenClaw `v2026.6.11`
> Last updated: July 14, 2026

## Goal

Use `1.9.8` as a feedback-first hardening and small-feature line after the first fully validated ClawMax release on the new OpenClaw runtime. Preserve the stable runtime baseline while Mike and other testers exercise real local, cloud, and on-prem deployments, and allow bounded features that can ship independently while contributing to the path toward `2.0.0`.

## Feature Intake

Small features may enter `1.9.8` when they:

- have a narrow user-visible outcome
- do not require the full `2.0.0` evaluation/control architecture
- can be covered by focused automated and manual tests
- do not destabilize the promoted OpenClaw runtime baseline
- can be deferred to `1.9.9` cleanly if tester fixes need the release budget

## First Bounded Feature Batch

- Federate Skills import searches across ClawHub, Shipables, and Tessl, preserving provider-specific installation.
- Track DocHub uploads explicitly and allow multi-select move/delete only for ledger-backed user files; moves remain inside the original upload target boundary.
- Name template, workflow, agent, and skill exports after the exported object instead of using generic attachment names.
- Restore the last valid dashboard page from browser-local state when opening the root route and preserve System navigation expansion state.

## Intake Requirements

For each report, capture:

- ClawMax image/version and deployment kind
- configured agent model and provider
- affected agent, group, or workflow
- exact user-visible error
- relevant exported system logs
- whether the same agent works in direct chat, group chat, and workflow execution
- minimal reproduction steps and whether retry/restart changes the result

## Priority Order

1. Data loss, security, or deployment blockers.
2. Agent chat, group chat, or workflow execution regressions.
3. Model/provider/auth/plugin compatibility and misleading diagnostics.
4. Container persistence, upgrade, and restart behavior.
5. Focused UX or performance fixes supported by tester evidence.

## Guardrails

- Keep OpenClaw pinned to `v2026.6.11` during initial feedback triage.
- Keep features bounded; move larger or coupled work to `1.9.9` or `2.0.0`.
- Require a regression test for every reproducible runtime fix.
- Validate candidate images on amd64 and arm64, then run direct chat, group chat, and a multi-step workflow on cloud/on-prem before promotion.
- Preserve `1.9.7` as the rollback target until `1.9.8` is promoted.

## Exit Criteria

- high-severity `1.9.7` feedback is resolved or explicitly deferred
- full integration/validation/coverage suite is green
- live model performance sample completes with real BYOK credentials
- multi-architecture image and registry smoke tests pass
- cloud/on-prem chat and workflow smoke tests pass
