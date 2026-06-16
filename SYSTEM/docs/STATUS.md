# ClawMax Status

**Current Version**: v1.8.7
**Last Updated**: June 16, 2026
**Status**: `v1.8.7-test-rc6` is being validated from `main`. `v1.8.5` remains the last promoted stable release while `1.8.6`/`1.8.7` hardening slices are under cloud/on-prem verification.

---

## Current State

- `main` now contains the first `1.8.x` hardening pass, the `1.8.2` simplify/optimize slice, the `1.8.3` Add Agent regression fixes, the `1.8.4` agent delete UI cleanup, the `1.8.5` DocHub/notification polish pass, plus the `1.8.6` and `1.8.7` follow-through slices in validation.
- The `1.8.x` work is intentionally focused on hardening, simplification, regression safety, lightweight responsiveness wins, and backlog hygiene rather than major new feature scope.
- Dashboard, CI, container images, cloud, and on-prem paths use the same tested OpenClaw `2026.5.26` baseline.
- The release workflow now supports test images (`test-rcN`) and explicit promotion of validated images into official version tags.
- Partner integrations are active product surfaces, including Resend, Cognee, Opik, GitHub, Senso, and partner plugin install/uninstall handling.
- Resend has both dashboard test-email validation and first-party `clawmax-resend` agent-tool execution with runtime-secret support.
- Cognee has a first-pass partner surface for cloud/self-hosted configuration and official OpenClaw plugin lifecycle management.
- The latest reported full local integration run is green with `--with-validation`, including the latest helper/contract coverage for workspace file mentions, DocHub preview behavior, workflow session repair, notification presentation/routes, plugin notification dedupe, and provider model lifecycle handling.

## Active Release Track

- Branch: `main`
- Plans:
  - [planning/HARDENING_SIMPLIFICATION_1_8_X.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/HARDENING_SIMPLIFICATION_1_8_X.md)
  - [planning/SIMPLIFY_OPTIMIZE_1_8_X.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_OPTIMIZE_1_8_X.md)
- Near-term target: validate `1.8.7-test-rc6`, then promote `1.8.7` if cloud/on-prem checks remain green and continue the next `1.8.x` harden/simplify pass plus `plugins-mvp1` follow-through on top of the `1.8.7` baseline.

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- active backlog: [BACKLOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/BACKLOG.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/RELEASE_CHECKLIST.md)
