# ClawMax Status

**Current Version**: v1.3.17
**Last Updated**: April 24, 2026
**Status**: `v1.3.17` is the latest release on `main`

---

## Current State

- `main` now includes the `v1.3.17` clean-room setup and runtime contention hardening line
- `setup.sh` now aligns dashboard token placement, `.env` shell safety, and non-default dashboard port/URL propagation with the real server/test contract
- `SYSTEM/start.sh` and `SYSTEM/test.sh` are more reliable in scripted fresh-start validation flows
- workflow, chat, and channel execution now share the same same-agent serialization and session-lock retry behavior
- issue `#11` clean-room setup validation is closed with repeatable harness coverage
- issue `#100` parallel workflow session-lock follow-through is closed with shared runtime-path serialization
- issue `#106` README release cleanup is closed and the release surfaces are trimmed to the current line

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
