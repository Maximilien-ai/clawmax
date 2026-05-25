# ClawMax Status

**Current Version**: v1.5.9
**Last Updated**: May 24, 2026
**Status**: `v1.5.9` is the current release line on `main`

---

## Current State

- `main` now carries the `1.5.9` release line: public tarball/checksum release packages remain the primary distribution path, and the curl bootstrap installer still supports latest or pinned installs without `gh`, GitHub login, or a local clone
- dashboard runtime startup is more diagnosable for on-prem/container issues: every start now logs the packaged dashboard version and image `CLAWMAX_VERSION`, and startup fails fast if the packaged dashboard files do not match the image version contract
- focused mobile/narrow-width fixes are in for key dashboard surfaces, including the notifications tray, BYOK / Partner Integrations wizard, and Apply Agent Template modal
- the dashboard CI required lane now runs the formerly quarantined template, dashboard-env, and docker-entrypoint coverage through the main `SYSTEM/test.sh` path instead of tolerating them as optional failures
- shipped organization templates now have catalog-wide regression checks that catch hidden helper/runtime directory references in workflow content and duplicate explicit artifact filenames across workflows in the same template
- secret readiness and registry install error handling are more actionable: local secret states are covered directly, Tessl security-review blockers are clearer, and ClawHub install/runtime prerequisite failures now surface actionable guidance
- the first documented template catalog audit batch and focused mobile audit are now checked into `SYSTEM/docs/operations` for follow-through as the shipped catalog grows

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
