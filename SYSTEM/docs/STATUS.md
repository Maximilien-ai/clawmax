# ClawMax Status

**Current Version**: v1.9.9
**Development Line**: 2.0.0
**Last Updated**: August 17, 2026
**Status**: `v1.9.9` remains stable. `2.0.0-test-rc39` is the next hands-on validation candidate, combining the green RC38 baseline with resolved dashboard reliability reports and truthful plugin advisory behavior. OpenClaw remains pinned to `v2026.6.34`.

---

## Current State

- Stable `v1.9.9` deployments use OpenClaw `v2026.6.11`. The 2.0 RC39 source candidate retains the isolated and validated OpenClaw `v2026.6.34` baseline from RC37.
- `v1.9.9` includes native OpenRouter and xAI/Grok, brokered agent-skill secrets, scoped Keys & Secrets navigation, mobile-safe workflow runs, pinned OpenAI model compatibility, and clearer long-running tool feedback.
- The latest 1.9.9 local integration/validation run passed `401/401`, with `78.29%` statements/lines, `68.15%` branches, and `89.15%` functions. Direct chat and workflow execution completed through `openai/gpt-5.4-mini`.
- The promoted image passed amd64 and arm64 verification, manifest publication, and registry smoke.
- The first generic `clawmax.ai/v2` declarative plugin contract is merged into `main`. It supports generic manifests, records, templates, storage, declarative UI, explicit enablement, compatibility checks, and zero-plugin operation.
- System & Logs and `/api/plugins/diagnostics` now retain and explain loaded, disabled, invalid, incompatible, duplicate, and missing plugin outcomes instead of silently hiding discovery failures.
- Plugin host capabilities are now deny-by-default: explicit document and notification operations return actionable `403` responses without a grant, and plugin workspace context is filtered across agent, workflow, group, and community access.
- Local test runs and test images enable synthetic plugin fixtures. RC7 adds the cumulative public Review checklist, plugin layout parity, mobile navigation containment, and local plugin enablement. Stable image promotion clears non-product test fixtures.
- The current development tree includes browser-persisted plugin ordering, an instance plugin manager, persistent per-plugin views, release-review export, richer Lifecycle X-rays, AI creation handoffs, shared AI editor regression coverage, workspace dashboard editing, and consent-aware activity-sharing controls.
- Lifecycle and Review are the public product plugins in the current 2.0 phase. Evals, Guardrails, and Optimize are private enterprise plugins. Public and private plugins use the same host contract. First-party private plugin source and combined-image packaging are consolidated in the private `clawmax-plugins` monorepo; partner or customer plugins may remain separately owned. Private source remains outside the public repository and image. The public `plugin-*` directories are synthetic contract fixtures only.
- Gmail and Microsoft 365 now have bounded list/search/read/draft capabilities, encrypted OAuth persistence, production identity adapters, persisted agent/plugin grants, runtime invocation, a Partner connect/manage surface, and draft-only Gmail/Graph mailbox adapters. Raw scopes and header injection fail closed; no send operation is exposed. Automated fake-OAuth, runtime, UI, and container validation is green; real-provider test-account validation remains pending.
- The 2.0 source security review is complete at reviewed code `79262f35`: no Critical findings, all eight High findings fixed, one Medium fixed, and three Medium deployment/supply-chain risks formally accepted through September 30 follow-ups. RC39 retains those controls and adds the network-exposure, chat, workflow, partial-data, and advisory-behavior regressions reported after RC38. Final RC39 image digests and cloud/on-prem/runtime evidence remain release gates.

## Active Release Tracks

### 1.9.9 maintenance

- Branch: `release-1.9.9`
- Tag: `v1.9.9`
- Image: `ghcr.io/maximilien-ai/clawmax-dashboard:1.9.9`
- Policy: accept only reproducible release-blocking hotfixes; validate any hotfix as a new RC before promotion.
- Runtime: keep OpenClaw pinned to `v2026.6.11` unless an upstream change is isolated and validated separately.

### 2.0.0 development

