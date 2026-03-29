# Backlog

> Last updated: March 28, 2026
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

## Deep Agents Hack — March 27 (immediate)
> Plan: `docs/hacks/deep-agents-hack/PLAN.md`

### Hackathon Deliverables
- [x] **Template wizard** — multi-step UI: team type → composition → communication → workflows → preview
- [x] **Template AI Generate** — AI fills wizard steps from NL description, human confirms
- [x] **Kickoff workflow** — manual trigger on template apply, user-fillable Project Configuration sections
- [x] **Basic blocker surfacing** — 5 blocker types (approval, choice, input, delegation, waiting) with dynamic UI in NotificationCenter
- [x] **Workflow progress tracking** — progress API, progress bars in Workflows page + DAG view + notifications
- [x] **10 org templates** — Sales, HR, Support, Legal, Marketing, Convenience Store, Dev Team, Student Research, Technical Writing, RAG Team (+ existing Engineering, Small Startup)
- [x] **Shipables.dev integration** — search, browse, install skills from registry
- [x] **Bulk skill assignment** — add skills to multiple agents at once
- [x] **GitHub coordination toggle** — checkbox in Apply Template, injects repo instructions into all workflows
- [x] **Editable workflow content** — customize kickoff and all workflows before applying
- [x] **Template categories** — Business/Technical/Personal filter pills
- [x] **TEMPLATE.md format** — parser + auto-detect alongside template.json
- [x] **AI generator Anthropic fallback** — works with Anthropic-only keys (issue #49)
- [x] **Live execution** — deployed Small Startup on weave-cli, DAG cascading, progress tracking working

### Backlog from Hackathon
- [ ] **Chat message normalization** — server-side: normalize gateway payloads before sending to client, strip JSON wrappers, ANSI codes, and internal metadata at the API layer instead of client-side regex. Currently the client does best-effort parsing of raw gateway formats (`[ { id, from, content } ]`, `{ payloads }`) which is fragile.
- [x] **Specialty Retailer template** — done
- [x] **Data Team template** — done
- [ ] **AI Generate outputs TEMPLATE.md** — generate markdown format from wizard
- [ ] **Wizard exports as TEMPLATE.md** — download/save as markdown
- [ ] **Browse Shipables catalog in Skills page** — embedded browsing without opening import dialog
- [ ] **Imported Shipables skills emoji/metadata** — skills imported from registry don't show emoji in skill cards

### Backlog from March 28 Sprint + Live Execution
- [ ] **Workflow import should use template's id field** — currently auto-generates from name, breaking dependsOn references
- [ ] **Project context in agent identity on template apply** — kickoff gives context but should also write to IDENTITY.md so agents remember across sessions
- [ ] **Rate limit notification** — surface API rate limits as warning notifications with retry suggestion
- [ ] **Workflow re-run resets status** — when re-triggering a completed workflow, reset all downstream deps to idle
- [ ] **DAG auto-advance on cron triggers** — currently only manual triggers cascade; cron-triggered completions should also advance DAG
- [x] **DAG auto-advance on execution complete** — done, workflows cascade automatically
- [x] **DAG auto-refresh** — 10s silent polling in DAG view
- [x] **Intermediate progress estimation** — stdout-based progress for single-agent, participant-based for multi-agent
- [x] **Dismissed notifications stay dismissed** — monitor no longer recreates dismissed notifications
- [x] **Agent blocker detection from output** — questions and errors auto-create notifications
- [x] **Kickoff targets all agents** — every team member gets project context

## Multimodal Frontier Hack — March 28 (immediate)
> Plan: `docs/hacks/multimodal-frontier-hack-mar28/PLAN.md`

### Hackathon Deliverables
- [x] **10 multimodal template specs** — full slate across business, technical, public sector, healthcare, and creative categories
- [x] **Senso-first foundation execution** — `Real-Time Research Desk` template, Senso-backed intake, and demo artifacts created
- [ ] **3 showcase templates implemented** — Visual QA Lab, Customer Signal Desk, Retail Watchtower
- [x] **Shared Senso-backed skills** — ingest, search, generate, triage, routing, learning-loop, MCP access
- [x] **Shipables.dev / SkillsHub reuse pass** — search the sponsor ecosystem before building any new skills
- [x] **Missing skill publication** — published `senso-ingest-clawmax` and `senso-search-clawmax`
- [x] **Live execution results** — foundation flow reached live demo state with captured Senso evidence IDs and fallback final brief
- [x] **Demo packaging** — screenshots, outputs, sponsor-tool mapping, final brief, and 3-minute talking points

### Backlog from Hackathon
- [x] **Senso integration path in dashboard/templates** — make Senso-backed skills and memory wiring first-class in template flow
- [ ] **Result artifact standardization** — selected templates should produce consistent visible outputs, not just chat traces
- [ ] **Template breadth publication** — publish remaining 6 non-showcase template specs after the selected flows stabilize
- [ ] **Finalist/demo hardening** — re-run foundation workflow end-to-end without manual unblocks, clean workspace/runtime mismatches, and verify DAG/progress rendering fully

## Next Sprint: March 31 – April 11

### Workflow v2 Continued
> Design: `docs/hacks/openclaw-hack-day-mar25/WORKFLOW_V2_DESIGN.md`

- [ ] **Agent-to-agent messaging** — direct 1-1 between agents for dependency resolution
- [x] **Workflow DAG + dependencies** — `dependsOn` field, parallel lanes, sequential gates, DAG execution engine
- [ ] **Monitor + completion workflows** — recurring status aggregation, auto-complete
- [x] **Workflow DAG visualization** — interactive DAG view with dependency lines, zoom, edit mode, undo
- [x] **TEMPLATE.md lean format** — 248→19 line frontmatter, structured markdown body
- [x] **WORKFLOW.md format** — parse + serialize + round-trip, import/export APIs
- [x] **Specs** — TEMPLATE_MD_SPEC.md + WORKFLOW_MD_SPEC.md formal specifications
- [x] **Notification actions** — 5 blocker types with dynamic UI, search, restart/pause
- [x] **Template cross-validation** — agent/group/community/workflow reference checking
- [x] **Export buttons** — download TEMPLATE.md / WORKFLOW.md from detail views
- [x] **Smart workflow customization** — paginated wizard with dropdowns, checkboxes, textareas

### Self-Management
- [ ] **ClawMax Dev Team template** — qa-engineer, release-engineer, github-triage with kickoff workflow
- [ ] **ClawMax self-management MVP** — deploy Dev Team on ClawMax repo, test autonomous PR review + triage
- [ ] **Mac Mini deployment** — 24/7 agent team managing ClawMax repo

### Production Readiness
- [ ] **OAuth clean-room auth test** — end-to-end on fresh machine
- [ ] **Container fixes** — ENOENT agent dir (#41), schemas/templates inclusion
- [ ] **Security follow-through** — auth-required API coverage, cookie/session behavior

## Sprint: March 23–31 — Priority Order (current)

### P0: Notification Center (GAME CHANGER)
> Central workspace awareness — the missing glue between "I have agents" and "I know what's happening."
> **Status:** Core implemented. Channel activity bug fixed Mar 26. Needs testing + polish.

- [x] **Notification center UI** — bell icon in top nav with count badge (red/amber/blue by severity), dropdown with grouped notifications
- [x] **Workspace monitor** — 60s scan: agent health, workflow health, budget, per-agent costs, channel activity
- [x] **Notification types** — agent-error, agent-offline, agent-needs-feedback, workflow-failed, workflow-stuck, cost-warning, cost-exceeded, channel-activity
- [x] **Grouped display** — notifications grouped by category (Agents, Workflows, Communication, Budget) with timestamps and action links
- [x] **Auto-clear** — notifications auto-resolve when underlying issue is fixed
- [x] **Badge refresh** — polls every 30s
- [x] **Dedup** — fingerprint-based deduplication prevents duplicate active notifications
- [x] **Auto-prune** — dismissed/resolved notifications cleaned after 7 days
- [ ] **Bulk actions from notifications** — dismiss works, but pause/restart/open chat not yet inline
- [ ] **Testing & validation** — verify all notification types fire correctly with real agent activity

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

### Next Up: Priority Items

**High priority (demo/production blockers):**
- [ ] **Template AI Generate UI** — wire POST /api/templates/generate to "AI Generate" button on Templates page
- [ ] **Template wizard** — create templates from existing agents, workflows, communities, groups via multi-step wizard

### P7: Workflow v2 — Autonomous Multiagent Coordination
> Full design: `docs/hacks/openclaw-hack-day-mar25/WORKFLOW_V2_DESIGN.md`

- [ ] **Agent blocker surfacing + dynamic UI** — agents declare blockers, notifications render actionable UI (choice/approval/input), human or agents resolve inline (P0)
- [ ] **Kickoff workflow in templates** — `once` type workflow with pre-built prompt, runs on template apply, eliminates manual "paste prompt to start" step (P0)
- [ ] **Agent-to-agent direct messaging** — 1-1 messages between agents for dependency resolution, not just group broadcast (P1)
- [ ] **Workflow progress tracking** — agents report progress %, aggregated per workflow, visible in Workflows page (P1)
- [ ] **Workflow DAG + dependencies** — `depends_on` field, parallel execution, sequential gates, conditional triggers (P2)
- [ ] **Monitor + completion workflows** — recurring status aggregation, auto-complete when all deps met (P2)
- [ ] **Workflow DAG visualization** — Mermaid-style graph in Workflows page with status coloring (P3)

### P8: Community Rules
- [ ] **Community rules and constraints** — define reusable rules/constraints at community level, inherited by all groups

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
- [ ] **Top bar online count ignores paused agents** — shows "6 online" when all paused. Exclude paused from count.
- [ ] **Agent/workflow logs filtering** — by agent or tag
- [ ] **Workspace stats dashboard** — aggregate view with pause/disable

### Unified Wizard Design (Agents, Templates, Workflows)
> All three creation flows should follow the same UX pattern so users familiar with one are familiar with all.

**Design principles:**
1. Multi-step wizard with clear progress (step 1/4, 2/4, etc.)
2. Each step has human-editable fields pre-populated with sensible defaults
3. AI can optionally generate/fill fields at any step (bypass manual input)
4. Final confirmation step shows full preview before creation
5. Consistent layout: left = form, right = preview/suggestions

**Implementation order:**
- [ ] **Template wizard** — create from existing agents, workflows, communities, groups (most complex, do first)
- [ ] **Template AI Generate** — wire POST /api/templates/generate, AI fills wizard steps, human confirms
- [ ] **Unify Agent wizard** — align AddAgentWizard with same step/preview/confirm pattern
- [ ] **Unify Workflow wizard** — align workflow editor with same pattern
- [ ] **AI consistency pass** — all three wizards: same AI button placement, same pre-fill behavior, same confirmation flow

### Skills Management
- [ ] **Edit skill tags post-import** — add/remove tags on any skill from the Skills page
- [ ] **Skills select/select-all + bulk ops** — select mode with bulk add tags, bulk delete skills
- [ ] **Skill tag filtering** — filter skills by tag (like agent tag filtering)
- [ ] **Skills publish to SkillsHub** — package and publish workspace skills to GitHub/registry

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

## Completed (v1.1.5–v1.1.15)

See CHANGELOG.md for full history.

**v1.1.14–v1.1.15 (Mar 23-25):**
- Dynamic model discovery from OpenAI/Anthropic APIs (1hr cache)
- 6 weave-cli skills + RAG Team org template (OpenClaw Hack Day)
- Template skills wiring (setAgentSkills on apply, getAgentSkills on export)
- Markdown rendering in all chat messages (user + agent)
- Skill tags, emoji, metadata.openclaw parsing for workspace skills
- Skills per agent in template detail + apply modal
- Workflow manual schedule, targeting normalization, cross-workspace message scoping
- Empty state improvements (Agents, Skills pages), communication card sizing
- Workflow v2 design document
- Agent list pagination, per-agent cost limits, forward to group
- Group chat empty response fix, bulk model change
- System agents: workflow creator, org creator
- Agent/Workflow AI Generate buttons, BYOK dialog sizing

**v1.1.5–v1.1.8 (earlier):**
Opik metering, cost badges, bulk pause/resume, dark mode audit, BYOK wizard with Opik, metering loading state, workflow next-run, select-all styling, paused agent indicators, bulk operations panel UX.

## Notes

- **Workflow v2 is the #1 priority** — hackathon proved multiagent teams block without blocker surfacing, agent-to-agent messaging, and kickoff workflows. See WORKFLOW_V2_DESIGN.md.
- Notification center is the scaling enabler — build it now with small roster, validate it scales.
- System creator agents (workflow, org, template) unlock non-technical users.
- Community rules + workflow sequencing are the coordination layer for enterprise use cases.
- Skills ecosystem (weave-cli-skills) is the first SkillsHub contribution — model for future skills.
- Full week March 23–31 to land P0–P5, stretch for P6–P7.

### Gateway Process Management (CLI team — MUST)
- [ ] **Process supervisor for gateway** — use pm2, systemd, or LaunchAgent with KeepAlive to ensure gateway auto-restarts on crash
- [ ] **`stop.sh` should not kill gateway** — dashboard stop should only stop dashboard processes, not the shared gateway
- [ ] **`start.sh` should verify gateway** — check gateway is running on startup, restart if needed
- [ ] **Health check endpoint** — gateway should expose `/health` that the dashboard can poll
- [ ] **Notification on gateway down** — dashboard should detect gateway offline and surface it as a critical notification
- [ ] **Root cause**: `SYSTEM/stop.sh` kills all processes on common ports including the shared gateway (18789), leaving agents unable to communicate. Agent status shows offline even though the agent config is fine.
