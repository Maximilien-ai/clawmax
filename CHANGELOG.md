# Changelog

All notable changes to ClawMax are documented here.

## [Unreleased]

### Fixes — Opik Attribution
- **User-Aware Opik Metadata** — manual chats, group/direct messaging, and manual workflow runs now stamp real dashboard user identity alongside workspace and agent/workflow identifiers in Opik trace metadata, while scheduled/system runs remain attributed as system activity

## [v1.2.18] - 2026-04-12

### Fixes — Hosted GitHub and Integration UX
- **Hosted GitHub Token Storage** — GitHub partner integration now supports a server-stored runtime token for hosted/non-interactive deployments, while local and operator-managed environments continue to use the existing `gh` CLI auth flow
- **GitHub Readiness Contract** — hosted runtimes without a runtime token now report the missing token directly instead of falling back to misleading local CLI auth guidance
- **GitHub Secret Handling** — GitHub runtime tokens no longer rely on browser vault; the UI now shows server-side token presence without returning the raw token after save

### Fixes — Onboarding, BYOK, and Prereqs
- **Onboarding Workspace Scope** — onboarding visibility now tracks the active workspace’s agent count instead of the global system count, so it no longer disappears after login hydration on empty workspaces
- **BYOK Close Consistency** — saving or skipping integrations now closes all mounted wizard instances consistently instead of requiring repeated close actions
- **Shared Execution Readiness** — template prereqs now treat a saved workspace preferred model as a valid shared execution path
- **Packaged Skill Detection** — packaged skills like `workspace-ls` now resolve correctly in prereq checks instead of warning as missing when the runtime already includes them

### Quality
- **Validation Gate** — validated locally with `npm run typecheck` and `npx ts-node --transpile-only server/lib/workspace-integrations.test.ts`

## [v1.2.17] - 2026-04-12

### Fixes — BYOK, Onboarding, and Cloud Runtime UX
- **BYOK State Sync** — the `BYOK` and `Partners` entrypoints now resync from browser-vault updates so saved provider keys persist visibly across both mounted wizard instances instead of drifting stale
- **BYOK Readiness Pill** — the top-bar `BYOK` trigger now turns green when a usable provider path is available instead of staying hardcoded amber
- **Onboarding / BYOK Race Hardening** — onboarding now suppresses BYOK auto-open directly from `App`, preventing the first-run onboarding flow from being replaced a few seconds later by the BYOK modal
- **Opik Copy Tightening** — Workspaces Integrations now says clearly that browser-stored Opik defaults do not enable runtime tracing, budgeting, or monitoring by themselves; runtime `OPIK_*` env is still required
- **Cloud GitHub Token Path** — hosted/cloud runtimes can now report GitHub readiness from a runtime `GITHUB_TOKEN` or `GH_TOKEN` plus a default repo, while local/on-prem continues to use the `gh` CLI auth flow
- **GitHub Readiness Copy Hardening** — the GitHub partner surface now reflects which auth mode is active instead of implying cloud readiness is still CLI-only

### Fixes — Cloud Ollama Visibility Contract
- **Managed Runtime Ollama Default** — Ollama is now hidden by default in managed/cloud dashboard runtimes so cloud users are not prompted to configure a local model path the deployment cannot actually reach
- **Explicit Ollama UI Override** — added `DASHBOARD_ENABLE_OLLAMA` so operators can force-enable or force-hide Ollama in the dashboard UI as needed
- **Cloud UI Surface Cleanup** — when Ollama is disabled, the dashboard removes Ollama from Workspaces Integrations, onboarding guidance, Add Agent model-selection affordances, and Keys & Secrets inventory

