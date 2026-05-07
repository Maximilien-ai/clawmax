# ClawMax Status

**Current Version**: v1.4.0
**Last Updated**: May 7, 2026
**Status**: `v1.4.0` is the latest tagged release on `main`

---

## Current State

- `main` now carries the `1.4.0` release line: company dashboards, richer company/workflow templates, timezone-correct scheduling, gateway fallback hardening, metering caching, and recent customer UX follow-through
- `SYSTEM/test-with-server.sh` and `SYSTEM/test.sh` are green on the current default-safe path, including the Docker smoke tests that were failing earlier this week
- workflow scheduling now respects persisted workflow timezones in previews, node-cron execution, and gateway cron sync
- local/hosted runtime compatibility improved across Gemini, Ollama, gateway fallback, and scheduled system-key execution paths
- recent customer UX fixes shipped: visible agent-card actions, quick budget action, richer waiting-for-input context, communication flicker reduction, and skill-centric reverse assignment
- issue `#95` event-template refinement follow-through is shipped in the current line; customer verification remains the main final gate for the remaining recent runtime reports

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- release candidate checklist: [RELEASE_1_4_0_RC1.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/RELEASE_1_4_0_RC1.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
