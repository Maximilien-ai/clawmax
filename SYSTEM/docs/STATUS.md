# ClawMax Status

**Current Version**: v1.4.5
**Last Updated**: May 10, 2026
**Status**: `v1.4.5` is the current patch release line on `main`

---

## Current State

- `main` now carries the `1.4.5` patch line: all `1.4.4` runtime/container consistency work plus the on-prem template apply guardrails, embedded gateway health alignment, and dashboard-side Ollama contract fix
- `SYSTEM/test-with-server.sh` and `SYSTEM/test.sh` are green locally on the current default-safe path, including the Docker smoke tests and newer skill/registry regressions
- Skills now support stronger day-to-day management: reverse assignment, workspace-copy editing, bulk selection/deletion, registry provenance, and registry suggestions from both Shipables and Tessl
- Tessl registry support is available as an **exploratory/experimental** feature for OpenClaw workspaces; installs are materially improved, but some tiles still require Tessl-side security review or additional format validation
- recurring personal/ops templates now require less apply-time context for day-of or run-time fields, making repeated deploy/use flows much smoother
- single-agent template apply now registers created agents correctly into active OpenClaw config so fresh agent-template deploys can chat immediately
- the container entrypoint now probes gateway liveness correctly in the slim runtime image, and the dashboard Docker install steps are aligned with the OpenClaw builder workaround

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
