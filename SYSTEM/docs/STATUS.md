# ClawMax Status

**Current Version**: v1.9.9
**Development Line**: 2.0.0
**Last Updated**: July 24, 2026
**Status**: `v1.9.9` is promoted unchanged from `1.9.9-test-rc6`. `main` now owns the public 2.0 plugin platform, AI scoring, Optimize, Gmail, and Microsoft 365 work. `release-1.9.9` is retained only for release-blocking hotfixes.

---

## Current State

- Dashboard, CI, container images, cloud, and on-prem paths use the tested OpenClaw `v2026.6.11` baseline.
- `v1.9.9` includes native OpenRouter and xAI/Grok, brokered agent-skill secrets, scoped Keys & Secrets navigation, mobile-safe workflow runs, pinned OpenAI model compatibility, and clearer long-running tool feedback.
- The latest 1.9.9 local integration/validation run passed `401/401`, with `78.29%` statements/lines, `68.15%` branches, and `89.15%` functions. Direct chat and workflow execution completed through `openai/gpt-5.4-mini`.
- The promoted image passed amd64 and arm64 verification, manifest publication, and registry smoke.
- The first generic `clawmax.ai/v2` declarative plugin contract is merged into `main`. It supports generic manifests, records, templates, storage, declarative UI, explicit enablement, compatibility checks, and zero-plugin operation.
- System & Logs and `/api/plugins/diagnostics` now retain and explain loaded, disabled, invalid, incompatible, duplicate, and missing plugin outcomes instead of silently hiding discovery failures.
- Plugin host capabilities are now deny-by-default: explicit document and notification operations return actionable `403` responses without a grant, and plugin workspace context is filtered across agent, workflow, group, and community access.
- Local test runs and test images enable synthetic plugin fixtures. RC7 adds the cumulative public Review checklist, plugin layout parity, mobile navigation containment, and local plugin enablement. Stable image promotion clears non-product test fixtures.
- The current development tree adds browser-persisted plugin ordering with Review last by default, persistent per-plugin views, and release-review export with reviewer, instance, checklist, evidence, and sanitized recent-error context. These changes passed the full `413/413` local integration, validation, and coverage gate and have not yet been tagged as RC8.
- Review and Optimize are the public product plugins in the current 2.0 phase. Public and private plugins use the same host contract, but all other plugin source, content, credentials, distribution, and production enablement remain in their owning private repositories and outside the public image. The public `plugin-lab-*` directories are synthetic contract fixtures only.

## Active Release Tracks

### 1.9.9 maintenance

- Branch: `release-1.9.9`
- Tag: `v1.9.9`
- Image: `ghcr.io/maximilien-ai/clawmax-dashboard:1.9.9`
- Policy: accept only reproducible release-blocking hotfixes; validate any hotfix as a new RC before promotion.
- Runtime: keep OpenClaw pinned to `v2026.6.11` unless an upstream change is isolated and validated separately.

### 2.0.0 development

- Branch: `main`
- Current test candidate: `2.0.0-test-rc7`; RC8 is intentionally deferred until the current local plugin navigation and Review export changes complete manual validation.
- Architecture: [Plugin System 2.0](../../PLUGINS/PLUGIN_SYSTEM_2_0.md)
- Authoring contract: [Plugin Authoring 2.0](../../PLUGINS/PLUGIN_AUTHORING_2_0.md)
- Generic architecture plan: [PUBLIC_PLUGIN_ARCHITECTURE_2_0.md](planning/PUBLIC_PLUGIN_ARCHITECTURE_2_0.md)
- Optimize plan: [PUBLIC_OPTIMIZE_PLUGIN_2_0.md](planning/PUBLIC_OPTIMIZE_PLUGIN_2_0.md)
- Mail/provider plan: [PUBLIC_MODELS_GATEWAYS_EMAIL_2_0.md](planning/PUBLIC_MODELS_GATEWAYS_EMAIL_2_0.md)
- Activity Export/partner plan: [PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md](planning/PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md)
- Immediate work: reconcile the declarative v2 contract with the generic contribution model; add manifest-declared custom actions, error isolation, and external packaging validation on top of the enforced host capabilities.
- Product work: public AI scoring, public token-first Optimize, curated public Gmail and Microsoft 365/Outlook plugins, and a consent-gated Activity Export contract proven first with ClawMax.ai and then Digo.
- Plugins remain domain-neutral. Guardrails and evaluations are possible implementations, not fixed host-level plugin types.

## Release References

- changelog: [CHANGELOG.md](../../CHANGELOG.md)
- latest release notes: [README.md](../../README.md)
- active backlog: [BACKLOG.md](BACKLOG.md)
- known issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- testing guide: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- historical plans: [planning/archive/](planning/archive/)
