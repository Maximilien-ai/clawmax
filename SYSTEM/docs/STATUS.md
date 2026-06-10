# ClawMax Status

**Current Version**: v1.8.0
**Last Updated**: June 10, 2026
**Status**: `v1.8.0` is entering `test-rc1` image validation after the first `1.8.x` hardening pass on `hardening-simplification`.

---

## Current State

- `main` is being updated from the validated `v1.7.9` release baseline to the `v1.8.0` hardening candidate.
- The `1.8.x` work is intentionally focused on hardening, simplification, regression safety, and backlog hygiene rather than major new feature scope.
- Dashboard, CI, container images, cloud, and on-prem paths use the same tested OpenClaw `2026.5.26` baseline.
- The release workflow now supports test images (`test-rcN`) and explicit promotion of validated images into official version tags.
- Partner integrations are active product surfaces, including Resend, Cognee, Opik, GitHub, Senso, and partner plugin install/uninstall handling.
- Resend has both dashboard test-email validation and first-party `clawmax-resend` agent-tool execution with runtime-secret support.
- Cognee has a first-pass partner surface for cloud/self-hosted configuration and official OpenClaw plugin lifecycle management.
- The latest full local integration run reported `312/312` passing with `--with-validation`.

## Active Release Track

- Branch: `main` after merging `hardening-simplification`
- Plan: [planning/HARDENING_SIMPLIFICATION_1_8_X.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/HARDENING_SIMPLIFICATION_1_8_X.md)
- Near-term target: build and validate `1.8.0-test-rc1`, then promote if cloud/on-prem checks pass.

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- active backlog: [BACKLOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/BACKLOG.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/RELEASE_CHECKLIST.md)