### Docs
- **Env Contract Documentation** — documented `DASHBOARD_ENABLE_OLLAMA` plus the cloud GitHub runtime token contract (`GITHUB_TOKEN` / `GH_TOKEN`) in `SYSTEM/dashboard/.env.example` and `README.md` for CLI/web handoff and deployment clarity

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`

## [v1.2.16] - 2026-04-12

### Fixes — Template Library and Runtime Doctor
- **Partner Cleanup on Main** — removed the unstable Blaxel and Redis template plus partner-definition assets from `main` while preserving the work on their dedicated stabilization branches
- **Managed-Runtime Doctor Copy** — Doctor now uses managed-instance wording for gateway warnings instead of implying desktop/Linux host remediation
- **Runtime Warning Summary** — Activity and System & Logs no longer report `All agents healthy` when runtime warnings are still active

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, the standalone templates test suite, and `./SYSTEM/test.sh integration --with-validation`

## [v1.2.15] - 2026-04-12

### Fixes — Partner Visibility and Workflow UX
- **Partner Surface Consistency** — `Partners` and `Keys & Secrets` now consistently show only the intended `GitHub`, `Senso`, and `Opik` integrations on `main`, including local/dev fallback rendering
- **Onboarding / BYOK Modal Ordering** — onboarding is no longer interrupted by a delayed BYOK auto-open on empty workspaces
- **Workflow Customization Persistence** — select-based kickoff/workflow customization fields now persist correctly into workflow markdown overrides and stop triggering false required-field errors

### Fixes — System Test and Runtime Guidance
- **Communications Test Prompt Hardening** — the `ClawMax System Test` communications step now treats lack of direct transport control as non-fatal and focuses failure on real workflow-context gaps
- **Managed-Runtime Guidance Cleanup** — managed/container runtime messaging avoids desktop/systemd-first gateway recovery guidance

### Quality
- **Validation Gate** — validated locally with `npm run typecheck` and the green `ClawMax System Test` path in cloud after switching to a working model provider

## [v1.2.14] - 2026-04-11

### Docs
- **Partner Follow-Up Branch Tracking** — documented the dedicated Blaxel, Redis, and template-audit follow-up branches in backlog/docs so `main` could stay release-ready while partner stabilization continued separately

## [v1.2.13] - 2026-04-11

### Fixes — Partner Skill Installs
- **Non-Interactive Curated Partner Installs** — curated partner installers now use the correct non-interactive Skills CLI flags for multi-skill repos, preventing Blaxel and Redis installs from stalling on hidden selection prompts
- **Installed-State Follow-Through** — partner install surfaces now keep an explicit `Installed` state after successful curated installs instead of dropping back to a generic install button

### Fixes — Workflow Communication Delivery
- **Workflow Session Delivery Guidance** — workflow participant runtime instructions now explicitly tell agents to return plain-text results in-session and not call direct message/send tools for the current workflow group or community delivery path

### Fixes — Gateway Health Detection
- **Gateway Probe Fallback** — gateway health checks now fall back to a direct TCP probe when `lsof` is unavailable
- **Token-Backed Doctor Probe** — Doctor now uses an authenticated in-instance gateway responsiveness probe before classifying the gateway as unavailable

## [v1.2.12] - 2026-04-11

### Features — Onboarding and Workspace Flow
- **Onboarding Template Suggestions** — the onboarding wizard now uses a wider templates step, category-aware focus/goal guidance, clickable starter cards, and direct open of the selected template instead of only sending users to a generic templates list
- **AI-First Agent Start Path** — onboarding now opens agent creation in AI mode automatically when BYOK/runtime is already configured with a usable LLM path
- **Workspace Path Conflict Recovery** — creating a workspace over an existing path now returns an explicit conflict flow with `Open Existing`, `Use Existing`, and `Overwrite` actions instead of a dead-end “path is not empty” toast
- **Document Download** — files opened in Documents can now be downloaded directly from the document toolbar

### Fixes — Runtime, Cloud, and Messaging
- **Workspace Export Rate Limit Bypass** — workspace export is no longer blocked by the generic API rate limiter under normal dashboard polling load
- **Managed Runtime Gateway Guidance** — Doctor and chat fallback messaging now avoid machine-local command guidance as the primary recovery path on managed/container runtimes
- **Agent Chat Failure Rendering** — empty or failed chat replies now surface a clear assistant-side error state instead of blank bubbles or stuck typing blocks
- **Workflow Communication Diagnostics** — common communication delivery failures now render as a product-level explanation that the target group/community is missing or misconfigured
- **Metering Empty-State Copy** — Activity empty metering copy is less misleading while traces are still arriving

### Fixes — Auth Email Rendering
- **OTP Dark-Mode Hardening** — one-time-code emails now use explicit inline colors for header, body, OTP card, code text, and security/footer copy so dark-mode mail clients keep the message readable

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`

