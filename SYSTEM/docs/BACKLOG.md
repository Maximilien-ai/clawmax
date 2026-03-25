# Backlog

> Last updated: March 23, 2026
> Deadline: Cloud deployment by April 1st, dashboard ready by March 26
> Completed items archived — see CHANGELOG.md for full history

## CRITICAL — Dashboard Ready by March 26 (Wed)

### Immediate Demo / Release Blockers
- [x] **Issue #38: production root route returns `Cannot GET /`** — fix static client serving / SPA fallback in production container
- [ ] **OAuth clean-room auth test** — GitHub OAuth verified locally; still run end-to-end on a fresh machine/config and document exact setup failures
- [ ] **Security follow-through** — re-check auth-required API coverage, cookie/session behavior, and production env defaults after OAuth rollout
- [x] **CI green on `main`** — clean-room CI is passing again on GitHub Actions

### Security (Sprint Priority #1)
- [x] **Security audit** — full audit of dashboard, API endpoints, agent execution, file access, env vars. 27 issues found, critical/high fixed in v1.1.6.
- [x] **API rate limiting** — express-rate-limit: 200 req/min global, 10 req/min auth
- [x] **Input sanitization** — port validation, agent ID validation, GitHub URL validation, path traversal fix
- [x] **Audit logging** — all API requests logged with timestamp, method, path, status, token hash, duration
- [x] **Env var whitelisting** — child processes receive only whitelisted env vars
- [x] **GitHub authentication** — OAuth login via GitHub. JWT sessions, login page, user avatar, logout, allowed-user whitelist.
- [ ] **Google/Apple auth** — add after GitHub (lower priority for v1)

### Cost Management (Sprint Priority #2)
- [x] **Workspace cost budget** — per-workspace USD budget with progress bar, yellow at 80%, red when exceeded, auto-pause agents + block workflows
- [x] **Budget enforcement** — toggle enforce on/off, editable limit from Activity page
- [x] **Pause/disable agent** — toggle enabled/disabled (orange badge). Bulk pause/resume via selection. Paused agents show badge & block new interactions.
- [x] **Bulk pause agents** — selection-mode action to pause/resume many agents safely without deleting them.
- [ ] **Per-agent cost limits** — individual agent limits (currently workspace-level only)
- [ ] **Cost notifications** — toast/alert when approaching limits, email notification option
- [ ] **Cost dashboard refinement** — per-workflow cost breakdown, daily/weekly trends

### Backup & Restore (Sprint Priority #3)
- [ ] **Workspace backup** — zip workspace + config, downloadable from UI. Trigger manually or schedule.
- [ ] **Workspace restore** — upload zip to restore workspace state
- [ ] **Auto-backup** — optional scheduled backups (daily/weekly)

## Sprint: March 23–31 — Priority Order

### P0: Notification Center (GAME CHANGER)
> Central workspace awareness — the missing glue between "I have agents" and "I know what's happening."

- [ ] **Notification center UI** — badge in top nav (near BYOK) with count, red/orange severity. Click opens dropdown with grouped notifications and action links.
- [ ] **Workspace monitor agent** — system agent that periodically scans workspace state: agents waiting on feedback, agents failing, workflows stuck/failed, cost approaching limits, agents circling on tasks.
- [ ] **Notification types** — agent-needs-feedback, agent-error, workflow-failed, workflow-stuck, cost-warning, agent-blocked, agent-idle-too-long.
- [ ] **Grouped display** — notifications grouped by category with timestamps. Links to jump to agent chat, workflow detail, group, etc.
- [ ] **Bulk actions from notifications** — dismiss, pause agent, restart workflow, open chat — directly from notification dropdown.
- [ ] **Auto-clear** — notifications auto-resolve when underlying issue is fixed (agent responds, workflow completes, etc.).
- [ ] **Badge refresh** — poll or websocket for live badge count updates.

### P1: Agent List Pagination
- [x] **Agent list pagination** — client-side pagination with 10 per page, page controls, auto-reset on filter change

### P2: Template Apply Bug
- [x] **Template apply: GROUPS.md/COMMUNITIES.md intermittent** — fixed case-insensitive matching + fallback write ensures files always created

### P3: Per-Agent Cost Limits
- [x] **Per-agent cost limits** — individual agent USD limits stored in agent-state.json, auto-pause when exceeded, editable in agent detail panel, notification on breach

### P4: Forward to Group (Issue #29)
- [x] **Forward to group** — forward button on every chat message, group/community picker dropdown, forwarded messages show origin context

