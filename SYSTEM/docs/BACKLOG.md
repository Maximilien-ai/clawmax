# Backlog

> Last updated: April 22, 2026
> Completed items archived — see CHANGELOG.md for shipped work and `SYSTEM/docs/hacks/**/archive/` for historical sprint notes

## Top Priority

- [ ] **Template audit for lane/subdirectory assumptions** — audit organization and workflow templates for the same class of bug seen in CW reruns: hidden/helper dirs being treated as work items, ambiguous lane ownership, weak filesystem verification, or success reporting that does not re-check on-disk outputs. Prioritize templates that scan subdirectories, split work across multiple agents, or rely on reruns/idempotent regeneration.
- [ ] **Template markdown integrity manifest / checksum follow-through** — explore adding a lightweight integrity marker to exported `TEMPLATE.md` / agent template markdown (for example a hash over canonicalized sections or per-section checksums) so import can detect lossy edits, broken round-trips, or missing agent/workflow blocks before save/apply. Keep this generic: the goal is not to block legitimate user edits by default, but to warn clearly when markdown no longer matches a structurally sound template payload.
- [x] **Workspace Integrations redesign for optional partner pages** — shipped first pass: preserved current model/API-key setup, added partner selection plus partner-specific pages, and kept Senso / Opik / GitHub working while exposing Blaxel and Redis through the same flow.
- [x] **Partner definition contract + loader** — shipped first pass with machine-readable partner metadata plus markdown copy/assets under `PARTNERS/<slug>/partner.json` + `PARTNERS/<slug>/PARTNER.md`, env allowlist support, and optional extra partner roots.
- [x] **Blaxel integration** — shipped first pass: workspace integration capture, curated skill-install path, validation hook, template/apply defaults, and partner-ready templates for sandbox flows.
- [x] **Redis integration** — shipped first pass: workspace integration capture, validation/config hooks, template/apply defaults, and partner-ready templates for memory-oriented flows. Keep official skill/install follow-through open separately.
- [x] **Curated partner skill installation flow** — shipped first pass for approved partner installers, starting with Blaxel, without exposing arbitrary user-entered `npx` execution.
- [x] **Partner-aware template apply toggles** — generic template apply now supports selected/configured partner integrations like Blaxel and Redis in the current flow.
- [x] **Blaxel/Redis template pack** — shipped first pass with Blaxel-first, Redis-first, and combined template examples. Keep expansion/polish as follow-through, not blocker work.
- [ ] **Workspace auto-switch watch item** — likely fixed via request-local workspace context, but keep tracking until it survives more real multi-workspace/shared-dashboard usage without silent active-workspace drift.
- [x] **Browser-local secrets for templates, workflows, and skills** — first pass shipped: templates, workflows, and skills can now declare secret requirements and prompt for browser-local runtime inputs like API keys, event slugs, URLs, export paths, and tokens without writing them into workflow markdown or server config by default.
- [ ] **Secret readiness follow-through** — extend template/workflow readiness checks so secret requirements report richer missing/present/degraded states before apply or run.
- [x] **Centralized browser-local keystore for secrets and API keys** — shipped first pass: `Keys & Secrets` is now a first-class browser-local vault for reusable provider/partner keys and other secrets across integrations, templates, workflows, and skills, with workspace/global scope, prefill matching, bulk import, and browser-vault/source-of-truth behavior.
- [x] **Skill assignment page does not refresh new agents immediately** — fixed: Skills now refreshes agent assignment targets after agent creation without a manual reload.
- [x] **Skill import fallback for missing TypeScript entrypoint** — fixed: importing a skill repo with `SKILL.md` plus `index.js` now succeeds with a generated compatibility `index.ts` shim and warning instead of a hard failure.
- [x] **Skill discovery follow-through** — shipped first pass: Skills search now surfaces close matches and inline Shipables suggestions instead of a dead-end no-results state.
- [x] **AI skill creation** — shipped first pass: AI-assisted skill creation now supports prompt → draft → refine → create, with missing-section hints based on the skill spec.
- [x] **Email OTP auth mode for single-user cloud/on-prem installs** — secure email code login mode shipped between GitHub OAuth and bypass, with allowlisted email(s), short-lived hashed OTPs, Resend delivery, rate limiting, a local dev `log` mode, and focused OTP auth tests. Spec: `SYSTEM/docs/features/EMAIL_OTP_AUTH.md`
- [ ] **OTP log-mode safety follow-through** — once real email OTP delivery is stable in cloud, treat `OTP_DEV_MODE=log` as explicit test/debug-only behavior: add a visible UI warning when enabled, document that production instances should leave it unset, and verify it is disabled on normal customer/demo environments after live debugging is complete.
- [ ] **Parallel workflow session-lock follow-through** — issue `#100` is still open even though bounded retry/backoff shipped. Keep validating whether workflow session contention is fully resolved in real cloud/system-test flows before closing it.
- [ ] **Phantom workflow residue after archive/delete + reapply** — reproduce whether archiving/deleting agents in one workspace and then applying the same team/template in a new workspace can surface stale previous workflow/execution artifacts ("phantom workflows"). If reproducible, treat as a high-priority workspace isolation / cleanup bug.
- [x] **Template apply group conflict detection and resolution** — shipped first pass: template apply now detects conflicting groups/communities and agent IDs, supports channel rename-on-apply, and provides direct recovery paths from the blocked Deploy step.
- [ ] **Multi-workflow apply conflict follow-through** — repeated applies into the same workspace can still surface intermittent workflow-level collisions or reuse behavior that is not fully detected/resolved during template apply. Capture crisp repros and tighten conflict preflight plus rename/remap behavior for overlapping pipeline/workflow names.
- [x] **Workflow run-level override input** — shipped first pass: users can run workflows with one-off run instructions/inputs that apply only to that execution, including direct trigger flow and DAG-trigger flow without permanently editing the workflow body.
- [x] **Template apply progress feedback gap** — fixed first pass: template apply now reports intermediate progress through validation, skill setup, generation, write, and refresh phases instead of long silent gaps.
- [x] **Workflow targeting conflates participants with output channels** — fixed: workflow execution now prefers explicit owner/agents/tags for participants, while groups/communities remain output channels unless no clearer execution target exists.
- [x] **Workflow participant fan-out is serial, not parallel** — fixed: participants inside one workflow now execute in parallel, so slow agents no longer block later lanes in supposedly parallel team work.
- [ ] **Gateway-down usage polling and runtime fallback are noisy/confusing** — dashboard repeatedly logs `Gateway WebSocket error: connect ECONNREFUSED 127.0.0.1:18789` when the gateway is unavailable, and the user-facing behavior around fallback/local execution is still unclear. This likely overlaps with the known gateway process-management problem and should be treated as core runtime reliability work.
- [ ] **Cloud/runtime gateway should be managed as a durable service, not a manual desktop command** — in managed/cloud instances the gateway needs to be started and kept alive by the runtime itself (container entrypoint, startup supervisor, platform process config, or equivalent), not by browser-triggered fixes or desktop instructions. Evaluate the cleanest production path, likely platform/container-native supervision rather than ad hoc local commands, and make Doctor verify that durable runtime path instead of teaching users to launch it manually.
- [ ] **Clean-room setup flow validation** — issue `#11`: run and document a fresh-machine bootstrap path against the current `setup.sh` / `start.sh` contract, including current auth defaults, `DASHBOARD_PUBLIC_URL`, OPIK setup copy, and the visible `SYSTEM/test.sh` release gate.
- [ ] **Cloud GitHub integration follow-through** — first pass shipped: cloud/hosted runtimes can now report GitHub readiness from a runtime `GITHUB_TOKEN` / `GH_TOKEN` plus a default repo, while local/dev and on-prem keep the `gh` CLI path. Remaining work is stronger API-backed verification, better token diagnostics, and eventual GitHub App/OAuth-grade cloud auth so cloud does not rely on CLI semantics at all.
- [ ] **BYOK / Partners wizard should stay in sync across mounted instances** — the top-bar `BYOK` and `Partners` entrypoints mount separate wizard instances, so browser-local storage updates can drift and show stale keys/readiness if the wizard does not resync after vault writes. Keep the browser-vault event-driven refresh path tested so saved keys persist visibly and readiness pills update immediately.
- [ ] **Ollama-selected agents can still execute on Claude in normal UI flow** — even after dashboard-side model/session fixes, normal UI execution can still report `anthropic/claude-opus-4-6` for agents configured as `ollama/...`. Direct API/runtime tests show stale session reuse can be cleared, which suggests the remaining fault is in OpenClaw/gateway provider resolution or a gateway-side fallback path. Treat as a release blocker until configured runtime and actual runtime are trustworthy end-to-end.
- [ ] **Cloud image must ship built OpenClaw runtime, not raw source or fixtures** — the original fixture-runtime blocker was identified in the CLI cloud build path, and the current follow-up blocker is that cloud now installs real OpenClaw source without built `dist/entry.(m)js` output. Canonical Docker fix pushed in commit `23aaf52`; keep this open until the rebuilt image is validated live.
- [ ] **Replace ad hoc Docker OpenClaw packaging with a cleaner canonical install path** — current cloud stabilization uses an in-image build/package path for the pinned OpenClaw runtime. After cloud is healthy, replace that with a more explicit release artifact or canonical upstream distribution flow so runtime packaging is easier to reason about and less fragile.
- [ ] **Plan and test OpenClaw upgrade to latest after cloud runtime stabilizes** — once the pinned runtime path is healthy in cloud, schedule a deliberate upgrade pass from the current tested OpenClaw ref to latest, with explicit validation for gateway startup, agent creation, skills loading, and workflow execution.
- [ ] **Audit additional runtime tool packaging for built-in skills** — after cloud runtime stabilizes, review whether the base image should also package `bash`, `zip`, `unzip`, `tar`, `gzip`, and `file`/`less` for common agent skill flows without over-expanding image size.
- [ ] **Dangerous skill review and guardrails** — during security review, study known dangerous-skill patterns (for example [gricha/dangerous-skills](https://github.com/gricha/dangerous-skills)) and also review higher-quality public skill repos (for example `getsentry/skills`) to separate good patterns from risky ones; add guardrails so imported or AI-created skills cannot quietly introduce obviously dangerous behavior without explicit user review and warnings.
- [ ] **Cloud agent runtime still needs live validation after image rebuild** — fixture responses should be gone, but cloud must still be rechecked end-to-end after the rebuilt image lands: one agent chat, Skills page, Doctor output, and `openclaw --version`.
- [ ] **Cloud Skills page can be empty even when workspace has agents** — live cloud audit confirmed `~/.openclaw/openclaw.json` is missing while workspace agent files exist under `/workspace/AGENTS`, so skill discovery has no real runtime registration state to read.
- [ ] **Cloud logs pane still churns on reconnecting** — the logs/Doctor surface still shows repeated reconnect behavior on cloud instances, which makes diagnosis noisy and likely reflects unresolved websocket/log-stream stability issues.
- [ ] **CLI cloud publish workflow stages fixture OpenClaw into production image** — `clawmax-cli` cloud image publishing currently stages `.ci/fixtures/openclaw` into the build context for the dashboard image. That fixture contains the fake `openclaw.mjs`, so the published cloud image can never run real agent sessions until the workflow/build source is switched to a real OpenClaw checkout or release artifact.
- [x] **Workflow execution does not reliably respect selected model/provider and BYOK precedence** — fixed and validated: workflow/chat runtime now respects selected model changes again, carries Ollama/Gemini execution config through the runtime path, scopes chat sessions to the selected model, and no longer sticks on stale hosted-provider session state after model switches.
- [ ] **Local-model chat quality and progress signaling** — local models such as `ollama/qwen...` now appear to execute, but direct/group chat still degrades on simple instruction-following (`MODEL_CHECK`), response latency is much slower, and typing/progress indication is misleading because agents appear idle for long gaps before dumping a full reply. Needs prompt/runtime tuning plus better in-product progress feedback for slower local models.
- [ ] **Group communications workflow can partially fail even when DAG is green** — test workflows can report overall success while one or more participants fail to post back into the target group/channel (`COMMS FAIL`), which makes workflow status misleading and hides real coordination failures. Need to audit per-participant channel-send error handling and workflow success criteria.
- [ ] **Shared live thread visibility during workflow runs is limited** — participants in the same workflow run do not reliably see each other's replies live inside their own execution context. The system test prompt is being adjusted to validate supported dashboard-backed thread posting, but true live shared-thread visibility remains an open runtime limitation if we want agents to reason over peer replies during the same run.
- [ ] **System test diagnostics should surface upstream model/quota failures before downstream step failures** — a cloud system-test run can appear to fail on later stages like GitHub even when the real blocker is an earlier LLM/provider quota/auth rejection. Tighten workflow/test result surfacing so upstream model failures are obvious and downstream stage noise is de-emphasized.
- [ ] **ClawMax Doctor: Restart Gateway action** — add an in-product `openclaw gateway restart` action when gateway is configured but not running, so users can recover skills/chat capability without leaving the UI
- [ ] **Native gateway usage polling / scope cleanup** — dashboard `sessions.usage` polling is currently disabled in favor of Opik-backed metering because the gateway path requires scopes like `operator.read` and creates repeated log noise. Revisit only if we need native gateway usage stats again.
- [ ] **Template apply tool readiness probes** — extend the new pre-apply readiness step with per-skill / per-tool checks so users can see whether assigned tools are actually usable before deploying a team
- [ ] **Event planning template follow-through** — validate the new small/medium/large event templates with a real user, tighten the kickoff fields, and improve the medium/large speaker-capacity-follow-up flows based on customer feedback. GitHub: `#95`
- [ ] **Workflow result surfacing in notifications and workspace dashboards** — when a workflow produces a strong final artifact or summary, surface a prominent “latest result” link/card in notifications and the workspace dashboard so users do not have to dig through busy group chat threads to find the outcome. Start with Lu.ma-style synthesis workflows, then generalize to other templates.
- [ ] **Notification burst grouping / deduplication** — collapse near-identical notification bursts (for example multiple agents updating the same file class during one workflow window) into grouped summaries like `4 agents updated MEMORY.md`, with optional drill-down into the underlying per-agent events. Prioritize workflow-result, workspace-artifact, and repeated agent-status notifications so the feed becomes a summary surface instead of a noisy event log.
- [ ] **Senso and external artifact result notifications** — file artifacts and GitHub issue/PR links now surface into `Results`, but Senso outputs and other external result types still need first-class notification hooks plus dashboard surfacing so users can see all meaningful agent outputs in one place.
- [ ] **First-run onboarding wizard follow-through** — the initial wizard should grow from simple route guidance into a richer setup flow: detect BYOK readiness, offer OpenClaw agent import vs. create-team paths, suggest templates by category/use case, and disappear automatically once the workspace is meaningfully initialized.
- [ ] **Workflow customization form parity follow-through** — keep auditing template apply / workflow customization field handling so dropdowns, textareas, and other structured run-input fields always persist into workflow markdown/overrides correctly and do not trip false required-field validation.
- [ ] **Doctor messaging copy polish for managed runtimes** — the new managed-runtime guidance is directionally correct, but copy like “disabled in this Linux instance runtime” is still too broad. Tighten wording so it points at the managed runtime/supervision model, not Linux itself.
- [ ] **Template-guided onboarding** — onboarding should collect lightweight signals like category, focus, and free-form intent, then recommend a short list of best-fit templates using metadata + semantic matching + iterative AI suggestion.

## Today Focus — April 2, 2026

- [x] **AI-assisted template/workflow discovery suggestions** — when exact or strong search matches are missing, show similar templates/workflows and AI recommendations instead of a dead end. GitHub: `#81`
- [ ] **Agent-to-agent direct messaging follow-through** — validate the post-merge user path on top of the new direct messaging API and close any UX/runtime gaps. GitHub: `#64`
- [x] **Template schema validation on import** — validate imported `TEMPLATE.md` / `template.json` against the public contract before save. GitHub: `#87`
- [x] **Default channel fan-out** — group and community chat now goes to all members by default unless the user narrows with explicit `@mentions`. GitHub: `#92`
- [x] **Agent chat streaming improvement** — agent chat now streams live stdout deltas through SSE and keeps explicit dashboard session continuity. GitHub: `#15`
- [x] **Event planning proposal templates** — added small, medium, and large event-planning templates plus an `Events` discovery filter in the Templates page. GitHub: `#95`

## April Launch Readiness

### Immediate Demo / Release Blockers
- [ ] **OAuth clean-room auth test** — GitHub OAuth verified locally; still run end-to-end on a fresh machine/config and document exact setup failures
- [x] **Audit `./setup.sh` after OTP/auth changes** — completed a bootstrap audit and aligned local setup with the tested OpenClaw runtime pin, added generated `JWT_SECRET` for OTP/GitHub auth modes, and guarded macOS-only gateway service install behavior so Linux/dev bootstrap no longer assumes `launchctl`.
- [x] **Workspaces Integrations live validation pass** — run the full integrations flow on a freshly restarted dashboard: save local settings, verify Senso/GitHub defaults flow into template apply, and confirm key-validation fallback vs. live validation behavior is understandable. GitHub: `#75`
- [x] **Workspaces Integrations deeper runtime follow-through** — non-secret workspace defaults now persist per workspace and flow through template apply plus workflow execution inputs/runtime context. Keep the live end-to-end verification pass as a separate launch-readiness item. GitHub: `#77`
- [ ] **Security follow-through** — re-check auth-required API coverage, cookie/session behavior, and production env defaults after OAuth rollout

### Security (Sprint Priority #1)
- [ ] **Google/Apple auth** — add after GitHub (lower priority for v1)

### Cost Management (Sprint Priority #2)
- [x] **Per-agent cost limits** — individual agent limits (currently workspace-level only)
- [x] **Cost notifications** — toast/alert when approaching limits, email notification option
- [x] **Cost dashboard refinement** — per-workflow cost breakdown, daily/weekly trends. GitHub: `#78`

### Backup & Restore (Sprint Priority #3)
- [ ] **Workspace backup** — zip workspace + config, downloadable from UI. Trigger manually or schedule.
- [x] **Workspace restore** — ZIP import/restore shipped in the workspace switcher for exported workspace archives. Keep follow-through on compatibility, conflict handling, and cloud validation.
- [ ] **Auto-backup** — optional scheduled backups (daily/weekly)

### Customer-Facing Visibility (High Priority)
- [x] **Workspace summary dashboard** — shareable one-page live workspace view for consumers, not just builders. Include overview cards, costs/budget, agent status, active notifications, workflow now/history/next run, kickoff input summary, and recent result links. Support section selection at generation time and persistent copy/open/delete management for generated links. Spec: `SYSTEM/docs/features/WORKSPACE_SUMMARY_DASHBOARD.md`
- [x] **Workspace dashboard compact charts** — added compact-mode segmented summary bars for agent status, workflow state, and notification severity so stakeholder views fit closer to one screen without relying only on text.
- [x] **Workflow input normalization for dashboards** — kickoff/project configuration summaries now prefer structured workflow configuration extraction over raw execution-log tails.
- [x] **Workflow output + artifact normalization for dashboards** — shared dashboards now normalize participant-result summaries plus labeled artifact links and workspace file references into a consistent result surface.
- [x] **Workspace dashboard compact reorder bug** — compact layout editor now supports reliable same-column upward reordering without falling through to the column-level append target.

## Hack / Research

- [ ] **AI Generate outputs TEMPLATE.md** — generate markdown format from wizard
- [ ] **Wizard exports as TEMPLATE.md** — download/save as markdown
- [ ] **Template feedback, ratings, and promotion flow** — first-pass ratings/feedback is shipped locally and can optionally route to a remote sink; keep promotion, ranking, and broader catalog lifecycle work open.
- [x] **Template editing and AI refinement** — shipped first pass for organization and agent templates: start from an existing template, edit/refine in-wizard, save as a workspace variant, and for agent templates edit/generate the real `IDENTITY.md` / `SOUL.md` / `TOOLS.md` files.
- [ ] **Project context in agent identity on template apply** — kickoff gives context but should also write to `IDENTITY.md` so agents remember across sessions
- [ ] **Rate limit notification** — surface API rate limits as warning notifications with retry suggestion
- [ ] **Workflow re-run resets status** — when re-triggering a completed workflow, reset all downstream deps to idle
- [ ] **DAG auto-advance on cron triggers** — cron-triggered completions should also advance DAG
- [ ] **Bulk import/export for OpenClaw agents** — multiple agents at once
- [ ] **Result artifact standardization** — selected templates should produce consistent visible outputs, not just chat traces
- [ ] **Template breadth publication** — publish additional non-showcase template specs after the selected flows stabilize
- [x] **Job search template pack** — shipped first starter template: `job-search-team`, marked as a suggested/customizable early-idea template.
- [x] **Robotics template pack** — shipped first starter template: `robotics-build-lab`, positioned as a suggested/customizable starting point for Qualcomm AI Hub / Arduino-oriented work.
- [x] **Jarvis-style personal operator template** — shipped first starter template: `jarvis-command-desk`, with the expectation that users refine/edit it into their own operator style.
- [ ] **Demo / research hardening** — re-run high-value template flows end-to-end without manual unblocks and keep runtime mismatches visible

## Active Product Work

### Templates & Discovery
- [x] **Template schema validation on import** — validate imported `TEMPLATE.md` / `template.json` against the public contract before save. GitHub: `#87`
- [x] **AI-assisted template/workflow discovery suggestions** — when exact or strong search matches are missing, show similar templates/workflows and AI recommendations instead of a dead end. GitHub: `#81`
- [ ] **Template feedback, ratings, and promotion flow** — let users review proposal templates, submit feedback, and promote well-performing templates from idea/proposal status into more trusted catalog tiers.
- [x] **Template feedback remote sink / web sync** — shipped: template feedback stays local-first by default, and can optionally route through a generic remote sink when `TEMPLATE_FEEDBACK_REMOTE_URL`, `TEMPLATE_FEEDBACK_SUMMARY_URL`, and `TEMPLATE_FEEDBACK_TOKEN` are configured.
- [ ] **Template upgrade / reapply-over-existing flow** — support upgrading a workspace that already applied a template when the template changes later; compare the current workspace against the newer template, show likely conflicts plus likely safe updates, and guide the user through update vs. replace decisions instead of forcing manual delete + reapply.
- [ ] **Surface old template versions in the UI** — template saves already archive prior versions on disk under `.versions/`; add a lightweight “Previous versions” surface so users can inspect older versions, compare against the current one, and optionally restore or copy content from an earlier snapshot.
- [ ] **Small-business marketing template pack** — create suggested starter templates for marketing planning and budget allocation across Instagram, Facebook, YouTube, and Google News/Ads, including audience focus, budget planning, and channel prioritization flows. Expect some variants to use uploaded historical data or external API keys.
- [ ] **Event template customer validation** — get real event-planning feedback on the new proposal templates and decide whether they should stay under `personal`, gain a dedicated category, or expand into more specialized event packs. GitHub: `#95`
- [x] **Template AI Generate UI** — shipped and hardened: POST `/api/templates/generate` is wired to the Templates page AI flow, uses browser BYOK/browser-vault keys, preserves the AI prompt, and now guides users through workflows/tags/skills follow-through instead of dropping sparse drafts on them.
- [x] **Template wizard** — shipped first pass: multi-step template creation/editing flow with AI generation, composition/comms/workflows preview, save/apply, and follow-through for generated workflows, tags, skills, and template refinement.

### Workflows & Coordination
- [ ] **Agent-to-agent direct messaging follow-through** — validate and polish the post-merge user flow for direct messages. GitHub: `#64`
- [ ] **Monitor + completion workflows** — recurring status aggregation, auto-complete, and richer workflow supervision
- [ ] **Project context in agent identity on template apply** — kickoff gives context but should also write to `IDENTITY.md` so agents remember across sessions
- [x] **Workflow re-run resets status** — when re-triggering a completed workflow, reset all downstream deps to idle
- [ ] **DAG auto-advance on cron triggers** — cron-triggered completions should also advance DAG
- [ ] **Community rules and constraints** — define reusable rules/constraints at community level, inherited by all groups

### Integrations & Runtime
- [ ] **OAuth clean-room auth test** — run end-to-end on a fresh machine/config and document exact setup failures
- [ ] **Security follow-through** — re-check auth-required API coverage, cookie/session behavior, and production env defaults after OAuth rollout
- [ ] **Google/Apple auth** — add after GitHub (lower priority for v1)

### Launch Readiness
- [ ] **Maintenance status page handoff / review** — web-team issue opened in `Maximilien-ai/clawmax-ai-web#19` for the status/details page linked from the new dashboard maintenance banner. Follow through on final URL, ownership, scheduled/in-progress/completed copy, and precise data-safety wording before broader operator rollout.
- [ ] **Deployment handoff verification** — verify the public repo Docker/Podman contract is sufficient for downstream deployment teams and document any gaps without forking the contract
- [ ] **Launch smoke checklist** — define and run one short end-to-end smoke path covering login, template apply, workflow trigger, dashboards, and integrations save/apply
- [ ] **Signup/invite path verification** — verify the user-facing signup and invitation path is coherent from ClawMax.ai through first dashboard access
- [ ] **First-user operations checklist** — prepare the minimum runbook for triaging auth, provider, template-apply, and workflow-execution issues during early user onboarding

### Quality & Testing
- [ ] **Dashboard regression automation** — coverage for OAuth/auth, agent edit/model save, template apply, workspace switching
- [ ] **Dashboard smoke suite** — one-command local smoke run for key UI/API flows
- [ ] **Clean-room CI hardening** — keep `SYSTEM/test.sh` deterministic, GitHub Actions trustworthy on `main`

### UX & Product Polish
- [x] **First-run onboarding wizard** — added a lightweight top-bar onboarding flow for empty workspaces that routes users into BYOK, agent import, agent creation, and templates.
- [ ] **Mobile responsiveness audit** — run a focused pass across login, top bar, notifications, agent cards, chat, dashboards, template apply, and integrations wizard on narrow/mobile widths; fix clipped popovers, off-screen dialogs, awkward stacking, and tap-target issues before broader external demos.
- [ ] **Bulk actions from notifications** — dismiss works, but pause/restart/open chat not yet inline
- [ ] **Mobile notifications panel positioning** — on narrow/mobile layouts the notifications popover can render off-center and partially off-screen instead of switching to a properly centered or full-width mobile-friendly sheet.
- [ ] **Notification testing & validation** — verify all notification types fire correctly with real agent activity
- [ ] **Evaluate AG-UI for agent-driven UI surfaces** — explore using the AG-UI standard/framework for notifications and agent chat so agents can render richer UI, collect structured user input, and drive interactive flows; consider the same pattern for template apply and workflow run modals if it fits cleanly.
- [x] **Disable AI buttons when no keys** — AI Generate/Create entry points now disable with setup guidance when no browser/shared execution path is configured across agent, workflow, and template flows.
- [x] **Template wizard cron helper should ignore `manual` schedules** — fixed: `✨ Suggest Cron` is hidden when a workflow is already `manual`, so the wizard no longer shows misleading missing-key errors in that case.
- [ ] **System agents use best available model** — default to the best available configured provider model instead of a fixed mini model
- [ ] **BYOK provider preference** — when a user has multiple providers, let them choose a preferred default
- [x] **ClawMax favicon** — dashboard client now serves the ClawMax logo favicon via `client/index.html`.
- [ ] **Asset/IP cleanup for login and presentation visuals** — replace Star Wars-like robot elements (for example the R2-D2-style figure visible in current demo/login imagery) with owned or clearly safe ClawMax artwork across login screens and presentation assets to reduce copyright risk before wider external use.
- [x] **Top bar online count ignores paused agents** — system summary and top bar now use paused-aware counts; paused agents are excluded from the online total.
- [ ] **Agent/workflow logs filtering** — by agent or tag
- [ ] **Workspace stats dashboard** — aggregate view with pause/disable

### Skills
- [ ] **Add skills to agents directly from agent flows** — allow assigning/searching/adding skills from agent creation, agent detail, or agent edit flows without forcing a separate trip to the Skills page.
- [ ] **Agent-scoped skills page/panel** — add a dedicated `Skills...` entry from agent detail/edit that shows current agent skills plus search/browse to add more in place.
- [ ] **Browse Shipables catalog in Skills page** — embedded browsing without opening import dialog
- [ ] **Imported Shipables skills emoji/metadata** — imported skills should preserve richer registry metadata
- [ ] **Edit skill tags post-import** — add/remove tags on any skill from the Skills page
- [ ] **Skills select/select-all + bulk ops** — bulk add tags, bulk delete skills
- [ ] **Skill tag filtering** — filter skills by tag like agent tag filtering
- [ ] **Skills publish to SkillsHub** — package and publish workspace skills to GitHub/registry

### Research / Self-Management
- [ ] **ClawMax Dev Team template** — qa-engineer, release-engineer, github-triage with kickoff workflow
- [ ] **ClawMax self-management MVP** — deploy Dev Team on ClawMax repo, test autonomous PR review + triage
- [ ] **Mac Mini deployment** — 24/7 agent team managing ClawMax repo

### Infrastructure & Deployment
- [ ] **Workspace backup** — zip workspace + config, downloadable from UI
- [ ] **Workspace restore** — upload zip to restore workspace state
- [ ] **Auto-backup** — optional scheduled backups
- [ ] **Issue #32** Consolidate cron with OpenClaw native
- [ ] **Issue #11** Clean-room test of setup flow
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