## [v1.2.11] - 2026-04-10

### Features — Template Feedback
- **Template Feedback Routing** — users can now leave template ratings and short written feedback, and that feedback can be routed either to the local workspace JSON file or to an optional remote endpoint

### Docs
- **Developer Feedback Routing Notes** — README now documents the local JSON path plus the optional remote endpoint env vars

### Quality
- **Release Gate** — validated locally with `npm run typecheck` and `npx ts-node --transpile-only server/lib/templates.test.ts`, with GitHub CI green on commit `c6af61f`

## [v1.2.10] - 2026-04-10

### Features — AI Template Quality
- **Example-Aware AI Generation** — long prompts with examples, URLs, and style references now flow into generated workflow content more explicitly instead of being flattened into generic instructions
- **Workflow Structure Follow-Through** — AI-generated templates now preserve kickoff-first, middle-work, and final-output structure more reliably, with scaling metadata where the prompt implies batch work
- **Prompt and Input Preservation** — template regenerate/refine now preserves user-pinned names and custom workflow input blocks rather than overwriting them on every AI pass
- **Typed Workflow Run Inputs** — workflow run forms now support typed text, checkbox, and select inputs derived from generated `Run Inputs` metadata

### Fixes — Template Apply and Multi-Template Workspaces
- **Agent Registration Reliability** — agents created through template apply now register in the active workspace `openclaw.json` path more reliably, preventing immediate “agent not found” runtime failures after apply
- **Workflow Conflict Hardening** — repeated applies now detect more workflow-level conflicts before import, including workflow id/name overlap and dependency alias collisions
- **Legacy Dependency Alias Normalization** — organization template import now normalizes broken legacy dependency ids like `kickoff` or `team-kickoff` to the actual workflow ids present in the applied template
- **Preferred Model Recovery Path** — template apply prereqs now link directly into preferred-model setup so users can resolve missing shared execution defaults without leaving the flow blind

### Fixes — Template Library and Validation
- **Canonicalized Organization Templates** — another batch of built-in org templates was normalized for explicit kickoff/final structure and workflow scaling metadata
- **Scaling Metadata Validation** — normalized templates and template validation now align on `scaling` / `parallelism` limits, and the public templates repo schema/validator was updated accordingly

### Quality
- **Integration + Template Validation Gate** — validated locally with `npm run typecheck`, `./SYSTEM/test.sh integration --with-validation`, and repeated manual apply/run/delete checks across Camera West, dive, meal-planning, and travel-photography flows

## [v1.2.9] - 2026-04-08

### Fixes — Workflow Apply and Execution
- **Template Apply Workflow Conflicts** — repeated applies in busy workspaces now detect workflow-name conflicts alongside agent and channel conflicts, support rename-on-apply, and provide direct recovery paths back to the right wizard step from a blocked Deploy state
- **Same-Agent Concurrent Workflow Locking** — workflows that hit the same agent concurrently no longer fail with `session file locked`; same-agent workflow execution is serialized while different agents still run in parallel
- **Workflow Pause/Resume First Pass** — workflow controls now surface explicit pause/resume actions in cards, tables, and DAG view using the existing enabled/disabled workflow behavior
- **DAG Selection Follow-Through** — DAG view now supports proper node/pipeline selection behavior so bulk workflow actions work consistently in the graph view

### Fixes — Metering and Budget Visibility
- **Fallback Spend Estimation from Tokens** — workspace/activity metering now derives estimated spend from model + token counts when Opik traces lack an explicit `estimated_cost_usd`, fixing misleading `$0.0000` dashboards on real traced usage
- **Shared Pricing Logic** — Opik tracing and metering aggregation now share the same model-pricing helper so new traces and aggregated traces stay aligned
- **User-Facing Cost Rounding** — activity, agents, workflows, workspace edit, and shared dashboard cost displays now round to 2 decimals for cleaner budget/readability

