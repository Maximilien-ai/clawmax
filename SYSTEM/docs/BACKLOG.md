# Backlog

> Last updated: April 3, 2026
> Completed items archived — see CHANGELOG.md for shipped work and `SYSTEM/docs/hacks/**/archive/` for historical sprint notes

## Top Priority

- [x] **Browser-local secrets for templates, workflows, and skills** — first pass shipped: templates, workflows, and skills can now declare secret requirements and prompt for browser-local runtime inputs like API keys, event slugs, URLs, export paths, and tokens without writing them into workflow markdown or server config by default.
- [ ] **Secret readiness follow-through** — extend template/workflow readiness checks so secret requirements report richer missing/present/degraded states before apply or run.
- [x] **Email OTP auth mode for single-user cloud/on-prem installs** — secure email code login mode shipped between GitHub OAuth and bypass, with allowlisted email(s), short-lived hashed OTPs, Resend delivery, rate limiting, a local dev `log` mode, and focused OTP auth tests. Spec: `SYSTEM/docs/features/EMAIL_OTP_AUTH.md`
- [ ] **Temp chat/runtime resolves duplicate agent IDs against the wrong workspace** — when the same agent id exists across workspaces, temp group/direct chat can resolve runtime/session state from the wrong global OpenClaw agent record, leading to stale models/providers and misleading activity metadata. High-priority post-`v1.2.1` runtime fix. GitHub: `#94`
- [ ] **Phantom workflow residue after archive/delete + reapply** — reproduce whether archiving/deleting agents in one workspace and then applying the same team/template in a new workspace can surface stale previous workflow/execution artifacts ("phantom workflows"). If reproducible, treat as a high-priority workspace isolation / cleanup bug.
- [x] **Workflow targeting conflates participants with output channels** — fixed: workflow execution now prefers explicit owner/agents/tags for participants, while groups/communities remain output channels unless no clearer execution target exists.
- [x] **Workflow participant fan-out is serial, not parallel** — fixed: participants inside one workflow now execute in parallel, so slow agents no longer block later lanes in supposedly parallel team work.
- [ ] **Gateway-down usage polling and runtime fallback are noisy/confusing** — dashboard repeatedly logs `Gateway WebSocket error: connect ECONNREFUSED 127.0.0.1:18789` when the gateway is unavailable, and the user-facing behavior around fallback/local execution is still unclear. This likely overlaps with the known gateway process-management problem and should be treated as core runtime reliability work.
- [ ] **Ollama-selected agents can still execute on Claude in normal UI flow** — even after dashboard-side model/session fixes, normal UI execution can still report `anthropic/claude-opus-4-6` for agents configured as `ollama/...`. Direct API/runtime tests show stale session reuse can be cleared, which suggests the remaining fault is in OpenClaw/gateway provider resolution or a gateway-side fallback path. Treat as a release blocker until configured runtime and actual runtime are trustworthy end-to-end.
- [ ] **Cloud deployment is packaging fixture OpenClaw instead of the real CLI/runtime** — live audit on April 6, 2026 confirmed the cloud pod is not running a real OpenClaw install. `/usr/local/bin/openclaw` symlinks to `/opt/openclaw/openclaw.mjs`, and that file literally prints `openclaw fixture`. This is a release blocker in the `clawmax-cli` cloud image/build path, not just a gateway symptom.
- [ ] **Cloud agents still return fixture responses** — on cloud instances, agent chat returns `openclaw fixture` because the deployed image contains fixture OpenClaw inputs from the CLI cloud publish path instead of the real upstream OpenClaw checkout/runtime.
- [ ] **Cloud Skills page can be empty even when workspace has agents** — live cloud audit confirmed `~/.openclaw/openclaw.json` is missing while workspace agent files exist under `/workspace/AGENTS`, so skill discovery has no real runtime registration state to read.
- [ ] **Cloud logs pane still churns on reconnecting** — the logs/Doctor surface still shows repeated reconnect behavior on cloud instances, which makes diagnosis noisy and likely reflects unresolved websocket/log-stream stability issues.
- [ ] **CLI cloud publish workflow stages fixture OpenClaw into production image** — `clawmax-cli` cloud image publishing currently stages `.ci/fixtures/openclaw` into the build context for the dashboard image. That fixture contains the fake `openclaw.mjs`, so the published cloud image can never run real agent sessions until the workflow/build source is switched to a real OpenClaw checkout or release artifact.
- [x] **Workflow execution does not reliably respect selected model/provider and BYOK precedence** — fixed and validated: workflow/chat runtime now respects selected model changes again, carries Ollama/Gemini execution config through the runtime path, scopes chat sessions to the selected model, and no longer sticks on stale hosted-provider session state after model switches.
- [ ] **Local-model chat quality and progress signaling** — local models such as `ollama/qwen...` now appear to execute, but direct/group chat still degrades on simple instruction-following (`MODEL_CHECK`), response latency is much slower, and typing/progress indication is misleading because agents appear idle for long gaps before dumping a full reply. Needs prompt/runtime tuning plus better in-product progress feedback for slower local models.
- [ ] **Group communications workflow can partially fail even when DAG is green** — test workflows can report overall success while one or more participants fail to post back into the target group/channel (`COMMS FAIL`), which makes workflow status misleading and hides real coordination failures. Need to audit per-participant channel-send error handling and workflow success criteria.
- [ ] **Shared live thread visibility during workflow runs is limited** — participants in the same workflow run do not reliably see each other's replies live inside their own execution context. The system test prompt is being adjusted to validate supported dashboard-backed thread posting, but true live shared-thread visibility remains an open runtime limitation if we want agents to reason over peer replies during the same run.
- [ ] **ClawMax Doctor: Restart Gateway action** — add an in-product `openclaw gateway restart` action when gateway is configured but not running, so users can recover skills/chat capability without leaving the UI
- [ ] **Native gateway usage polling / scope cleanup** — dashboard `sessions.usage` polling is currently disabled in favor of Opik-backed metering because the gateway path requires scopes like `operator.read` and creates repeated log noise. Revisit only if we need native gateway usage stats again.
- [ ] **Template apply tool readiness probes** — extend the new pre-apply readiness step with per-skill / per-tool checks so users can see whether assigned tools are actually usable before deploying a team
- [ ] **Event planning template follow-through** — validate the new small/medium/large event templates with a real user, tighten the kickoff fields, and improve the medium/large speaker-capacity-follow-up flows based on customer feedback. GitHub: `#95`
- [ ] **Workflow result surfacing in notifications and workspace dashboards** — when a workflow produces a strong final artifact or summary, surface a prominent “latest result” link/card in notifications and the workspace dashboard so users do not have to dig through busy group chat threads to find the outcome. Start with Lu.ma-style synthesis workflows, then generalize to other templates.
- [ ] **Senso and external artifact result notifications** — file artifacts and GitHub issue/PR links now surface into `Results`, but Senso outputs and other external result types still need first-class notification hooks plus dashboard surfacing so users can see all meaningful agent outputs in one place.
- [ ] **First-run onboarding wizard follow-through** — the initial wizard should grow from simple route guidance into a richer setup flow: detect BYOK readiness, offer OpenClaw agent import vs. create-team paths, suggest templates by category/use case, and disappear automatically once the workspace is meaningfully initialized.

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
- [ ] **Template feedback, ratings, and promotion flow** — let users review proposal templates, submit feedback, and promote well-performing templates from idea/proposal status into more trusted catalog tiers
- [ ] **Project context in agent identity on template apply** — kickoff gives context but should also write to `IDENTITY.md` so agents remember across sessions
- [ ] **Rate limit notification** — surface API rate limits as warning notifications with retry suggestion
- [ ] **Workflow re-run resets status** — when re-triggering a completed workflow, reset all downstream deps to idle
- [ ] **DAG auto-advance on cron triggers** — cron-triggered completions should also advance DAG
- [ ] **Bulk import/export for OpenClaw agents** — multiple agents at once
- [ ] **Result artifact standardization** — selected templates should produce consistent visible outputs, not just chat traces
- [ ] **Template breadth publication** — publish additional non-showcase template specs after the selected flows stabilize
- [ ] **Demo / research hardening** — re-run high-value template flows end-to-end without manual unblocks and keep runtime mismatches visible

