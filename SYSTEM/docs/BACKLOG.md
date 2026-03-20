# Backlog

> Last updated: March 20, 2026
> Deadline: Cloud deployment by April 1st, dashboard ready by March 26
> Completed items archived — see CHANGELOG.md for full history

## CRITICAL — Dashboard Ready by March 26 (Wed)

### Security (Sprint Priority #1)
- [x] **Security audit** — full audit of dashboard, API endpoints, agent execution, file access, env vars. 27 issues found, critical/high fixed in v1.1.6.
- [x] **API rate limiting** — express-rate-limit: 200 req/min global, 10 req/min auth
- [x] **Input sanitization** — port validation, agent ID validation, GitHub URL validation, path traversal fix
- [x] **Audit logging** — all API requests logged with timestamp, method, path, status, token hash, duration
- [x] **Env var whitelisting** — child processes receive only whitelisted env vars
- [ ] **GitHub authentication** — OAuth login via GitHub. Protect all API routes. Session management.
- [ ] **Google/Apple auth** — add after GitHub (lower priority for v1)

### Cost Management (Sprint Priority #2)
- [x] **Workspace cost budget** — per-workspace USD budget with progress bar, yellow at 80%, red when exceeded, auto-pause agents + block workflows
- [x] **Budget enforcement** — toggle enforce on/off, editable limit from Activity page
- [ ] **Per-agent cost limits** — individual agent limits (future, currently workspace-level)
- [ ] **Pause/disable agent** — toggle enabled/disabled (orange badge). Bulk pause via selection. Disabled agents excluded from workflows.
- [ ] **Cost notifications** — toast/alert when approaching limits, email notification option
- [ ] **Cost dashboard refinement** — per-workflow cost breakdown, daily/weekly trends

### Backup & Restore (Sprint Priority #3)
- [ ] **Workspace backup** — zip workspace + config, downloadable from UI. Trigger manually or schedule.
- [ ] **Workspace restore** — upload zip to restore workspace state
- [ ] **Auto-backup** — optional scheduled backups (daily/weekly)

### Agent Coordination (Sprint Priority #4)
- [ ] **Blocking/waiting notifications** — system skills for agents to report "waiting on X" or "blocked by Y". Central notification hub visible to all agents and user.
- [ ] **System skills** — built-in skills all agents get: notify-blocked, request-decision, escalate-to-human, update-status

### Templates Library (Sprint Priority #5)
- [ ] **Template categories** — Personal, Enterprise, Teams with 5-10 templates each
- [ ] **Pre-built templates**: Job Search, Sales Lead, Deep Research, Customer Support, Content Creation, Legal Review, Student Study Group, Back Office, Retail Operations, Marketing Team
- [ ] **Custom templates** — save current workspace as template (agents, groups, communities, workflows)
- [ ] **Template sharing** — export/import via email (zip or JSON)
- [ ] **Template skills audit** — role-appropriate skills per agent type

## High Priority (Bugs)

- [ ] Group chat: 2nd agent empty response (workaround: @all or Tab-expand)
- [ ] Group chat jitter on mobile (improved but not eliminated)
- [ ] Template apply: GROUPS.md/COMMUNITIES.md intermittent

## High Priority (UX)

- [ ] **Agent list pagination** — paginate agent list/table views (10 per page) to handle growing rosters
- [ ] **Activity metering loading state** — show placeholder message while Opik data loads (e.g., "Fetching metering data…") so users don't think it's broken on cold start
- [ ] **Workflow table view** — sortable columns like agent table view
- [ ] **Templates list view** — with select/select-all/bulk-delete
- [ ] **UI/UX refinement pass** — polish once workspaces are running with real agents

## High Priority (Features)

- [ ] **System agent: workflow creator** — NL to workflow
- [ ] **System agent: org creator** — NL to full org with domain knowledge
- [ ] **Agent/workflow logs filtering** — by agent or tag
- [ ] **Workspace stats dashboard** — aggregate view with pause/disable

## Medium Priority

- [ ] Template tag filtering
- [ ] Dark mode audit
- [ ] Consolidate cron with OpenClaw native
- [ ] "Forward to group" — share 1:1 chat to group
- [ ] Workflow chaining — one triggers others
- [ ] CI .env handling
- [ ] Branch protection for main

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

## Completed (v1.1.5 — March 19, 2026)

See CHANGELOG.md. Key: Opik metering, cost badges, unread indicators, @mention grouping, Select All, agent PRs merged, markdown chat, nav reorder.

## Sprint Plan: March 20-26

| Day | Focus | Key Deliverables |
|-----|-------|-----------------|
| Thu 20 | Security audit + GitHub auth start | Audit report, OAuth scaffold |
| Fri 21 | GitHub auth complete + cost limits | Login flow working, agent limits |
| Sat 22 | Pause/disable agents + backup/restore | Bulk pause, zip backup |
| Sun 23 | Templates library (5-10 templates) | Categories + pre-built |
| Mon 24 | Agent coordination + custom templates | Blocking notifications, save-as-template |
| Tue 25 | UI/UX polish + integration testing | End-to-end testing |
| Wed 26 | Dashboard freeze + cloud handoff | Ready for cloud team |
