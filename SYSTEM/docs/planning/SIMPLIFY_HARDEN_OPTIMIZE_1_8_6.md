# Simplify + Harden + Optimize Sprint: 1.8.6

> Started: June 15, 2026
> Branch: `simplify-harden-optimize-1-8-6`
> Baseline: `main` after `v1.8.5`

## Goal

Use `1.8.6` for another short, low-risk quality pass:

- finish remaining DocHub/file-open edge cases
- make provider failure states clearer across more surfaces
- continue notification grouping/dedupe cleanup
- trim one more stale-state or duplicate-fetch path
- close out a small narrow/mobile audit if it stays low risk

## Scope

### Section 1: DocHub + File-Open Polish

- [ ] fix remaining chat/status/notification file-open mismatches
- [ ] keep ambiguous basenames from producing misleading opens
- [ ] preserve the good `1.8.5` PDF/image/code preview behavior

### Section 2: Provider Cooldown/Auth Surfacing

- [ ] improve workflow/result/log wording for transient cooldowns
- [ ] improve wording for hard auth/config/quota failures
- [ ] avoid leaking raw fallback chains where a clearer summary exists

### Section 3: Notification Grouping + Dedupe

- [ ] extend grouped summaries for repeated artifact/result bursts
- [ ] keep drill-down behavior where the grouped surface replaces noisy duplicates
- [ ] add visible regression coverage when grouping behavior changes

### Section 4: Workspace / Perf Follow-Through

- [ ] fix one more stale-state, duplicate fetch, or jitter path
- [ ] prefer helper-level/request-local logic over broad refactors

### Section 5: Narrow/Mobile Audit

- [ ] check notifications/top-bar popovers and clipped panels
- [ ] fix only obvious low-risk overflow or positioning issues

## Release Rule

Do not cut `1.8.6-test-rc1` unless:

- focused tests pass after each section
- full `SYSTEM/test-with-server.sh integration --with-validation` passes
- visible regression coverage increases when behavior changes materially