- Branch: `main`
- Current source candidate: `2.0.0-test-rc39` at the focused Praveen-regression release commit; exact source SHA and CI/image links will be recorded after the candidate gates complete. The pre-release checkpoint passed the complete local integration, validation, coverage, and live-execution gate `457/457`, with `80.95%` statements/lines, `68.98%` branches, and `91.22%` functions; [main CI also passed](https://github.com/Maximilien-ai/clawmax/actions/runs/32057609656).
- Current source candidate: `2.0.0-test-rc38` at public source `96f9a9cd`. The exact source [CI gate passed](https://github.com/Maximilien-ai/clawmax/actions/runs/31701168347). The public amd64/arm64 build, packaged identity, manifest, and registry smoke passed in [run 31703413303](https://github.com/Maximilien-ai/clawmax/actions/runs/31703413303); the manifest digest is `sha256:c0f2a9ed254b4eeafb3f76661ec2c936bc0f0ccbc6574458aa76225c6ac7c9f5`.
- Current source candidate: `2.0.0-test-rc37` at public source `156a82ab`. Main CI and the full local integration, validation, coverage, and live-execution gate passed `443/443`. The public amd64/arm64 build, packaged identity, manifest, and registry smoke passed in [run 31532184904](https://github.com/Maximilien-ai/clawmax/actions/runs/31532184904). The authorized combined image also passed its private multi-architecture acceptance gates; detailed evidence remains in the private repository.
- RC37 recovery: public source `6be670b5` adds one bounded fresh-session retry for OpenClaw embedded session conflicts in chat and workflows, plus client retention of the recovered chat session. Focused chat, agent-execution, workflow, route, TypeScript, and production-build checks pass.
- Hands-on review candidate: `2.0.0-test-rc39` after its exact source and image gates pass. Its focused Review set contains three end-to-end journeys for agent discovery/details, long-running chat, and workflow lifecycle behavior. Deterministic checks remain engineering-owned; RC38 criteria are preserved as historical evidence rather than carried forward as unfinished tester work. Private product-plugin acceptance remains in the private repository.
- RC37 runtime: OpenClaw `v2026.6.34` remains integrated on `main`. The source and image gates passed on both architectures with automatic embedded-session recovery enabled.
- The RC37 local gate retained `80.24%` statements/lines, `68.65%` branches, and `90.41%` functions.
- Post-RC37 RC38 hardening enforces credentialed CORS allowlists, cloud bypass rejection, complete route authorization, random-token shared dashboards, bounded ZIP extraction, argument-vector subprocesses, response security headers, and an exception-free zero-vulnerability dependency gate. The complete integration, validation, coverage, and live-execution gate passed `447/447` at `976c3c83`, with `80.51%` statements/lines, `68.65%` branches, and `90.58%` functions; [main CI also passed](https://github.com/Maximilien-ai/clawmax/actions/runs/31615940283). RC38 source and image gates are green; hands-on cloud/on-prem and real-provider review remains open.
- Release week plan: [RELEASE_2_0_0_WEEK_2026-08-10.md](planning/RELEASE_2_0_0_WEEK_2026-08-10.md). Final promotion still requires the security exit criteria, product-plugin acceptance, cloud/on-prem restart/runtime checks, a final immutable multi-architecture candidate, and a completed Review export.
- Architecture: [Plugin System 2.0](../../PLUGINS/PLUGIN_SYSTEM_2_0.md)
- Authoring contract: [Plugin Authoring 2.0](../../PLUGINS/PLUGIN_AUTHORING_2_0.md)
- Generic architecture plan: [PUBLIC_PLUGIN_ARCHITECTURE_2_0.md](planning/PUBLIC_PLUGIN_ARCHITECTURE_2_0.md)
- Lifecycle plan: [PUBLIC_LIFECYCLE_PLUGIN_2_0.md](planning/PUBLIC_LIFECYCLE_PLUGIN_2_0.md)
- Mail/provider plan: [PUBLIC_MODELS_GATEWAYS_EMAIL_2_0.md](planning/PUBLIC_MODELS_GATEWAYS_EMAIL_2_0.md)
- Activity Export/partner plan: [PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md](planning/PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md)
- Release security gate: [SECURITY_AUDIT_2_0.md](planning/SECURITY_AUDIT_2_0.md)
- RC15 security baseline: [SECURITY_BASELINE_2_0_RC15.md](security/SECURITY_BASELINE_2_0_RC15.md)
- RC38 source security report: [SECURITY_REVIEW_2_0_RC38.md](security/SECURITY_REVIEW_2_0_RC38.md)
- Public prompt-readiness scoring: [PROMPT_READINESS_SCORING.md](features/PROMPT_READINESS_SCORING.md)
- Public model-fit foundation: [PUBLIC_MODEL_FIT_2_0.md](planning/PUBLIC_MODEL_FIT_2_0.md)
- Score review and confirmed improvement actions: [PUBLIC_SCORE_ACTIONS_2_0.md](planning/PUBLIC_SCORE_ACTIONS_2_0.md)
- Immediate public work: complete RC39 public and authorized combined image gates, obtain Praveen's hands-on verification, finish cloud/on-prem runtime evidence, and reconcile manifest-declared actions with the supported 2.0 boundary.
- Product work: public AI scoring, Lifecycle, Review, curated public Gmail and Microsoft 365/Outlook integrations, and a consent-gated Activity Export contract proven first with ClawMax.ai and then Digo. Evals, Guardrails, and Optimize continue in the private enterprise suite.
- Plugins remain domain-neutral. Guardrails and evaluations are possible implementations, not fixed host-level plugin types.

## Release References

- changelog: [CHANGELOG.md](../../CHANGELOG.md)
- latest release notes: [README.md](../../README.md)
- active backlog: [BACKLOG.md](BACKLOG.md)
- known issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- testing guide: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- historical plans: [planning/archive/](planning/archive/)
