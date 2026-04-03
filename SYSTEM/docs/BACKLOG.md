# Backlog

> Last updated: April 3, 2026
> Completed items archived — see CHANGELOG.md for shipped work and `SYSTEM/docs/hacks/**/archive/` for historical sprint notes

## Top Priority

- [x] **Email OTP auth mode for single-user cloud/on-prem installs** — secure email code login mode shipped between GitHub OAuth and bypass, with allowlisted email(s), short-lived hashed OTPs, Resend delivery, rate limiting, a local dev `log` mode, and focused OTP auth tests. Spec: `SYSTEM/docs/features/EMAIL_OTP_AUTH.md`
- [ ] **Temp chat/runtime resolves duplicate agent IDs against the wrong workspace** — when the same agent id exists across workspaces, temp group/direct chat can resolve runtime/session state from the wrong global OpenClaw agent record, leading to stale models/providers and misleading activity metadata. High-priority post-`v1.2.1` runtime fix. GitHub: `#94`
- [ ] **ClawMax Doctor: Restart Gateway action** — add an in-product `openclaw gateway restart` action when gateway is configured but not running, so users can recover skills/chat capability without leaving the UI
- [ ] **Template apply tool readiness probes** — extend the new pre-apply readiness step with per-skill / per-tool checks so users can see whether assigned tools are actually usable before deploying a team
- [ ] **Event planning template follow-through** — validate the new small/medium/large event templates with a real user, tighten the kickoff fields, and improve the medium/large speaker-capacity-follow-up flows based on customer feedback. GitHub: `#95`

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
- [ ] **Workspace restore** — upload zip to restore workspace state
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
