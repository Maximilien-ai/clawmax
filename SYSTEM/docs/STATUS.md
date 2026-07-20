# ClawMax Status

**Current Version**: v1.9.8
**Development Line**: 1.9.9
**Last Updated**: July 20, 2026
**Status**: `v1.9.8` is promoted from `1.9.8-test-rc5`. `main` is the active `1.9.9` line with native OpenRouter, native runtime-gated xAI/Grok, the first complete brokered agent-skill secret slice, and RC4 feedback fixes for pinned OpenAI model aliases, long chat tool runs, and Gmail secret-boundary guidance. These fixes target RC6 after RC5's xAI build. `2.0.0` owns the public plugin, AI-scoring, Gmail, and Microsoft 365 partner surfaces; deployments can add private enterprise capabilities through the same public extension contracts.

---

## Current State

- `main` contains the accumulated `1.8.x` hardening, the `1.9.x` workflow/archive/testing/performance work, and promoted `1.9.8` as the current stable baseline.
- The `1.8.x` work is intentionally focused on hardening, simplification, regression safety, lightweight responsiveness wins, and backlog hygiene rather than major new feature scope.
- Dashboard, CI, container images, cloud, and on-prem paths now use the same tested OpenClaw `2026.6.11` baseline, promoted in `1.9.7` after the `rc22` gate.
- The release workflow now uses explicit versioned RC tags such as `1.9.2-test-rc1`, and promotion consumes those exact validated artifacts into official version tags.
- RC image dispatch must use an advertised branch or tag ref such as `main` or `refs/tags/v1.9.3`, not a raw commit SHA. The workflow now rejects bare SHAs up front and relies on the run `headSha` for exact source traceability.
- Partner integrations are active product surfaces, including Resend, Cognee, Opik, GitHub, Senso, and partner plugin install/uninstall handling.
- Resend has both dashboard test-email validation and first-party `clawmax-resend` agent-tool execution with runtime-secret support.
- Cognee has a first-pass partner surface for cloud/self-hosted configuration and official OpenClaw plugin lifecycle management.
- The latest full local integration run is green with `--with-validation --coverage`: `401/401`, with `78.27%` statements/lines, `68.10%` branches, and `89.14%` functions. Direct chat and workflow execution both completed through BYOK.

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
  - [planning/PUBLIC_OPTIMIZE_PLUGIN_2_0.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/PUBLIC_OPTIMIZE_PLUGIN_2_0.md)
  - [planning/PUBLIC_PLUGIN_ARCHITECTURE_2_0.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/PUBLIC_PLUGIN_ARCHITECTURE_2_0.md)
- Near-term target: validate native OpenRouter, native xAI, and the brokered skill-secret flow with real local/container execution using the persistent RC checklist. The pinned runtime supports the `xai/...` provider and the curated Grok fallback catalog, but not Grok 4.5; that model remains gated on a future runtime proof.
- Replace the guardrail/eval-shaped MVP0 host with a generic public 2.0 plugin contract. Plugins can contribute any combination of dashboard/runtime capabilities; guardrails and evaluations are implementations, not host-level plugin types.
- Build public AI scoring as part of `2.0.0` on top of that generic plugin architecture. Keep proprietary guardrail and evaluation implementations outside the public repository and default image.
- Build the public Optimize plugin for `2.0.0`: token-first workflow/agent accounting, derived costs with pricing provenance, constrained model and schedule recommendations, workflow-scoped overrides, and reversible application.
- Build Gmail and Microsoft 365/Outlook as public curated `2.0.0` partner plugins: read/search/draft first, explicit grants and confirmation for send or destructive actions, and no normal mailbox passwords.
- Keep OpenClaw pinned to `v2026.6.11` during the feedback window unless an upstream change is isolated and validated separately.

## Release References

- changelog: [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- latest release notes: [README.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/README.md)
- active backlog: [BACKLOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/BACKLOG.md)
- testing guide: [TESTING_GUIDE.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/RELEASE_CHECKLIST.md)
