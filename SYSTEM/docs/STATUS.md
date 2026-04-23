# ClawMax Status

**Current Version**: v1.3.15
**Last Updated**: April 23, 2026
**Status**: `v1.3.15` is the latest release on `main`

---

## Current State

- `main` now includes the `v1.3.15` dynamic maintenance-status line
- dashboard now prefers the runtime maintenance-status endpoint for banners and keeps env only as fallback
- scheduled maintenance now renders before the configured start window instead of remaining hidden until start time
- workflow artifact notifications prefer the real writer identity and suppress duplicate generic follow-up notifications
- agent status panels surface gateway restart-loop and session-drift diagnostics directly in the dashboard
- `Activity & Budget` refreshes on return, and Communications supports bulk clear-history using the archive-first backend path
- the maintenance banner is now environment-driven, renders correctly in local dev, and dismisses only for the current page session
- dashboard dev/prod serving is separated so Vite dev no longer risks stale built HTML taking precedence
- `SYSTEM/start.sh --restart -f` now reliably tears down old frontend/backend processes before starting fresh tails

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
