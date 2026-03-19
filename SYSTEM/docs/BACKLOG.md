# Backlog

> Last updated: March 19, 2026 (v1.1.5 release)
> Completed items archived daily — see CHANGELOG.md for full history

## High Priority (Bugs)

- [ ] **Group chat: 2nd agent empty response** — @mentioning a role group only gets response from first agent. Workaround: use @all or Tab-expand to select individual agents.
- [ ] Group chat jitter on mobile — improved (3s poll) but not eliminated
- [ ] Template apply: agent GROUPS.md and COMMUNITIES.md not always created — intermittent

## High Priority (GTC Demo Feedback)

- [ ] **Agent token limits + warnings** — per-agent token/cost limits, yellow at 80%, red when exceeded, auto-pause
- [ ] **Template skills audit** — role-appropriate skills per agent
- [ ] **Workflow table view** — sortable columns (name, schedule, cost, runs, status) like agent table view

## High Priority (Features) — Next Sprint

- [ ] **System agent: workflow creator** — create workflows from natural language
- [ ] **System agent: org creator** — create full orgs from natural language with domain knowledge
- [ ] **More domain templates** — personal assistants, students, back office, legal, retail
- [ ] **Agent/workflow logs filtering** — view logs from specific agent or by tag
- [ ] **Workspace stats dashboard** — agent count, tokens consumed, costs. Pause/disable workspace.

## Medium Priority (UX)

- [ ] Templates page: list view with select/bulk-delete — system templates read-only with badge
- [ ] Template tag filtering (like agents, workflows)
- [ ] Dark mode audit
- [ ] Consolidate cron scheduling with OpenClaw's native cron
- [ ] "Forward to group" — share 1:1 agent chat to a group
- [ ] Workflow chaining — one workflow triggers others

## Medium Priority (CI/CD)

- [ ] CI needs proper `.env` handling for API keys or mock mode
- [ ] Clean-room test — fresh install validation
- [ ] Branch protection for main

## Future (v1.2.0 / Cloud)

- [ ] Cloud deployment — hosted ClawMax with multi-tenant workspaces
- [ ] Cloud management dashboard — consolidate instances (ClawMax.ai)
- [ ] Cloud APIs — remote workspace management, health checks, billing
- [ ] Template marketplace — community marketplace on ClawMax.ai

## Future (v1.3.0 / On-Premise)

- [ ] Install agent on on-premise device
- [ ] Remote setup, management, updates, health checks
- [ ] On-premise management dashboard
- [ ] Docker/Kubernetes packaging

---

## Completed (v1.1.5 — March 19, 2026)

- Opik token metering — traces to Opik, metering dashboard on Activity page
- Agent cost badges on grid + detail cards with tooltip
- Sortable Cost column in agent table view (replaces WhatsApp)
- Workflow cost display on cards and list view
- Workflow execution tracing to Opik
- Unread message indicators (red dot) on Communication cards + nav badge
- @mention grouping with Tab-to-expand for individual targeting
- Group chat markdown rendering + brace-depth JSON cleanup
- Agent PRs: merged #34 (schema paths), #36 (workflow schema), #37 (template groups)
- Grid card layout: name line + ID/cost/chat/file line
- Communication card: trash bottom-right, chat top-right
- Workflow card: file icon bottom-right
- Template agent display names consistent
- Blog post archived, stale planning docs archived

## Completed (v1.1.3-v1.1.4 — March 18, 2026)

See CHANGELOG.md for full details.

## Planning Notes

Reserve ~1 hour per 10-hour sprint for bug fixes discovered during testing.
