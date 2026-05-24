# Backlog

> Last updated: May 21, 2026
> Completed and verified work is archived into [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md) and historical notes under `SYSTEM/docs/**/archive/`

## Top Priority

- [ ] **Template audit for lane/subdirectory assumptions** — audit organization and workflow templates for the same class of bug seen in CW reruns: hidden/helper dirs being treated as work items, ambiguous lane ownership, weak filesystem verification, or success reporting that does not re-check on-disk outputs. Prioritize templates that scan subdirectories, split work across multiple agents, or rely on reruns/idempotent regeneration. GitHub: `#132`
- [ ] **Template markdown integrity manifest / checksum follow-through** — explore adding a lightweight integrity marker to exported `TEMPLATE.md` / agent template markdown (for example a hash over canonicalized sections or per-section checksums) so import can detect lossy edits, broken round-trips, or missing agent/workflow blocks before save/apply. Keep this generic: the goal is not to block legitimate user edits by default, but to warn clearly when markdown no longer matches a structurally sound template payload.
- [ ] **Tessl registry hardening (experimental)** — improve install guidance for Tessl security-review blockers, continue validating real OpenClaw-compatible tiles, and decide what “supported” vs. “exploratory” means before promoting Tessl beyond experimental. GitHub: `#134`
- [ ] **Workspace auto-switch watch item** — likely fixed via request-local workspace context, but keep tracking until it survives more real multi-workspace/shared-dashboard usage without silent active-workspace drift.
- [ ] **Secret readiness follow-through** — extend template/workflow readiness checks so secret requirements report richer missing/present/degraded states before apply or run. GitHub: `#133`
- [ ] **OTP log-mode safety follow-through** — once real email OTP delivery is stable in cloud, treat `OTP_DEV_MODE=log` as explicit test/debug-only behavior: add a visible UI warning when enabled, document that production instances should leave it unset, and verify it is disabled on normal customer/demo environments after live debugging is complete.
- [ ] **Phantom workflow/company residue after archive/delete + reapply** — deleting or archiving generated companies must not leave stale agents, agent files, teams, workflows, dashboards, outputs, or execution artifacts that block reapply or show as "phantom" org/workflow state. Treat as a 1.4.0 release blocker until company delete/reapply is deterministic.
- [ ] **Multi-workflow/company apply conflict follow-through** — repeated applies into the same workspace can still surface workflow-level collisions, stale agent IDs, or hierarchy reuse behavior that is not fully detected/resolved during template apply. Capture crisp repros and tighten conflict preflight plus rename/remap behavior for overlapping company/workflow names.
- [ ] **Gateway-down usage polling and runtime fallback are noisy/confusing** — dashboard repeatedly logs `Gateway WebSocket error: connect ECONNREFUSED 127.0.0.1:18789` when the gateway is unavailable, and the user-facing behavior around fallback/local execution is still unclear. This likely overlaps with the known gateway process-management problem and should be treated as core runtime reliability work.
- [ ] **Cloud/runtime gateway should be managed as a durable service, not a manual desktop command** — in managed/cloud instances the gateway needs to be started and kept alive by the runtime itself (container entrypoint, startup supervisor, platform process config, or equivalent), not by browser-triggered fixes or desktop instructions. Evaluate the cleanest production path, likely platform/container-native supervision rather than ad hoc local commands, and make Doctor verify that durable runtime path instead of teaching users to launch it manually.
- [ ] **Cloud GitHub integration follow-through** — first pass shipped: cloud/hosted runtimes can now report GitHub readiness from a runtime `GITHUB_TOKEN` / `GH_TOKEN` plus a default repo, while local/dev and on-prem keep the `gh` CLI path. Remaining work is stronger API-backed verification, better token diagnostics, and eventual GitHub App/OAuth-grade cloud auth so cloud does not rely on CLI semantics at all.
- [ ] **BYOK / Partners wizard should stay in sync across mounted instances** — the top-bar `BYOK` and `Partners` entrypoints mount separate wizard instances, so browser-local storage updates can drift and show stale keys/readiness if the wizard does not resync after vault writes. Keep the browser-vault event-driven refresh path tested so saved keys persist visibly and readiness pills update immediately.
- [ ] **Workspace switch correctness/performance follow-through** — workspace activation now returns faster and mounted tabs reset more cleanly, but keep watching for stale cross-workspace state in Activity/Budget, agents, templates, docs, and workflow surfaces until repeated real-world switching proves the fix is fully stable.
- [ ] **Activity/Budget can still under-report local workspace token/cost totals after fresh runs** — some new/local workspaces still show real call counts with `0.0k` tokens and `$0.00` cost even after agent chats succeed, which means tracing, usage extraction, or aggregation is still not fully aligned in the local metering path.
- [ ] **Cloud image must ship built OpenClaw runtime, not raw source or fixtures** — the original fixture-runtime blocker was identified in the CLI cloud build path, and the current follow-up blocker is that cloud now installs real OpenClaw source without built `dist/entry.(m)js` output. Canonical Docker fix pushed in commit `23aaf52`; keep this open until the rebuilt image is validated live.
- [ ] **Replace ad hoc Docker OpenClaw packaging with a cleaner canonical install path** — current cloud stabilization uses an in-image build/package path for the pinned OpenClaw runtime. After cloud is healthy, replace that with a more explicit release artifact or canonical upstream distribution flow so runtime packaging is easier to reason about and less fragile.
- [ ] **Plan and test OpenClaw upgrade to latest after cloud runtime stabilizes** — once the pinned runtime path is healthy in cloud, schedule a deliberate upgrade pass from the current tested OpenClaw ref to latest, with explicit validation for gateway startup, agent creation, skills loading, and workflow execution.
- [ ] **Keep OpenClaw currency current after 1.4.0** — add a short recurring release-engineering pass to check the tested OpenClaw ref against current upstream, decide whether to pin newer, and validate gateway startup, agent creation, skills, BYOK execution, and workflow execution before the next tagged release.
- [ ] **Audit additional runtime tool packaging for built-in skills** — after cloud runtime stabilizes, review whether the base image should also package `bash`, `zip`, `unzip`, `tar`, `gzip`, and `file`/`less` for common agent skill flows without over-expanding image size.
- [ ] **Dangerous skill review and guardrails** — during security review, study known dangerous-skill patterns (for example [gricha/dangerous-skills](https://github.com/gricha/dangerous-skills)) and also review higher-quality public skill repos (for example `getsentry/skills`) to separate good patterns from risky ones; add guardrails so imported or AI-created skills cannot quietly introduce obviously dangerous behavior without explicit user review and warnings.
- [ ] **Cloud agent runtime still needs live validation after image rebuild** — fixture responses should be gone, but cloud must still be rechecked end-to-end after the rebuilt image lands: one agent chat, Skills page, Doctor output, and `openclaw --version`.
- [ ] **Cloud Skills page can be empty even when workspace has agents** — live cloud audit confirmed `~/.openclaw/openclaw.json` is missing while workspace agent files exist under `/workspace/AGENTS`, so skill discovery has no real runtime registration state to read.
- [ ] **Cloud logs pane still churns on reconnecting** — the logs/Doctor surface still shows repeated reconnect behavior on cloud instances, which makes diagnosis noisy and likely reflects unresolved websocket/log-stream stability issues.
- [ ] **CLI cloud publish workflow stages fixture OpenClaw into production image** — `clawmax-cli` cloud image publishing currently stages `.ci/fixtures/openclaw` into the build context for the dashboard image. That fixture contains the fake `openclaw.mjs`, so the published cloud image can never run real agent sessions until the workflow/build source is switched to a real OpenClaw checkout or release artifact.
- [ ] **Local-model chat quality and progress signaling** — local models such as `ollama/qwen...` now appear to execute, but direct/group chat still degrades on simple instruction-following (`MODEL_CHECK`), response latency is much slower, and typing/progress indication is misleading because agents appear idle for long gaps before dumping a full reply. Needs prompt/runtime tuning plus better in-product progress feedback for slower local models.
- [ ] **Group communications workflow can partially fail even when DAG is green** — test workflows can report overall success while one or more participants fail to post back into the target group/channel (`COMMS FAIL`), which makes workflow status misleading and hides real coordination failures. Need to audit per-participant channel-send error handling and workflow success criteria.
- [ ] **Shared live thread visibility during workflow runs is limited** — participants in the same workflow run do not reliably see each other's replies live inside their own execution context. The system test prompt is being adjusted to validate supported dashboard-backed thread posting, but true live shared-thread visibility remains an open runtime limitation if we want agents to reason over peer replies during the same run.
- [ ] **System test diagnostics should surface upstream model/quota failures before downstream step failures** — a cloud system-test run can appear to fail on later stages like GitHub even when the real blocker is an earlier LLM/provider quota/auth rejection. Tighten workflow/test result surfacing so upstream model failures are obvious and downstream stage noise is de-emphasized.
- [ ] **ClawMax Doctor: Restart Gateway action** — add an in-product `openclaw gateway restart` action when gateway is configured but not running, so users can recover skills/chat capability without leaving the UI
- [ ] **Native gateway usage polling / scope cleanup** — dashboard `sessions.usage` polling is currently disabled in favor of Opik-backed metering because the gateway path requires scopes like `operator.read` and creates repeated log noise. Revisit only if we need native gateway usage stats again.
- [ ] **Template apply tool readiness probes** — extend the new pre-apply readiness step with per-skill / per-tool checks so users can see whether assigned tools are actually usable before deploying a team
- [ ] **Event planning template customer validation** — keep collecting real event-planning feedback on the refined templates and capture any further domain-specific tweaks separately from the shipped `#95` engineering pass.
- [ ] **Notification burst grouping / deduplication** — collapse near-identical notification bursts (for example multiple agents updating the same file class during one workflow window) into grouped summaries like `4 agents updated MEMORY.md`, with optional drill-down into the underlying per-agent events. Prioritize workflow-result, workspace-artifact, and repeated agent-status notifications so the feed becomes a summary surface instead of a noisy event log.
- [ ] **Senso and external artifact result notifications** — file artifacts and GitHub issue/PR links now surface into `Results`, but Senso outputs and other external result types still need first-class notification hooks plus dashboard surfacing so users can see all meaningful agent outputs in one place.
- [ ] **First-run onboarding wizard follow-through** — the initial wizard should grow from simple route guidance into a richer setup flow: detect BYOK readiness, offer OpenClaw agent import vs. create-team paths, suggest templates by category/use case, and disappear automatically once the workspace is meaningfully initialized.
- [ ] **Workflow customization form parity follow-through** — keep auditing template apply / workflow customization field handling so dropdowns, textareas, and other structured run-input fields always persist into workflow markdown/overrides correctly and do not trip false required-field validation.
- [ ] **Doctor messaging copy polish for managed runtimes** — the new managed-runtime guidance is directionally correct, but copy like “disabled in this Linux instance runtime” is still too broad. Tighten wording so it points at the managed runtime/supervision model, not Linux itself.
- [ ] **Template-guided onboarding** — onboarding should collect lightweight signals like category, focus, and free-form intent, then recommend a short list of best-fit templates using metadata + semantic matching + iterative AI suggestion.

## Hack / Research

- [ ] **AI Generate outputs TEMPLATE.md** — generate markdown format from wizard
- [ ] **Wizard exports as TEMPLATE.md** — download/save as markdown
- [ ] **Rate limit notification** — surface API rate limits as warning notifications with retry suggestion
- [ ] **Bulk import/export for OpenClaw agents** — multiple agents at once
- [ ] **Result artifact standardization** — selected templates should produce consistent visible outputs, not just chat traces
- [ ] **Template breadth publication** — publish additional non-showcase template specs after the selected flows stabilize
- [ ] **Demo / research hardening** — re-run high-value template flows end-to-end without manual unblocks and keep runtime mismatches visible

## Active Product Work

### Templates & Discovery
- [ ] **Template feedback, ratings, and promotion flow** — let users review proposal templates, submit feedback, and promote well-performing templates from idea/proposal status into more trusted catalog tiers.
- [ ] **Template upgrade / reapply-over-existing flow** — support upgrading a workspace that already applied a template when the template changes later; compare the current workspace against the newer template, show likely conflicts plus likely safe updates, and guide the user through update vs. replace decisions instead of forcing manual delete + reapply.
- [ ] **Surface old template versions in the UI** — template saves already archive prior versions on disk under `.versions/`; add a lightweight “Previous versions” surface so users can inspect older versions, compare against the current one, and optionally restore or copy content from an earlier snapshot.
- [ ] **Small-business marketing template pack** — create suggested starter templates for marketing planning and budget allocation across Instagram, Facebook, YouTube, and Google News/Ads, including audience focus, budget planning, and channel prioritization flows. Expect some variants to use uploaded historical data or external API keys.
- [ ] **Event template customer validation** — get real event-planning feedback on the new proposal templates and decide whether they should stay under `personal`, gain a dedicated category, or expand into more specialized event packs. GitHub: `#95`

### Workflows & Coordination
- [ ] **Agent-to-agent direct messaging follow-through** — validate and polish the post-merge user flow for direct messages. GitHub: `#64`
- [ ] **Monitor + completion workflows** — recurring status aggregation, auto-complete, and richer workflow supervision
- [ ] **Project context in agent identity on template apply** — kickoff gives context but should also write to `IDENTITY.md` so agents remember across sessions
- [ ] **DAG auto-advance on cron triggers** — cron-triggered completions should also advance DAG
- [ ] **Community rules and constraints** — define reusable rules/constraints at community level, inherited by all groups

### Integrations & Runtime
- [ ] **OAuth clean-room auth test** — run end-to-end on a fresh machine/config and document exact setup failures
- [ ] **Security follow-through** — re-check auth-required API coverage, cookie/session behavior, and production env defaults after OAuth rollout
- [ ] **Google/Apple auth** — add after GitHub (lower priority for v1)

### Launch Readiness
- [ ] **Maintenance status page handoff / review** — web-team issue opened in `Maximilien-ai/clawmax-ai-web#19` for the status/details page linked from the new dashboard maintenance banner. Follow through on final URL, ownership, scheduled/in-progress/completed copy, and precise data-safety wording before broader operator rollout.
- [ ] **Deployment handoff verification** — verify the public repo Docker/Podman contract is sufficient for downstream deployment teams and document any gaps without forking the contract
- [ ] **Launch smoke checklist** — run one short end-to-end smoke path covering login/BYOK, template apply, workflow trigger, company dashboards, delete/reapply, and integrations save/apply
- [ ] **Signup/invite path verification** — verify the user-facing signup and invitation path is coherent from ClawMax.ai through first dashboard access
- [ ] **First-user operations checklist** — prepare the minimum runbook for triaging auth, provider, template-apply, and workflow-execution issues during early user onboarding
- [ ] **Refresh feature demo videos** — replace the legacy workflow/add-agent backup recordings with current feature videos for agents, templates, workflows, skills, BYOK/models, organization/team apply, Builder/Designer, and DocHub/document flows. Keep [DEMO_VIDEOS.md](DEMO_VIDEOS.md) as the source of truth for recording status and file inventory.

### Quality & Testing
- [ ] **Dashboard regression automation** — coverage for OAuth/auth, agent edit/model save, template apply, workspace switching. GitHub: `#141`
- [ ] **Clean-room CI hardening** — keep `SYSTEM/test.sh` deterministic, GitHub Actions trustworthy on `main`. GitHub: `#142`

### UX & Product Polish
- [ ] **Mobile responsiveness audit** — run a focused pass across login, top bar, notifications, agent cards, chat, dashboards, template apply, and integrations wizard on narrow/mobile widths; fix clipped popovers, off-screen dialogs, awkward stacking, and tap-target issues before broader external demos. GitHub: `#143`
- [ ] **Bulk actions from notifications** — dismiss works, but pause/restart/open chat not yet inline
- [ ] **Mobile notifications panel positioning** — on narrow/mobile layouts the notifications popover can render off-center and partially off-screen instead of switching to a properly centered or full-width mobile-friendly sheet.
- [ ] **Notification testing & validation** — verify all notification types fire correctly with real agent activity
- [ ] **Evaluate AG-UI for agent-driven UI surfaces** — explore using the AG-UI standard/framework for notifications and agent chat so agents can render richer UI, collect structured user input, and drive interactive flows; consider the same pattern for template apply and workflow run modals if it fits cleanly.
- [ ] **System agents use best available model** — default to the best available configured provider model instead of a fixed mini model
- [ ] **BYOK provider preference** — when a user has multiple providers, let them choose a preferred default
- [ ] **Asset/IP cleanup for login and presentation visuals** — replace Star Wars-like robot elements (for example the R2-D2-style figure visible in current demo/login imagery) with owned or clearly safe ClawMax artwork across login screens and presentation assets to reduce copyright risk before wider external use.
- [ ] **Agent/workflow logs filtering** — by agent or tag
- [ ] **Workspace stats dashboard** — aggregate view with pause/disable

### Skills
- [ ] **ClawHub install CLI hardening** — validate and harden the `clawhub install` CLI path across local, cloud, and on-prem runtimes now that ClawHub is the first/default registry in the dashboard; keep search/browse and install behavior aligned and document any env/runtime prerequisites before treating it as fully stable. GitHub: `#136`
- [ ] **Add skills to agents directly from agent flows** — allow assigning/searching/adding skills from agent creation, agent detail, or agent edit flows without forcing a separate trip to the Skills page. GitHub: `#137`
- [ ] **Agent-scoped skills page/panel** — add a dedicated `Skills...` entry from agent detail/edit that shows current agent skills plus search/browse to add more in place. GitHub: `#138`
- [ ] **Imported Shipables/Tessl skills emoji/metadata** — imported skills should preserve richer registry metadata beyond current provider/source pills.
- [ ] **Skills publish to SkillsHub** — package and publish workspace skills to GitHub/registry

### Research / Self-Management
- [ ] **ClawMax self-management MVP** — deploy Dev Team on ClawMax repo, test autonomous PR review + triage
- [ ] **Mac Mini deployment** — 24/7 agent team managing ClawMax repo

### Infrastructure & Deployment
- [ ] **Auto-backup** — optional scheduled backups
- [ ] **Issue #32** Consolidate cron with OpenClaw native
- [ ] **Gateway process management (CLI team)** — supervisor, health check, start/stop isolation, and gateway-down notifications

### Future / Lower Priority
- [ ] **Group chat jitter on mobile** — improved but not eliminated
- [ ] **Template tag filtering**
- [ ] **Cloud infrastructure setup**
- [ ] **Multi-tenant workspace isolation**
- [ ] **Cloud management dashboard (ClawMax.ai)**
- [ ] **Cloud APIs for remote management**
- [ ] **Billing integration**
- [ ] **Template marketplace**
- [ ] **Remote agent installation**
- [ ] **Remote setup/management/updates**
- [ ] **On-premise management dashboard**
- [ ] **Docker/Kubernetes packaging**
- [ ] **Blaxel template stabilization branch follow-through** — continue the Blaxel-specific hardening work on branch `feat/blaxel-template-stabilization`: sandbox naming fidelity, durable process management, explicit preview creation, stale-run evidence rejection, and deciding which demo helper files should be harvested vs. discarded before merging anything back. The branch currently preserves the removed `PARTNERS/blaxel`, `blaxel-app-studio`, and `rag-to-sandbox-launch-team` assets from `main`.
- [ ] **Redis template stabilization branch follow-through** — continue Redis-specific runtime/template hardening on branch `feat/redis-template-stabilization` when the Redis flows start showing repeated partner-specific execution or memory-contract issues; keep Redis-specific commands and readiness rules out of generic template/chat paths until that work is explicitly folded back. The branch currently preserves the removed `PARTNERS/redis` and `redis-memory-research-desk` assets from `main`.
- [ ] **Template audit / canonization branch follow-through** — continue the reusable cross-template lessons on branch `feat/template-canon-audit`: partner skills integration, repo-root deploy context, explicit final deliverables, runtime/tool evidence requirements, and other template audit learnings that should be applied broadly where they make sense.
- [ ] **Keep partner-specific templates off `main` until stabilized** — Blaxel and Redis partner templates should remain isolated on their partner branches until they have a stable runtime/tool contract. Avoid reintroducing them into the shipped catalog on `main` prematurely.

## History

- Shipped work lives in [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- Historical hack planning lives under `SYSTEM/docs/hacks/**/archive/`
