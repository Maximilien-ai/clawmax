# ClawMax Status

**Current Version**: v1.9.7
**Development Line**: 1.9.8
**Last Updated**: July 13, 2026
**Status**: `v1.9.7` is the promoted stable release and the first fully validated local/cloud/on-prem line on OpenClaw `v2026.6.11`. `main` is validating the first `1.9.8` bounded feature batch: federated registry search, safe DocHub bulk file actions, descriptive export names, and navigation memory. `1.9.9` remains available for additional tester feedback and small features toward `2.0.0`.

---

## Current State

- `main` contains the accumulated `1.8.x` hardening, the `1.9.x` workflow/archive/testing/performance work, and the promoted `1.9.7` OpenClaw runtime stabilization line as the current stable baseline.
- The `1.8.x` work is intentionally focused on hardening, simplification, regression safety, lightweight responsiveness wins, and backlog hygiene rather than major new feature scope.
- Dashboard, CI, container images, cloud, and on-prem paths now use the same tested OpenClaw `2026.6.11` baseline, promoted in `1.9.7` after the `rc22` gate.
- The release workflow now uses explicit versioned RC tags such as `1.9.2-test-rc1`, and promotion consumes those exact validated artifacts into official version tags.
- RC image dispatch must use an advertised branch or tag ref such as `main` or `refs/tags/v1.9.3`, not a raw commit SHA. The workflow now rejects bare SHAs up front and relies on the run `headSha` for exact source traceability.
- Partner integrations are active product surfaces, including Resend, Cognee, Opik, GitHub, Senso, and partner plugin install/uninstall handling.
- Resend has both dashboard test-email validation and first-party `clawmax-resend` agent-tool execution with runtime-secret support.
- Cognee has a first-pass partner surface for cloud/self-hosted configuration and official OpenClaw plugin lifecycle management.
- The latest full local integration run is green with `--with-validation --coverage`: `386/386`, with `77.52%` statements/lines, `68.03%` branches, and `88.42%` functions. Direct chat and the `openai/gpt-4o-mini` performance sample both completed through BYOK.

## Active Release Track

- Branch: `main`
- Plans:
  - [planning/HARDENING_SIMPLIFICATION_1_8_X.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/HARDENING_SIMPLIFICATION_1_8_X.md)
  - [planning/SIMPLIFY_OPTIMIZE_1_8_X.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_OPTIMIZE_1_8_X.md)
  - [planning/archive/SIMPLIFY_HARDEN_OPTIMIZE_1_9_1.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/archive/SIMPLIFY_HARDEN_OPTIMIZE_1_9_1.md)
  - [planning/archive/SIMPLIFY_HARDEN_OPTIMIZE_1_9_2.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/archive/SIMPLIFY_HARDEN_OPTIMIZE_1_9_2.md)
  - [planning/archive/SIMPLIFY_HARDEN_OPTIMIZE_1_9_3.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/archive/SIMPLIFY_HARDEN_OPTIMIZE_1_9_3.md)
  - [planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_4.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_4.md)
  - [planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_5.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_5.md)
  - [planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_6.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_6.md)
  - [planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_7.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_7.md)
  - [planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_8.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_8.md)
  - [planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_9.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_9.md)
- Near-term target: collect `1.9.7` feedback from Mike and other testers, reproduce issues against the exact stable image, and cut `1.9.8-test-rc1` only when focused fixes are ready.
- Keep `1.9.8` feedback-first, but accept small independently testable features that support the path to `2.0.0`; use `1.9.9` for the next bounded follow-through rather than overloading one release.
- Keep OpenClaw pinned to `v2026.6.11` during the feedback window unless an upstream change is isolated and validated separately.

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- active backlog: [BACKLOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/BACKLOG.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/RELEASE_CHECKLIST.md)
