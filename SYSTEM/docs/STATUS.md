# ClawMax Status

**Current Version**: v1.9.7
**Development Lines**: 1.9.8 / 1.9.9 and 2.0.0
**Last Updated**: July 15, 2026
**Status**: `v1.9.7` is the promoted stable release on OpenClaw `v2026.6.11`. `main` is validating the `1.9.8` bounded feature batch, `1.9.9` is reserved for additional tester-driven follow-through, and `release-2.0.0` owns the major declarative plugin-platform work.

---

## Current State

- `main` contains the completed `1.8.x` hardening, the accumulated `1.9.x` workflow/archive/testing/performance work, and the promoted `1.9.7` OpenClaw runtime stabilization line as the current stable baseline.
- Dashboard, CI, container images, cloud, and on-prem paths now use the same tested OpenClaw `2026.6.11` baseline, promoted in `1.9.7` after the `rc22` gate.
- `1.9.8-test-rc2` carries the first bounded feature batch plus the container plugin-environment precedence fix; it does not include the new v2 plugin contract.
- `release-2.0.0` is based on current `main` and contains the first generic `clawmax.ai/v2` manifest, record, template, storage, and declarative UI contract.
- The public 2.0 repository provides only the generic host and synthetic contract fixtures. Private plugins are loaded from external deployment paths, explicitly enabled, and never bundled in the default image.
- The release workflow now uses explicit versioned RC tags such as `1.9.2-test-rc1`, and promotion consumes those exact validated artifacts into official version tags.
- RC image dispatch must use an advertised branch or tag ref such as `main` or `refs/tags/v1.9.3`, not a raw commit SHA. The workflow now rejects bare SHAs up front and relies on the run `headSha` for exact source traceability.
- Partner integrations are active product surfaces, including Resend, Cognee, Opik, GitHub, Senso, and partner plugin install/uninstall handling.
- Resend has both dashboard test-email validation and first-party `clawmax-resend` agent-tool execution with runtime-secret support.
- Cognee has a first-pass partner surface for cloud/self-hosted configuration and official OpenClaw plugin lifecycle management.
- The latest full local integration run is green with `--with-validation --coverage`: `386/386`, with `77.52%` statements/lines, `68.03%` branches, and `88.42%` functions. Direct chat and the `openai/gpt-4o-mini` performance sample both completed through BYOK.

## Active Release Tracks

### 1.9.x maintenance and bounded features

- Branch: `main`
- Plans: [1.9.8](planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_8.md) and [1.9.9](planning/SIMPLIFY_HARDEN_OPTIMIZE_1_9_9.md)
- Near-term target: finish `1.9.8` validation and collect tester feedback without introducing a partial 2.0 contract.
- Keep OpenClaw pinned to `v2026.6.11` during the feedback window unless an upstream change is isolated and validated separately.

### 2.0.0 plugin platform

- Branch: `release-2.0.0`
- Architecture: [Plugin System 2.0](../../PLUGINS/PLUGIN_SYSTEM_2_0.md)
- Authoring contract: [Plugin Authoring 2.0](../../PLUGINS/PLUGIN_AUTHORING_2_0.md)
- Current scope: generic declarative manifests, records, templates, storage, list/detail/editor presentation, explicit enablement, compatibility checks, and zero-plugin operation.
- Remaining release work: host-mediated actions and permissions, external packaging across local/cloud/on-prem, actionable plugin health diagnostics, legacy adapter removal, and complete release validation.

## Release References

- changelog: [CHANGELOG.md](../../CHANGELOG.md)
- latest release notes: [README.md](../../README.md)
- active backlog: [BACKLOG.md](BACKLOG.md)
- testing guide: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- historical plans: [planning/archive/](planning/archive/)