## Active Product Work

### Templates & Discovery
- [x] **Template schema validation on import** — validate imported `TEMPLATE.md` / `template.json` against the public contract before save. GitHub: `#87`
- [x] **AI-assisted template/workflow discovery suggestions** — when exact or strong search matches are missing, show similar templates/workflows and AI recommendations instead of a dead end. GitHub: `#81`
- [ ] **Template feedback, ratings, and promotion flow** — let users review proposal templates, submit feedback, and promote well-performing templates from idea/proposal status into more trusted catalog tiers.
- [ ] **Event template customer validation** — get real event-planning feedback on the new proposal templates and decide whether they should stay under `personal`, gain a dedicated category, or expand into more specialized event packs. GitHub: `#95`
- [ ] **Template AI Generate UI** — wire POST `/api/templates/generate` to the Templates page AI flow
- [ ] **Template wizard** — create templates from existing agents, workflows, communities, and groups via a multi-step wizard

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
- [ ] **Bulk actions from notifications** — dismiss works, but pause/restart/open chat not yet inline
- [ ] **Notification testing & validation** — verify all notification types fire correctly with real agent activity
- [ ] **Disable AI buttons when no keys** — grey out AI Generate/Create with tooltip when no system/user/BYOK keys are configured
- [ ] **System agents use best available model** — default to the best available configured provider model instead of a fixed mini model
- [ ] **BYOK provider preference** — when a user has multiple providers, let them choose a preferred default
- [ ] **ClawMax favicon** — replace lobster emoji with ClawMax logo
- [ ] **Top bar online count ignores paused agents** — exclude paused agents from the online count
- [ ] **Agent/workflow logs filtering** — by agent or tag
- [ ] **Workspace stats dashboard** — aggregate view with pause/disable

### Skills
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

## History

- Shipped work lives in [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md)
- Historical hack planning lives under `SYSTEM/docs/hacks/**/archive/`
