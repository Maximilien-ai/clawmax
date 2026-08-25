# ClawMax Status

**Current Version**: v1.9.9

**Development Line**: 2.0.0

**Last Updated**: August 25, 2026

**Status**: `v1.9.9` remains stable. RC43 is retired after tester feedback. RC44 failed before image publication because its QBO verification used an unsupported flag; RC45 source is being validated with the corrected probe. OpenClaw remains pinned to `v2026.6.34` on the 2.0 line.

## Current State

- RC43 public source, image, digest, and combined-image results are retained as historical evidence, but tester feedback made that candidate non-promotable.
- RC45 carries the LM Studio/Gemma, QBO runtime packaging, Builder, optional-skill, Partner navigation, and focused Review repairs. RC44 image run 32904599151 failed its unsupported `qbo --version` probe on both architectures before manifest publication; it has no accepted digest. Exact RC45 source, validation, digest, and combined-image evidence will be recorded only after their gates pass.
- Generic plugin activity remains visible on agent and workflow cards and detail views without encoding private plugin domains into the public host contract.
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
- Candidate: `2.0.0-test-rc45` source validation; image pending
- Runtime: OpenClaw `v2026.6.34`
- Hands-on review: complete the focused RC45 journeys and retain the exported Review evidence.
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
