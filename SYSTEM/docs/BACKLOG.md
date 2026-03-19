# Backlog

> Last updated: March 19, 2026
> Completed items archived daily — see CHANGELOG.md for full history

## High Priority (Bugs)

- [ ] **Group chat: 2nd agent empty response** — @mentioning a role group only gets response from first agent. Second returns empty payloads from OpenClaw CLI even with --local and 3s delay. Works with @all. Root cause: OpenClaw CLI session/state interference between sequential calls. Workaround: use @all or Tab-expand to select individual agents.
- [ ] Group chat jitter on mobile — improved (3s poll) but not eliminated
- [ ] Group chat close button (X) too small on mobile — hard to tap
- [ ] Group chat slider panel tight on mobile — needs better touch targets
- [ ] Template apply: agent GROUPS.md and COMMUNITIES.md not always created — intermittent
- [ ] Schema path errors in logs
- [ ] Anthropic per-agent auth store issue — gateway needs auth-profiles.json per agent

## High Priority (GTC Demo Feedback) — Must for Next Demo

- [ ] **@mention grouping** — show "@Engineer (2)" not separate @engineer1, @engineer2. Both respond individually. Scales to 10+ agents.
- [ ] **Token metering via Opik** — track token count, LLM calls, estimated costs per agent and per workflow. Aggregate for workspace. Add limits. Integrate like weave-cli. MUST for next demo.
- [ ] **Unread message indicator** — red dot with count on agent/group cards (like WhatsApp/iMessage). Clear when viewed.
- [ ] **Template skills audit** — role-appropriate skills per agent (engineers: github, coding-agent; QA: github; PM: gh-issues; CEO: web_search, memory)

## High Priority (Features) — Next Sprint

- [ ] **System agent: workflow creator** — create workflows from natural language
- [ ] **System agent: org creator** — create full orgs from natural language with domain knowledge
- [ ] **More domain templates** — personal assistants, students (HS + college), back office, legal, retail. Start with customizable workflows.
- [ ] **Agent/workflow logs filtering** — view logs from specific agent or by tag
- [ ] **Workspace stats dashboard** — agent count, tokens consumed, costs, LLM calls. Pause/disable workspace.

## Medium Priority (UX)

- [ ] Templates page: list view with select/bulk-delete — system templates read-only with badge
- [ ] Template tag filtering (like agents, workflows)
- [ ] Dark mode audit
- [ ] Agent creation flow — agents from templates need `openclaw agents add` registration
- [ ] Consolidate cron scheduling with OpenClaw's native cron
- [ ] "Forward to group" — share 1:1 agent chat to a group
- [ ] Mobile: Agents detail view responsive audit
- [ ] Workflow chaining — one workflow triggers others

## Medium Priority (CI/CD)

- [ ] CI needs proper `.env` handling for API keys or mock mode
- [ ] Clean-room test — fresh install validation
- [ ] Branch protection for main

## Future (v1.2.0 / Cloud)

- [ ] **Cloud deployment** — hosted ClawMax with multi-tenant workspaces
- [ ] **Cloud management dashboard** — consolidate all cloud instances under same management pane (ClawMax.ai)
- [ ] **Cloud APIs** — special APIs for remote workspace management, health checks, billing
- [ ] **Template marketplace** — publish workspace templates to shared GitHub repo, community marketplace on ClawMax.ai
- [ ] Add workflow schema validation (workflows.schema.json)
- [ ] Agent config editor: validate all sections against schema before saving

## Future (v1.3.0 / On-Premise)

- [ ] Install agent on on-premise device
- [ ] Remote setup of ClawMax (including OpenClaw)
- [ ] Remote management, updates, and health checks
- [ ] On-premise management dashboard — consolidate all on-premise instances
- [ ] Docker/Kubernetes packaging
- [ ] On-premise APIs for remote management

## Low Priority (Docs)

- [ ] Full docs refresh after clean-room test

---

## Completed (v1.1.3 — March 18, 2026)

See CHANGELOG.md for full details. Key items:
- Mobile responsive (all pages, chat panels, modals)
- Built-in cron scheduler with run limits
- AI cron generator (natural language to cron)
- Parameterized templates with agent count controls
- Small startup template with 7 dev lifecycle workflows
- Markdown rendering in 1:1 chat with code toggle
- Group chat markdown rendering and JSON cleanup
- Chat history persistence and loading spinner
- Workflow UI: run counts, human-readable schedule, resolved agents
- Template detail popup shows workflows
- Agent config schema validation
- CI fix, auth profiles, chat API key validation
- 35+ commits, v1.1.3 released

## Planning Notes

Reserve ~1 hour per 10-hour sprint for bug fixes discovered during testing.

### GTC Demo Feedback (March 18 evening)
5 demos: 2 VCs, 2 VPs, 1 colleague. Key takeaways: @mention grouping, token metering (Opik), domain templates, system agents for NL org/workflow creation, unread indicators, template marketplace.

### Agent PR Review
Review agent PRs each morning — merge good ones, close empty/bad ones with feedback.
