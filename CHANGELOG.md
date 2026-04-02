# Changelog

All notable changes to ClawMax are documented here.

## [v1.2.1] - 2026-04-02

### Fixes — Workspaces Integrations
- **Optional Integration Save Flow** — optional partner/provider validation failures no longer block save, and warnings now clearly name the failing integrations
- **Toast Visibility** — validation toasts now render above the integrations modal instead of behind it
- **Discovered Model Loading** — Gemini and Ollama discovered models now populate the preferred-model selector when available
- **Ollama Model Picker** — installed local Ollama models are surfaced inline with refresh support and one-click selection

### Fixes — Runtime Defaults and Import Validation
- **Workspace Integration Defaults Persistence** — non-secret Senso and GitHub defaults persist per workspace and flow back in after restart
- **Runtime Follow-Through** — saved GitHub repo and Senso context defaults now flow into template apply, workflow structured inputs, and runtime context
- **Template Import Schema Validation** — `TEMPLATE.md` imports now validate against the shared schema before save

### Fixes — Testing, Export, and Workflow Reliability
- **Workspace Export Reliability** — workspace zip exports no longer truncate on download, and exported workspaces include a recovery manifest
- **System Test Cleanup** — deleting agents now removes shared agent-state residue so test runs do not pollute future workspaces
- **System Test Workspace Resolution** — `SYSTEM/test.sh` now resolves the real system-test workspace id/path and supports custom dashboard ports cleanly
- **Workflow Rerun Reset** — rerunning an upstream workflow now recursively resets downstream DAG progress/status instead of showing stale completion from an earlier run
- **System Test Group Messaging Guidance** — group-targeted system-test workflows now use the current workflow group channel rather than depending on separate session labels

### Fixes — Skills, Doctor, and UI Polish
- **Packaged ClawMax Skills in Catalog** — repo-root packaged skills such as `workspace-ls` now appear in Skills Manager instead of only showing as assigned orphan skills
- **Doctor / Prereq Messaging** — gateway and key warnings better reflect configured ports and browser BYOK reality
- **Bulk Model Search** — bulk model operations now include live search with quick clear
- **Workspace Switcher Actions Layout** — workspace row actions no longer overlap long workspace names
- **DAG Connector / Unread Badge Polish** — workflow connector lines align correctly across zoom levels and Communication unread badges are visible again

### Features — Discovery
- **Template / Workflow Suggestions** — search now suggests nearby templates and workflows instead of dead-ending on weak or empty matches

## [v1.2.0] - 2026-04-01

### Features — Workspaces Integrations
- **Workspaces Integrations** — unified setup surface for Models, Senso, Opik, and GitHub
- **Gemini Provider Support** — save and validate Gemini keys through the hosted-provider flow
- **Ollama Local Provider Support** — configure local Ollama runtime, discover installed models, and validate local reachability
- **Integration Validation** — key checks for OpenAI, Anthropic, Opik, Gemini, and Ollama with live/fallback status
- **Template Apply Defaults** — saved Senso and GitHub defaults flow into organization template apply

### Features — Workspace Dashboards
- **Shareable Workspace Dashboards** — generate persistent read-only workspace dashboard links with copy/open/delete management
- **Display Modes** — compact, standard, and detail stakeholder views
- **Compact Summary Charts** — dense agent/workflow/notification summary bars
- **Result Artifact Normalization** — dashboards show normalized links and workspace artifact references instead of only raw logs
- **Workflow Input Summaries** — dashboards prefer structured kickoff/project configuration extraction over brittle log tails
- **Cost Trend Summaries** — cost section now shows today, last 7d, avg/day, and workflow spend ranking

