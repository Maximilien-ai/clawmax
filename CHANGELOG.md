# Changelog

All notable changes to ClawMax are documented here.

## [v1.2.0] - 2026-03-18

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
- **Small Startup Team v1.2.0** — 5 agents (CEO, PM, Engineers, QA, Release), 7 dev lifecycle workflows (standup, status, triage, PR review, coding, merge, release), parameterized counts for engineers/QA/PM
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
