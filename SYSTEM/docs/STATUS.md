# ClawMax Status

**Current Version**: v1.7.0
**Last Updated**: June 1, 2026
**Status**: `v1.7.0` is the current release candidate line on `main`

---

## Current State

- `main` now carries the `1.7.0` release candidate line, the first line built around upgraded OpenClaw `2026.5.26`
- dashboard, CI, and container/image paths now share the same tested OpenClaw baseline instead of drifting across older local, CI, and Docker-era versions
- hosted/BYOK runtime paths now wait briefly for Gateway readiness before falling back, which makes startup-time chat/workflow/channel execution more predictable across local, containerized, on-prem, and cloud environments
- the release gate now includes broad route-contract coverage across all current server routes, shell coverage for install/setup/update/uninstall/OpenClaw target prep, and explicit OpenClaw/Gateway contract suites
- the late `1.6.x` hardening work remains in place: platform-aware Skills guidance, AI prompt editor preview resizing, and broader Builder/Templates/Skills/Workflows follow-through coverage
- image and release validation should now focus on real built artifacts rather than dev-only runtime testing

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- OpenClaw upgrade runbook: [operations/OPENCLAW_UPGRADE_RUNBOOK.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/operations/OPENCLAW_UPGRADE_RUNBOOK.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
