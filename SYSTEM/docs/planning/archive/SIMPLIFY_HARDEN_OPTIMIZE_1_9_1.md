# Simplify + Harden + Optimize Sprint: 1.9.1

> Started: June 23, 2026
> Baseline: `v1.9.0`
> Outcome: promoted as `v1.9.1`

## Outcome Summary

`1.9.1` served as the stabilization and test-backfill release after `1.9.0`.

- added a lightweight test inventory snapshot for the `1.9.1` line
- pushed the visible wrapper suite to `369` passing lanes
- added opt-in `--coverage` support to the normal `integration --with-validation` wrapper flow
- established a measured `c8` baseline of `77.25%` statements/lines, `67.18%` branches, and `88.27%` functions on the promoted line
- deepened regression coverage across client helper surfaces and higher-risk server route/lib paths including `agents`, `workflows`, `templates`, `skills`, `channels`, `logs`, `ai-builder`, `github-auth`, `gateway-rpc`, `workspace-upload`, and internal `ai-generator` logic

## Notes

- Validation completed on `1.9.1-test-rc2`
- Promoted after cloud/on-prem validation on the expanded `369`-lane wrapper baseline
- `main` continued directly onto the `1.9.2` line after promotion prep, including the customer-facing skill-browse/runtime fix and workflow participant diagnostics cleanup