### P5: Group Chat Empty Response Bug
- [x] **Group chat: 2nd agent empty response** — auto-retry on empty, group context prefix, visible error messages instead of silent failure

### P6: System Agents — Creators
- [x] **System agent: workflow creator** — POST /api/workflows/generate (NL to workflow JSON)
- [x] **System agent: org creator** — POST /api/templates/generate (NL to org template JSON)
- [ ] **Template wizard** — UI wizard to create templates from existing agents, workflows, communities, groups
- [ ] **System agent: template creator** — create templates from existing agents and workflows via NL

### Next Up: Dynamic Model Discovery
- [ ] **Dynamic model discovery from provider APIs** — call OpenAI/Anthropic list-models APIs to populate model selectors dynamically instead of a static list. Cache results (TTL ~1hr). Show provider badge per model. Needed for: bulk model change, AI agent generate, add agent wizard, template apply model override.

### Next Up: AI Generate Consistency
- [ ] **Agent AI Generate button** — dedicated "AI Generate" button on Agents page (like Workflows), NL prompt → generates agent files → opens add wizard pre-filled. Include model selector (or AI suggests model based on role). Keep existing AI generate in add wizard too for users who skip.
- [ ] **Template AI Generate UI** — wire the existing POST /api/templates/generate endpoint to a "AI Generate" button on Templates page
- [ ] **Template wizard** — create templates from existing agents, workflows, communities, groups via multi-step wizard

### P7: Community Rules & Workflow Sequencing
- [ ] **Community rules and constraints** — define reusable rules/constraints at community level, inherited by all groups
- [ ] **Workflow sequencing/chaining** — workflows trigger other workflows, dependency graphs, sequential execution

## High Priority (UX) — Completed or In Progress
- [x] **Activity metering loading state** — shimmer placeholder in cost column while metering data loads
- [x] **Issue #31** Templates list view — with select/select-all/bulk-delete
- [x] **Workflow next-run visibility** — next scheduled run + "coming up / running now" view
- [x] **Dark mode audit (Issue #12)** — systematic fixes across agents, templates, workflows, bulk ops
- [x] **BYOK wizard** — 2-step flow: LLM keys + Opik monitoring
- [ ] **UI/UX refinement pass** — polish once workspaces are running with real agents

## High Priority (Quality / Test Automation)
- [ ] **Dashboard regression automation** — coverage for OAuth/auth, agent edit/model save, template apply, workspace switching
- [x] **System template contract tests** — `TEMPLATES/*` under strict validation in CI
- [ ] **Dashboard smoke suite** — one-command local smoke run for key UI/API flows
- [ ] **Clean-room CI hardening** — keep `SYSTEM/test.sh` deterministic, GitHub Actions trustworthy on `main`

## High Priority (Features)
- [ ] **Agent/workflow logs filtering** — by agent or tag
- [ ] **Workspace stats dashboard** — aggregate view with pause/disable

## Medium Priority
- [ ] Template tag filtering
- [ ] **Issue #32** Consolidate cron with OpenClaw native
- [ ] **Issue #10** CI .env handling
- [ ] **Issue #33** Branch protection for main
- [ ] **Issue #11** Clean-room test of setup flow
- [ ] **Issue #13** Agent creation flow missing from agent registry
- [ ] **Issue #15** Agent chat streaming improvement
- [ ] Group chat jitter on mobile (improved but not eliminated)

## Cloud Deployment (April 1st — Separate Team)
- [ ] Cloud infrastructure setup
- [ ] Multi-tenant workspace isolation
- [ ] Cloud management dashboard (ClawMax.ai)
- [ ] Cloud APIs for remote management
- [ ] Billing integration
- [ ] Template marketplace

## On-Premise (v1.3.0 — Future)
- [ ] Remote agent installation
- [ ] Remote setup/management/updates
- [ ] On-premise management dashboard
- [ ] Docker/Kubernetes packaging

---

## Completed (v1.1.5–v1.1.8)

See CHANGELOG.md. Key: Opik metering, cost badges, bulk pause/resume, dark mode audit, BYOK wizard with Opik, metering loading state, workflow next-run, select-all styling, paused agent indicators, bulk operations panel UX.

## Notes

- Notification center is the scaling enabler — build it now with small roster, validate it scales.
- System creator agents (workflow, org, template) unlock non-technical users.
- Community rules + workflow sequencing are the coordination layer for enterprise use cases.
- Full week March 23–31 to land P0–P5, stretch for P6–P7.
