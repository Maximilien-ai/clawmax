# ClawMax Status

**Current Version**: v1.5.5
**Last Updated**: May 20, 2026
**Status**: `v1.5.5` is the current release line on `main`

---

## Current State

- `main` now carries the `1.5.5` release line: local/self-hosted model support is broader through the new `OpenAI-Compatible` BYOK provider, hosted vs. self-hosted provider choice is clearer, and dashboard/browser instance labeling is easier to distinguish at a glance
- current post-`1.5.5` hardening on `main` makes local-model behavior more deployment-aware: the dashboard now distinguishes `local`, `onprem`, and `cloud`, keeps Ollama visible where it is actually usable, and uses better same-Mac on-prem defaults for LM Studio and Ollama
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
