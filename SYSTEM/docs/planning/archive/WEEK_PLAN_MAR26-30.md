# Week Plan: March 26-30, 2026

> Sprint: March 23-31
> Focus: Notification Center (P0), Template AI Generate, polish
> Context: Hackathon work merged to main (v1.1.15 ready to tag)

## Wednesday Mar 26 — Dashboard Ready + Release

### Morning
- [ ] Tag release v1.1.15 (hackathon: skills, RAG Team template, 10+ fixes)
- [ ] Template AI Generate UI — wire POST /api/templates/generate to "AI Generate" button
- [ ] Template wizard — create templates from existing agents, workflows, communities, groups

### Afternoon
- [ ] Start Notification Center UI — badge in top nav, click opens dropdown
- [ ] Notification data model — types, severity, timestamps, action links

## Thursday Mar 27 — Notification Center Core

### Morning
- [ ] Workspace monitor agent — scan for: agents waiting on feedback, agents failing, workflows stuck, cost approaching limits
- [ ] Notification types: agent-needs-feedback, agent-error, workflow-failed, workflow-stuck, cost-warning
- [ ] Grouped display — notifications grouped by category with timestamps

### Afternoon
- [ ] Bulk actions from notifications — dismiss, pause agent, restart workflow, open chat
- [ ] Auto-clear — notifications resolve when underlying issue is fixed
- [ ] Badge refresh — poll for live count updates
- [ ] Test with RAG Team workspace

## Friday Mar 28 — Skills + Polish

### Morning
- [ ] Skills management — edit tags post-import, tag filtering
- [ ] Skills select/select-all + bulk ops (add tags, delete)
- [ ] Agent/workflow logs filtering — by agent or tag

### Afternoon
- [ ] UI/UX refinement pass — polish with real agents running
- [ ] Continue RAG Team testing — verify agents use weave-cli skills
- [ ] Fix any issues found during testing

## Weekend Mar 29-30 — Quality + Stretch

### Saturday (if working)
- [ ] Dashboard smoke suite — one-command local smoke run for key flows
- [ ] Clean-room CI hardening — keep test.sh deterministic
- [ ] System agent: template creator — create templates from existing agents via NL

### Sunday (stretch)
- [ ] Workspace stats dashboard — aggregate view with pause/disable
- [ ] Cost dashboard refinement — per-workflow cost breakdown
- [ ] Prep for next sprint (Workflow v2)

## Completed This Sprint (archive-ready)

- [x] Dynamic model discovery from provider APIs (v1.1.14.1)
- [x] 6 weave-cli skills created + published to SkillsHub
- [x] RAG Team org template (5 roles, 6 groups, 6 workflows)
- [x] Template skills wiring (setAgentSkills on apply)
- [x] Markdown rendering in chat (user + agent messages)
- [x] Skills per agent in template detail + apply modal
- [x] Skill tags display + search by tags
- [x] Workspace skill metadata.openclaw parsing
- [x] Empty state improvements (Agents page, Skills page)
- [x] Cross-workspace message scoping
- [x] Workflow manual schedule support
- [x] Workflow targeting normalization
- [x] Template workflow import fixes (targeting.agents, agent names)
- [x] Communication card sizing
- [x] Unread badge scoped to workspace
- [x] BYOK dialog sizing
- [x] Workflow v2 design document
- [x] Agent list pagination
- [x] Per-agent cost limits
- [x] Forward to group
- [x] Group chat empty response fix
- [x] System agents: workflow creator, org creator
- [x] Bulk model change
- [x] Agent/Workflow AI Generate buttons

## Notes

- Notification center is THE priority — it's the bridge between "agents exist" and "I know what's happening"
- Workflow v2 (kickoff, blocker surfacing, agent-to-agent) moves to next sprint Mar 31
- Cloud deployment Apr 1 deadline is separate team
- Reserve ~1hr/day for unplanned fixes (per feedback)
