# ClawMax Status & Planning

**Current Version**: v1.2.0
**Last Updated**: March 18, 2026 (end of day)
**Status**: Active Development — GTC Demo Sprint

---

## Today's Session: March 18, 2026

### Shipped (22 commits, 30 total including docs/fixes)

**Mobile Responsiveness**
- All chat panels (1:1, agent, group) full-width on mobile
- All modal dialogs (15+ components) responsive
- All page layouts with proper mobile padding
- Toolbar overflow fixed (wraps on mobile)
- DocHub file tree mobile toggle
- TopBar compact on small screens
- Group chat scroll fix (no more input disruption)
- Group chat flicker eliminated

**Chat Improvements**
- 1:1 chat polling (3s) — agent-initiated messages now visible
- API key validation before chat (clear error vs timeout)
- Chat timeout increased to 3min for cold starts
- Group chat "responding" indicator auto-clears at 30s

**Workflow System**
- Built-in cron scheduler (node-cron) — workflows run on schedule
- Run limits (maxRuns) with auto-disable
- AI cron generator — natural language to cron expression
- Workflow detail pane shows resolved target agents with names
- Run count and human-readable schedule in workflow cards
- OpenClaw cron integration explored (auth challenges documented)

**Templates**
- Small Startup Team: 6 agents (CEO, PM, 2 engineers, QA, release)
- Engineering Team: 4 agents (2 engineers, QA, release)
- Test Template: auto-running status check workflow (5 runs)
- Parameterized agent counts in Apply wizard (+/- controls)
- Apply progress toasts
- Auth profiles created for imported agents
- Template detail popup shows workflows with schedules
- Small Startup template: 7 workflows (standup, status, triage, PR review, coding, merge, release)

**Workflow Execution**
- Built-in node-cron scheduler — workflows run on schedule automatically
- Run limits (maxRuns) with auto-disable — persisted and displayed
- Run count displayed in cards and detail pane ("2 runs completed · Unlimited" or "Run 2 of 5")
- Human-readable schedule shown everywhere ("Every 5 minutes")
- Resolved target agents shown in detail pane with clickable badges
- Workflow editor sends maxRuns to API, preserves on edit

**Quality**
- Agent config schema validation (tags, name, whatsapp)
- CI fix — resilient to upstream OpenClaw changes
- PR review: merged #19, #20; closed #21-25 (empty commits)

### Known Issues

- Template apply doesn't always create agent GROUPS.md/COMMUNITIES.md (intermittent)
- Cron scheduler uses node-cron (interim) — should consolidate with OpenClaw cron
- Agent auth-profiles.json needed for gateway-based cron execution

---

## Key Demos

- **March 17 (Mon)**: GTC evening — discovered mobile issues
- **March 18 (Tue)**: GTC evening — mobile fixed, cron working
- **March 27 (Thu)**: Presentation demo
- **March 28 (Fri)**: Hackathon demo

---

## Project Health

| Metric | Status |
|--------|--------|
| Tests | 95 passing (100%) |
| CI | Fixed — resilient |
| Mobile | All pages responsive |
| Dark mode | Mostly complete (audit needed) |
| Cron | Working via node-cron |
| Templates | 3 org templates, 5 agent templates |

---

## Architecture Notes

### Cron Scheduling (Technical Debt)
ClawMax currently uses `node-cron` for workflow scheduling. OpenClaw has its own cron system (`openclaw cron`) that runs through the gateway. We chose node-cron because bridging OpenClaw cron output back to ClawMax's execution/chat system was complex (auth profile format, delivery channel requirements). Future consolidation should either:
1. Use OpenClaw cron with a callback webhook to ClawMax trigger API
2. Or register ClawMax workflows as OpenClaw cron jobs that POST to `/api/workflows/:id/trigger`

See commit `4247024` for full documentation of this decision.
