# ClawMax Status

**Current Version**: v1.4.8
**Last Updated**: May 15, 2026
**Status**: `v1.4.8` is the current patch release line on `main`

---

## Current State

- `main` now carries the `1.4.8` patch line: all `1.4.7` on-prem identity/runtime visibility fixes plus a managed on-prem Ollama BYOK correction that prefers the runtime-provided host bridge URL over stale browser-local loopback defaults
- `SYSTEM/test-with-server.sh` and `SYSTEM/test.sh` are green locally on the current default-safe path, including the Docker smoke tests and newer skill/registry regressions
- Skills now support stronger day-to-day management: reverse assignment, workspace-copy editing, bulk selection/deletion, registry provenance, and registry suggestions from both Shipables and Tessl
- Tessl registry support is available as an **exploratory/experimental** feature for OpenClaw workspaces; installs are materially improved, but some tiles still require Tessl-side security review or additional format validation
- recurring personal/ops templates now require less apply-time context for day-of or run-time fields, making repeated deploy/use flows much smoother
- single-agent template apply now registers created agents correctly into active OpenClaw config so fresh agent-template deploys can chat immediately
- on-prem runtimes now attach `instance_key`, `machine_id`, and `machine_name` into metering traces so different Macs stop colliding when a shared hostname is reused

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
