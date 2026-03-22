# Changelog

All notable changes to ClawMax are documented here.

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