### Features — Templates
- **Expanded Template Catalog** — new proposal template families across Science, Travel, Hobbies, Family, and Personal assistant/finance use cases
- **Reusable Agent Templates** — added Research Lead, Data Engineer, Data Analyst, Briefing Writer, People Researcher, Literature Reviewer, and Experiment Planner templates
- **Template Emoji Metadata** — optional emoji support across org, agent, and workflow templates
- **Collapsible Template Sections** — Agent / Organization / Workflow sections can be collapsed in the Templates explorer
- **Workflow Import UX** — first-pass `WORKFLOW.md` import via paste/upload from the Workflows page
- **Template Delete Confirmation** — typed consequence/confirm dialog for deleting user-created templates

### Features — Runtime and Delivery
- **Structured Workflow Inputs in Execution Records** — workflow execution records now persist structured kickoff/start inputs
- **Docker Deployment Support** — canonical `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and production path fixes in the public repo
- **Managed Workflow Metadata Alignment** — template workflows now carry explicit owner metadata and slug-aligned ids

### Fixes
- **Compact Dashboard Reorder** — same-column upward reorder now works reliably
- **Template Explorer Stability** — fixed templates page hook-order crash after adding collapsible sections
- **Senso / GitHub / Dashboard polish** — workspace dashboard visibility, result extraction, and integrations UX follow-through

## [v1.1.20] - 2026-03-29

### Features — Workflow v2
- **Workflow DAG Visualization** — interactive dependency graph with parallel lanes, connecting lines, zoom controls, and edit mode
- **DAG Execution Engine** — auto-advance pipeline when workflows complete, check dependencies, trigger ready dependents with BYOK keys
- **Interactive DAG Editing** — click to add/remove dependencies, cycle detection, undo (Ctrl+Z), visible × on lines
- **Workflow Progress Tracking** — intermediate progress from stdout activity + participant completion, progress bars in DAG view and Workflows page
- **Blocker Surfacing** — 5 blocker types (approval, choice, input, delegation, waiting) with dynamic UI in NotificationCenter
- **WORKFLOW.md Format** — parse + serialize + round-trip, import/export APIs
- **Workflow Types** — `once`, `recurring`, `conditional` with `dependsOn` array for DAG sequencing
- **All templates have DAG dependencies** — kickoff → fan-out → pipeline → fan-in patterns

### Features — Templates
- **Lean TEMPLATE.md** — frontmatter reduced from 248 to ~19 lines, structured markdown body with ## Agents, ## Communities, ## Groups, ## Workflows sections
- **14 Organization Templates** — Business (7), Technical (4), Personal (3) with kickoff workflows targeting all agents
- **Smart Workflow Customization** — paginated wizard with dynamic form fields (dropdowns for known values, checkboxes for yes/no, textareas for multi-line)
- **GitHub Coordination Toggle** — checkbox adds github/gh-issues skills + injects repo instructions
- **Template Cross-Validation** — agent/group/community/workflow reference checking on import
- **Export Buttons** — download TEMPLATE.md / WORKFLOW.md from detail views

### Features — Notifications
- **Dynamic Blocker UI** — approval buttons, choice pills, input field + submit, agent picker dropdown, waiting indicator
- **Inline Agent Actions** — restart + pause from notifications with toast feedback and status refresh
- **Notification Search** — filter by title, message, entity, type (shows at 4+ notifications)
- **Auto-detect Agent Blockers** — questions and errors from agent output create notifications automatically
- **Dismissed Stay Dismissed** — monitor no longer recreates dismissed notifications

### Features — Skills
- **Shipables.dev Registry** — search, browse categories, install with one click, "Installed" state tracking
- **Bulk Skill Assignment** — add skills to multiple agents from Agents page
- **AI Generator Anthropic Fallback** — works with Anthropic-only BYOK keys (issue #49)

### Features — Testing
- **78 Unit Tests** — notifications (15), workflows (23), validator (9), templates (31), plus existing suites
- **ClawMax System Test Template** — dedicated template with 3 test agents, 5 DAG workflows, scalable 1-10
- **Integration Test Runner** — `./SYSTEM/test.sh integration` creates workspace, applies template, tests live agents
- **Cost Tracking** — integration tests estimate ~$0.01-0.05/run on gpt-4o-mini

### Bug Fixes
- **Agent status checks shared gateway** — fixes offline status for agents without dedicated port
- **Guard `.toFixed()` / `.communities` / `system.*`** — prevent undefined access crashes across all pages
- **OAuth default** — shows setup instructions instead of broken button when not configured
- **Chat error styling** — ANSI stripping, dark mode, error detection, dismiss button
- **Template import generates IDENTITY.md** — agents get proper name/role/tags from template data
- **Workflow creation** — auto-assigns owner for managed mode, accepts "once" schedule

### Specs Published
- `SYSTEM/docs/specs/TEMPLATE_MD_SPEC.md` — formal TEMPLATE.md specification
- `SYSTEM/docs/specs/WORKFLOW_MD_SPEC.md` — formal WORKFLOW.md specification
- Published to [github.com/Maximilien-ai/templates](https://github.com/Maximilien-ai/templates) and [github.com/Maximilien-ai/workflows](https://github.com/Maximilien-ai/workflows)

### Releases
- v1.1.16 (Mar 27) — Deep Agents Hackathon
- v1.1.17 (Mar 28) — Workflow v2 specs + notifications
- v1.1.18 (Mar 28) — DAG visualization + templates
- v1.1.19 (Mar 28) — Aggregate progress + export buttons
- v1.1.20 (Mar 28) — DAG editing + zoom + fixes

## [v1.1.8] - 2026-03-22

### Fixes
- **BYOK execution correctness** — direct agent chat and manual workflow execution now use the resolved BYOK/user/system key policy instead of drifting to stale per-agent auth history.
- **Runtime auth-state override** — agent runs temporarily patch `auth-profiles.json` and agent model state for the duration of execution, then restore prior state afterward.
- **Dashboard env isolation** — provider keys now come from `SYSTEM/dashboard/.env` policy instead of ambient shell exports, with explicit precedence for system vs user execution.
- **Clean-room CI stabilization** — GitHub Actions now runs on `main`/tags, setup avoids non-interactive terminal failures, skills discovery is deterministic in CI, and the system test suite no longer hard-fails just because a fresh workspace lacks seeded demo data.

### Testing
- **Execution-state regression coverage** — added unit tests for temporary auth-profile/model overrides during runtime execution.
- **Skills test isolation** — workspace skill import tests now run in an isolated temp workspace instead of relying on real `~/.openclaw` state.

## [v1.1.7] - 2026-03-22

### Features
- **Workspace Reordering** — drag to reorder workspaces in the switcher, with persisted local order and stable active-workspace selection.
- **Scalable Templates and Communication Views** — sortable list/table modes, selection, select-all, bulk actions, and bulk delete flows for large collections.
- **Agent Config Validation** — pre-save validation on add/edit flows with advisory warnings for legacy content and stricter blocking for malformed config.
- **BYOK Preview Wizard** — top-bar `BYOK Preview` flow for dev testing with masked OpenAI/Anthropic inputs, system-vs-user key messaging, and local browser persistence.

### Fixes
- **OAuth redirect flow** — login and logout now return to the dashboard app origin instead of dropping users on the raw API server.
- **Login page refresh** — hero background and login shell now match the ClawMax.ai marketing visual treatment more closely.
- **Logout stability** — auth teardown no longer crashes protected pages during repeated login/logout cycles; top-bar user info and logout are visible.
- **Provider key isolation and precedence** — user agent/workflow execution now prefers BYOK then `USER_*` defaults, system execution now prefers dashboard-local system keys, and shell exports no longer implicitly drive provider policy.
- **Production root route** — dashboard serving is more robust and avoids `Cannot GET /` when client assets are present or dev redirects are needed.
- **Release readiness** — `npm run build` works again with `tsconfig.server.json`; README, OAuth docs, env examples, and release checklist were updated.
- **Mobile agent details** — wider responsive slide-over, improved wrapping for long values, and better touch targets on small screens.

### Testing
- **System template audits** — strict tests now validate shipped `TEMPLATES/*` content.
- **Agent model/config regression coverage** — added tests for legacy identity formats, model parsing, and live model updates.
- **Dashboard test harness auth fix** — `SYSTEM/test.sh` now prefers the live server token and can authenticate protected API checks again.

## [v1.1.6] - 2026-03-20

### Features
- **GitHub OAuth Authentication** — login via GitHub with JWT session cookies. Login page, user avatar + logout in sidebar. Supports allowed-user whitelist via `GITHUB_ALLOWED_USERS`. Falls back to dashboard token for API clients. Auth gate shows login when GitHub is configured.
- **Workspace Cost Budget** — per-workspace USD budget with progress bar on Activity page. Yellow warning at 80%, red when exceeded. Auto-pauses agent chat and workflow execution when budget is exhausted. Editable limit, toggleable enforcement.
- **Budget API** — `GET /api/budget` (status), `PUT /api/budget` (update config). Budget stored in `WORKSPACE/SYSTEM/budget.json`.

### Fixes
- **Unread red dot on list view** — `ChannelCard` (Communication list view) now shows unread message count badge, matching grid view behavior

### Security
- **Security audit** — full audit of dashboard, API endpoints, agent execution, file access, env vars (27 issues identified, critical/high remediated)
- **Auth enabled by default** — `DASHBOARD_AUTH_DISABLED` now defaults to `false`; `.env.example` provided with placeholder values
- **Rate limiting** — `express-rate-limit` middleware: 200 req/min global, 10 req/min on auth endpoints
- **Audit logging** — all API requests logged to `server/logs/audit.log` (timestamp, method, path, status, token hash, duration)
- **Env var whitelisting** — child processes (openclaw CLI) receive only whitelisted env vars via `safeEnv()` instead of full `process.env`
- **Port validation** — numeric validation before shell exec in agent restart (`kill -9`) and PID validation on lsof output
- **Path traversal fix** — `readWorkspaceFile`/`writeWorkspaceFile` now resolve symlinks before prefix check
- **GitHub URL validation** — strict HTTPS-only regex for skill import git clone (prevents command injection)
- **CORS configurable** — origin now reads from `CORS_ORIGIN` env var (was hardcoded to localhost:5173)
- **Gitignore hardened** — `.dashboard-token` and `server/logs/` added to `.gitignore`

## [v1.1.5] - 2026-03-19

### Features
- **Opik Token Metering** — full pipeline: traces agent chats + workflow executions to Opik, metering dashboard on Activity page, per-agent cost breakdown
- **Agent Cost Badges** — 💲 cost on grid cards + detail view with tooltip (calls, tokens, cost)
- **Agent Cost Column** — sortable Cost column in agent table view (replaces WhatsApp)
- **Workflow Cost Display** — cost shown on workflow cards and list view
- **Unread Message Indicators** — red dot with count on Communication cards + nav sidebar badge
- **@Mention Grouping** — role groups with Tab-to-expand for individual targeting
- **Group Chat Markdown** — ReactMarkdown + brace-depth JSON/ANSI cleanup

### Fixes
- Sequential agent calls with 3s delay (gateway contention)
- Agent pluralization fixed across all views
- Grid card layout: name line + ID/cost/chat/file line
- Communication card: trash bottom-right
- Workflow card: file icon bottom-right
- Template agent display names (title case)
- CEO removed from Status group
- Merged 3 agent PRs (#34 schema paths, #36 workflow schema, #37 template groups)

## [v1.1.4] - 2026-03-19

### Features
- **Opik Token Metering** — traces agent chats and workflow executions to Opik. Metering dashboard on Activity page with per-agent breakdown (calls, tokens, cost).
- **Agent Cost Badge** — 💲 cost indicator on agent cards (grid + detail) with tooltip showing calls, tokens, and estimated cost.
- **Unread Message Indicators** — red dot with count on Communication channel cards. Nav sidebar badge shows total unread from any page.
- **@Mention Grouping** — role-based grouping in dropdown (e.g., "@Engineer 2 agents"). Tab/tap to expand for individual targeting.
- **Group Chat Markdown** — agent messages render as formatted markdown with ReactMarkdown.
- **Workflow Tracing** — each execution traced to Opik with duration, participant count, status.

### Fixes
- Group chat JSON/ANSI cleanup (brace-depth tracking)
- Agent pluralization fixed across all views
- Chat history persistence (stable session IDs)
- Sequential agent calls to avoid empty responses
- Action menu overflow (opens upward on list view)
- Template agent display names consistent (title case)
- CEO removed from Status group in small startup template
- 3 agent PRs merged (#34 schema paths, #36 workflow schema, #37 template groups)

## [v1.1.3] - 2026-03-18

### Features
- **Workflow Scheduler** — Built-in cron scheduler runs enabled workflows on schedule automatically
- **Workflow Run Limits** — Set maxRuns to auto-disable workflows after N executions
- **AI Cron Generator** — Type schedule in plain English, AI generates the cron expression
- **Parameterized Templates** — Customize agent counts (+/- controls) when applying org templates
- **Template Workflow Display** — Template cards and detail popups show included workflows
- **1:1 Chat Polling** — Agent-initiated messages now appear in real-time (3s polling)
- **Mobile Responsive** — All pages, chat panels, modals, and toolbars work on mobile
- **Agent Config Validation** — Tags, name, and WhatsApp format validated on save
- **Template Apply Progress** — Toast notifications show step-by-step progress

### Templates
- **Small Startup Team v1.1.3** — 5 agents (CEO, PM, Engineers, QA, Release), 7 dev lifecycle workflows (standup, status, triage, PR review, coding, merge, release), parameterized counts for engineers/QA/PM
- **Engineering Team v1.1.0** — 4 agents with github skills, PR review workflow
- **Test Template v1.1.0** — Status check workflow with run limits

### Fixes
- Group chat auto-scroll no longer steals input focus on mobile
- Group chat flicker eliminated during 2s polling
- Group chat "responding" indicator auto-clears after 30s
- CI resilient to upstream OpenClaw CLI changes (stub fallback)
- Chat API key validation — clear error instead of cryptic timeout
- Chat timeout increased to 3 minutes for cold gateway starts
- Workflow cards refresh when detail pane loads (stale count fix)
- Workflow run count persisted and displayed correctly
- Template apply creates auth profiles for imported agents
- All modal dialogs mobile responsive (15+ components)
- All page layouts with proper mobile padding
- Agent roster toolbar wraps on mobile

### PRs
- Merged #19 (start.sh .env fix), #20 (SETUP.md)
- Closed #21-25 (empty commits from Engineer agent)

## [v1.1.2] - 2026-03-17

### Features
- Model override when applying org templates (collapsible section with provider-grouped dropdown)
- Agent config editor (edit IDENTITY.md, SOUL.md, TOOLS.md from UI)

### Fixes
- Dark mode workflow tags on Organizations page
- Workflow confirmation dialogs removed
- package-lock.json committed for reproducible installs

## [v1.1.1] - 2026-03-17

### Fixes
- Gateway port auto-detection (probes 18789 and 18889)
- Ngrok auth failure detection
- Test template switched to openai/gpt-4o-mini

## [v1.1.0] - 2026-03-16

### Features
- Multi-workspace support with workspace switcher
- Organization templates (Small Startup, Engineering Team)
- Workflow editor with cron presets
- Dark mode support

## [v1.0.0] - 2026-03-14

### Initial Release
- Agent management dashboard
- Real-time chat via gateway
- Group and community chat
- Workflow designer and execution
- Skills assignment (50+ built-in)
- Activity feed
- 95 tests passing