### Fixes — Agent and Activity UX
- **Clickable Agent Detail Files** — recent workspace files and key doc references in the agent detail panel now open directly instead of forcing manual navigation
- **Activity Type Labels** — generic markdown/file activity now shows readable types like `markdown` and `file` instead of filename stems
- **Opik Loading/Empty Messaging** — activity metering now explains when Opik data is still being collected or when no traces have appeared yet
- **Agent Action Popup Anchoring** — agent action menus no longer drift or clip incorrectly in cloud/narrow layouts

### Fixes — Mobile and Responsive UX
- **Mobile Notifications Sheet** — notifications now use a centered mobile sheet with safe width, backdrop, and internal scrolling instead of an off-screen desktop dropdown
- **Top Bar Narrow Layout Cleanup** — the top bar now wraps cleanly on smaller screens and hides lower-priority text until there is room
- **Template Apply Modal Mobile Shell** — apply modal padding/height handling is safer on narrow/mobile screens

## [v1.2.6] - 2026-04-05

### Fixes — Cloud Runtime Bootstrap
- **Runtime-Capable Docker Image** — the runtime image now installs the `openclaw` CLI instead of shipping a dashboard-only container that cannot register or execute real agents
- **Container Entrypoint Bootstrap** — cloud/on-prem startup now initializes `HOME`, `OPENCLAW_WORKSPACE`, required workspace directories, and `gateway.mode=local`, and fails fast if `openclaw` is missing
- **Gateway Start Attempt on Boot** — container startup now attempts to bring up the OpenClaw gateway automatically so fresh deployments have a real runtime path before Doctor/manual repair
- **Persistent OpenClaw State in Compose** — Docker Compose now persists `~/.openclaw` separately from workspace files so agent registration and session state survive container restarts

### Fixes — Template Apply Readiness
- **Workflow-Aware GitHub Prereqs** — template apply readiness no longer hard-fails GitHub CLI checks for `clawmax-system-test` unless GitHub coordination is actually enabled for that apply

### Docs
- **Cloud Runtime Persistence Note** — README now calls out that cloud/on-prem deployments must persist both workspace files and OpenClaw state

## [v1.2.5] - 2026-04-03

### Features — Secure Runtime Inputs
- **Browser-Local Secrets** — template apply, workflow runs, and skill detail views now support browser-local secret/input prompts so users can provide API keys, slugs, event URLs, and similar runtime values without writing them into workflow markdown or server config by default
- **Lu.ma Event Analysis Desk** — added a Lu.ma analysis template plus starter `luma-event-insights` custom skill with secure browser-local prompts for event scope and API access

### Fixes — Test Harness and Template Apply
- **Fresh System-Test Workspace Setup** — `SYSTEM/test.sh` now recreates `ClawMax System Test` before apply so stale hidden files do not leak into integration runs
- **Imported Workflow Visibility Wait** — the integration harness now waits for template-imported workflows to appear before asserting or triggering them
- **Template Workflow Dependencies Audit** — multi-workflow organization templates now preserve proper kickoff-first DAG sequencing instead of running later stages in parallel by mistake
- **Template Tag Coverage** — every organization template community, group, and workflow now has at least one tag, improving consistency across apply, search, and downstream tooling

### Fixes — Dashboard Readability and Spend
- **Markdown Rendering in Shared Dashboards** — notifications, workflow summaries, and group chats now render markdown correctly, including light-mode code blocks
- **Scrollable Shared Cards** — dashboard notifications, workflows, and group chat panels now scroll internally instead of overgrowing the page
- **Workflow Spend Attribution** — workflow spend now includes traced agent-call cost from workflow runs instead of showing `$0.0000` for active workflows

## [v1.2.4] - 2026-04-03

### Features — Setup and Auth
- **Email OTP in `setup.sh`** — local setup now offers Email OTP, bypass, GitHub OAuth, or production Email OTP instead of forcing the old bypass-vs-GitHub split
- **Developer OTP Setup Prompt** — `setup.sh` now asks for the developer login email and explains that local dev codes are written to `.clawmax-otp-dev.json`
- **Auth Docs Clarified** — auth docs now recommend concrete Email OTP defaults for local tooling/bootstrap flows and remove stale GitHub auth guidance

