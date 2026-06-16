# Simplify + Harden + Optimize Sprint: 1.8.7

> Started: June 15, 2026
> Branch: `simplify-harden-optimize-1-8-7`
> Baseline: `simplify-harden-optimize-1-8-6`

## Goal

Use `1.8.7` for the next narrow quality pass after `1.8.6`:

- finish remaining DocHub/file-open edge cases
- keep navigation/file chips from becoming misleading or inert
- add regression coverage where resolution logic is easy to break silently
- leave room to absorb any late `1.8.6` RC feedback if needed

## Scope

### Section 1: Remaining File-Open Polish

- [x] audit all remaining file-chip/open-file surfaces
- [x] resolve any remaining raw artifact-path opens through the DocHub index first
- [x] suppress or degrade gracefully when a target is ambiguous or unavailable

### Section 2: Regression Safety

- [x] add helper/route/client coverage for any new file-open cases fixed here
- [x] keep full-suite count moving only when behavior materially changes

### Section 3: Release Flexibility

- [x] keep changes small enough that they can either become `1.8.7-test-rc1`
- [x] or be selectively backported into `1.8.6-test-rc2` if RC feedback requires it

## Release Rule

Do not cut `1.8.7-test-rc1` unless:

- focused tests pass
- full `SYSTEM/test-with-server.sh integration --with-validation` passes
- the fixes are clearly separate from any urgent `1.8.6` promotion blockers
