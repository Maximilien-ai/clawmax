# ClawMax Status

**Current Version**: v1.4.9
**Last Updated**: May 17, 2026
**Status**: `v1.4.9` is the current patch release line on `main`

---

## Current State

- `main` now carries the `1.4.9` patch line: persistent agent chat reopen, richer skill registry metadata, editable skill tags, explicit skill tag filtering, and Opik runtime alignment with workspace-stored project/workspace settings
- targeted local validation is green on the current line, including the newer chat-session, Opik runtime, skill metadata, and skill-tag regressions
- Skills now support stronger day-to-day management: reverse assignment, workspace-copy editing, bulk selection/deletion, richer imported registry provenance, tag editing/filtering, and registry suggestions from ClawHub, Shipables, and Tessl
- Tessl registry support is available as an **exploratory/experimental** feature for OpenClaw workspaces; installs are materially improved, but some tiles still require Tessl-side security review or additional format validation
- recurring personal/ops templates now require less apply-time context for day-of or run-time fields, making repeated deploy/use flows much smoother
- single-agent template apply now registers created agents correctly into active OpenClaw config so fresh agent-template deploys can chat immediately
- on-prem runtimes now attach `instance_key`, `machine_id`, and `machine_name` into metering traces so different Macs stop colliding when a shared hostname is reused

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- older release planning context: [RELEASE_1_3_0_PREP_2026-04-13.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/RELEASE_1_3_0_PREP_2026-04-13.md)
