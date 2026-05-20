# ClawMax Status

**Current Version**: v1.5.3
**Last Updated**: May 19, 2026
**Status**: `v1.5.3` is the current release line on `main`

---

## Current State

- `main` now carries the `1.5.3` release line: the `1.5.2` Add Agent regression is fixed, logical template ids resolve correctly again, plain create now seeds valid managed agent files, and newly created agents surface immediately as real agents instead of only appearing as raw workspace directories
- targeted local validation is green on the current line, including the newer chat-session, Opik runtime, skill metadata, and skill-tag regressions
- targeted local validation is also green for the new AI prompt expansion/editor path via `server/lib/ai-generator.test.ts` and repeated `npx tsc --noEmit`
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