### Fixes — Doctor and Navigation
- **Doctor Error Hardening** — Doctor UI no longer crashes when `/api/agents/doctor` returns a partial or error payload
- **Doctor Empty-State Shape** — backend doctor route now returns a consistent empty-state response when no agents directory exists
- **Sidebar Regrouping** — sidebar now cleanly groups `Templates/Skills` separately from `Activity/System & Logs`
- **Template Prereq Guidance** — template apply now points users to `System & Logs → Doctor → Auto-Fix`

### Fixes — Workspace Dashboards
- **Light/Dark Theme Consistency** — shared workspace dashboards now render correctly in both theme modes
- **Compact Dashboard Density** — compact mode defaults are tighter and more informative while staying closer to a one-page summary
- **Standard/Detail Workflow Layout** — workflow-heavy dashboard views now give workflows full-width room instead of leaving dead space beside them

## [v1.2.3] - 2026-04-03

### Features — Authentication
- **Email OTP Dashboard Auth** — added a new dashboard auth mode between GitHub OAuth and bypass for single-user cloud/on-prem installs
- **Resend-backed OTP Delivery** — OTP codes now send through the dashboard backend with short-lived, hashed, single-use verification
- **Developer OTP Flow** — local developer mode now writes the latest code to `.clawmax-otp-dev.json` and the login UI points to it directly
- **ClawMax-styled OTP Email** — OTP delivery now uses both HTML and text bodies aligned with the ClawMax web/backend email style

### Features — Templates
- **50+ Organization Templates in App** — added ten new proposal templates across movies, astronomy, arXiv digests, market signals, AI model evaluation, product research, competitive analysis, rapid website building, and blog launch
- **25 Reusable Agent Templates** — pulled repeated roles into reusable agent templates for events, testing, customer research, competition, prototype building, market analysis, astronomy guidance, and GitHub triage
- **Public Templates Repo at 50** — synced the new org templates to the public `Maximilien-ai/templates` repo and validated the full 50-template directory set

### Quality — Auth and Template Validation
- **Focused OTP Auth Tests** — added request/verify/reuse/expiry coverage for the new OTP auth flow
- **Main Test Harness Coverage** — wired the OTP auth suite into `SYSTEM/test.sh` so it runs in the normal release gate
- **Template Validation Pass** — app template tests and public templates validation both pass with the expanded catalog

## [v1.2.2] - 2026-04-02

### Features — Templates and Discovery
- **Event Planning Proposal Templates** — added `Small Event Planning Desk`, `Speaker Event Studio`, and `Conference Ops Hub` in both the app repo and public templates repo
- **Scalable Event Roles** — small, medium, and large event templates now scale one coordination role each so customers can increase team size naturally
- **Events Filter in Templates UI** — new `Events` filter chip makes the event templates easier to discover without exact-name search

### Fixes — Communication and Chat
- **Default Channel Fan-out** — group and community messages now go to all members by default unless the user narrows with explicit `@mentions`
- **Agent Chat Streaming** — the live agent chat panel now streams stdout deltas through the SSE route instead of waiting for the full turn to finish
- **Agent Chat Session Continuity** — the dashboard chat route now passes its explicit session id through to OpenClaw so live chat state is more consistent

### Docs and Release Hygiene
- **Testing Guide Refresh** — updated testing guide for current `ClawMax System Test` paths, clean-state behavior, custom ports, and the remaining clean-room gap
- **Backlog / Issue Cleanup** — closed the default-`@all` UX issue, created the event-template follow-up issue, and reduced the open tracker to the real remaining work

### Tomorrow
- **Core remaining issues** — `#94` temp chat/runtime wrong-workspace resolution, `#8` Anthropic per-agent auth/runtime behavior, and `#95` event-template validation/refinement are the main next slices

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

### Follow-up
- **Known Runtime Follow-up** — temporary chat/direct runtime can still resolve duplicate agent IDs against the wrong global OpenClaw workspace record when the same agent id exists in multiple workspaces. This is tracked as high-priority issue `#94`.

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
