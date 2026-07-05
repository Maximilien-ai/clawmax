# ClawMax Status

**Current Version**: v1.9.5
**Last Updated**: July 5, 2026
**Status**: `v1.9.5` is the current promoted stable release. `main` has now moved onto the `1.9.6` line for the OpenClaw `v2026.6.11` update plus the next builder/template consistency and handoff follow-through.

---

## Current State

- `main` now contains the first `1.8.x` hardening pass, the `1.8.2` simplify/optimize slice, the `1.8.3` Add Agent regression fixes, the `1.8.4` agent delete UI cleanup, the `1.8.5` DocHub/notification polish pass, the `1.8.6` and `1.8.7` follow-through slices, the `1.8.8` template/workflow hardening pass, the `1.8.9` auth/runtime/chat stability pass, the `1.9.0` workflow/thread/archive/operator hardening follow-through, and the promoted `1.9.1` stabilization line as the current stable baseline.
- The `1.8.x` work is intentionally focused on hardening, simplification, regression safety, lightweight responsiveness wins, and backlog hygiene rather than major new feature scope.
- Dashboard, CI, container images, cloud, and on-prem paths now use the same tested OpenClaw `2026.6.11` baseline on the active `1.9.6` line.
- The release workflow now uses explicit versioned RC tags such as `1.9.2-test-rc1`, and promotion consumes those exact validated artifacts into official version tags.
- RC image dispatch must use an advertised branch or tag ref such as `main` or `refs/tags/v1.9.3`, not a raw commit SHA. The workflow now rejects bare SHAs up front and relies on the run `headSha` for exact source traceability.
- Partner integrations are active product surfaces, including Resend, Cognee, Opik, GitHub, Senso, and partner plugin install/uninstall handling.
- Resend has both dashboard test-email validation and first-party `clawmax-resend` agent-tool execution with runtime-secret support.
- Cognee has a first-pass partner surface for cloud/self-hosted configuration and official OpenClaw plugin lifecycle management.
- The latest reported full local integration run on the active `1.9.6` branch head is green with `--with-validation --coverage`, including the expanded `384`-lane wrapper baseline and measured coverage of `77.54%` statements/lines, `67.53%` branches, and `88.82%` functions.

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
- Near-term target: validate `1.9.6-test-rc1` on cloud and on-prem using the updated OpenClaw baseline.
- `1.9.6` scope now includes the OpenClaw `v2026.6.11` upgrade, pin-alignment coverage across helper/Docker/CI, and reduced runtime config churn from no-op model saves.
- Next likely follow-through inside `1.9.6`: builder/template consistency investigation plus workflow handoff correctness and visual handoff inspectability.
- `1.9.5` is now the stable baseline for the perf artifacts and customer-facing custom-skill ZIP upload flow.

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- active backlog: [BACKLOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/BACKLOG.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/RELEASE_CHECKLIST.md)
