# ClawMax Status

**Current Version**: v1.9.9

**Development Line**: 2.0.0

**Last Updated**: August 24, 2026

**Status**: `v1.9.9` remains stable. `2.0.0-test-rc43` is the active hands-on validation candidate. OpenClaw remains pinned to `v2026.6.34` on the 2.0 line.

## Current State

- RC43 is built from public source `a4b78c1d12136e21707e926c3d2a0e8cc0b1a1d0`.
- The complete local integration, validation, coverage, and live-execution gate passed `463/463`, with 81.14% statements/lines, 69.40% branches, and 91.19% functions.
- Public amd64/arm64 publication, packaged version identity, manifest assembly, and independent registry smoke passed in [run 32658795332](https://github.com/Maximilien-ai/clawmax/actions/runs/32658795332). The public manifest digest is `sha256:8af1e160106db1acab5e9b853743cad943effe8de5d52dc11890dd0b2b715c44`.
- The matching authorized combined image passed private source locking, package-privacy checks, contract validation, live plugin discovery, runtime acceptance, and amd64/arm64 registry smoke. Private source and detailed evidence remain in the private plugin repository.
- RC43 makes generic plugin activity visible on agent and workflow cards and detail views without encoding private plugin domains into the public host contract.
- Lifecycle and Review are the public product plugins for 2.0. Evals, Guardrails, and Optimize remain private enterprise plugins. Public `PLUGINS/test/plugin-*` directories are synthetic contract fixtures only.
- The RC38 source security review has no unresolved Critical or High findings. Final-candidate cloud/on-prem runtime evidence and the completed Review export remain required before promotion; the source review is not a claim that those external gates have passed.
- Real Google and Microsoft provider checks remain pending or require an explicit documented deferral. Synthetic OAuth, authorization, persistence, and adapter coverage is green.

## Active Release Tracks

### 1.9.9 maintenance

- Branch: `release-1.9.9`
- Tag: `v1.9.9`
- Image: `ghcr.io/maximilien-ai/clawmax-dashboard:1.9.9`
- Policy: accept only reproducible release-blocking hotfixes; validate any hotfix as a new RC before promotion.
- Runtime: OpenClaw `v2026.6.11`.

### 2.0.0 development

- Branch: `main`
- Candidate: `2.0.0-test-rc43`
- Runtime: OpenClaw `v2026.6.34`
- Hands-on review: complete the focused RC43 journeys and retain the exported Review evidence.
- External validation: verify cloud and on-prem health, restart behavior, chat, workflows, and plugin persistence against the accepted images.
- Promotion rule: if candidate source changes, cut and validate a new RC. Otherwise promote the exact tested source and image digest.
- Alternate runtime PR #170 is a post-2.0 effort and is not a launch gate.

## Release References

- active launch plan: [RELEASE_2_0_0_LAUNCH_2026-08-24.md](planning/RELEASE_2_0_0_LAUNCH_2026-08-24.md)
- changelog: [CHANGELOG.md](../../CHANGELOG.md)
- active backlog: [BACKLOG.md](BACKLOG.md)
- known issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- documentation index: [README.md](README.md)
- testing guide: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- source security review: [SECURITY_REVIEW_2_0_RC38.md](security/SECURITY_REVIEW_2_0_RC38.md)
- historical plans: [planning/archive/](planning/archive/)
