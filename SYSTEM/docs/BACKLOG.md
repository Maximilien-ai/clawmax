# Backlog

> Last updated: March 18, 2026 (post-GTC demos evening)

## Completed Since v1.1.0

- [x] `.env` in `.gitignore` — fixed token paths, added WORKSPACES/
- [x] Agent config editor — edit IDENTITY.md, SOUL.md, TOOLS.md from UI
- [x] Model override on template apply — collapsible section with provider-grouped dropdown
- [x] Ngrok URL configurable via `.env` — removed hardcoded domain
- [x] Ngrok auth failure detection — guides user to set authtoken
- [x] Gateway port auto-detection — probes both 18789 and 18889
- [x] Test template switched to openai/gpt-4o-mini
- [x] Dark mode: workflow tags on Organizations page
- [x] Workflow confirmation dialogs removed
- [x] package-lock.json committed for reproducible installs
- [x] `start.sh` API key warning false positive (PR #19)
- [x] SETUP.md for gateway pairing and ngrok setup (PR #20)
- [x] CI fix — OpenClaw CLI build step resilient to upstream changes
- [x] Mobile responsive: all chat panels, modals, pages (15+ components)
- [x] Group chat auto-scroll fix — no longer kicks user out of input
- [x] Group chat flicker eliminated during polling
- [x] Group chat "responding" indicator auto-clears after 30s
- [x] Agent config schema validation (tags, name, whatsapp format)
- [x] Mobile padding + toolbar overflow on all pages
- [x] Templates: expanded small-startup (6 agents) and engineering-team (4 agents)
- [x] Parameterized templates — agent count controls in Apply wizard
- [x] 1:1 chat polling — agent-initiated messages now visible
- [x] Chat API key validation — clear error instead of timeout
- [x] Chat timeout increased to 3 minutes for cold starts
- [x] AI cron generator — natural language to cron expression
- [x] Template apply progress toasts
- [x] Workflow detail pane shows resolved target agents
- [x] Workflow run limits — maxRuns with auto-disable
- [x] Built-in cron scheduler (node-cron) — workflows run on schedule
- [x] Workflow UI shows run count and human-readable schedule
- [x] Auth profiles created for template-imported agents
- [x] Engineer agent PRs reviewed — 2 merged, 5 closed
- [x] Template detail popup shows workflows
- [x] Small startup template: 7 dev lifecycle workflows + parameterized QA/PM counts
- [x] Markdown rendering in 1:1 chat with code toggle
- [x] Chat history persistence (stable session ID)
- [x] Loading spinner for chat history
- [x] JSON/ANSI content cleanup in chat (line-by-line filter)
- [x] Workflow agent timeout increased to 5 minutes

## High Priority (Bugs) — Fix First Tomorrow

- [ ] Group chat still jitters on mobile — polling-related re-renders still occurring
- [ ] Group chat JSON leaking — line-by-line filter not applied to group chat messages (only 1:1)
- [ ] Group chat close button (X) too small on mobile — hard to tap
- [ ] Group chat slider panel tight on mobile — needs better touch targets
- [ ] Template apply: agent GROUPS.md and COMMUNITIES.md not always created — intermittent
- [ ] Schema path errors in logs
- [ ] Anthropic per-agent auth store issue — gateway needs auth-profiles.json per agent

## High Priority (GTC Demo Feedback) — Must for Next Demo

- [ ] **@mention grouping** — when mentioning e.g., @Engineer, show one "@Engineer (2)" option instead of separate @engineer1, @engineer2. Both still respond individually. If user wants specific agent, mention by ID in message body. Scales to 10+ agents.
- [ ] **Token metering via Opik** — track token count, LLM calls, estimated costs per agent and per workflow. Aggregate for workspace. Add limits to agents/workflows. Integrate with Opik like weave-cli. MUST for next demo.
- [ ] **Unread message indicator** — red dot with count on agent/group cards when new messages arrive (like WhatsApp/iMessage). Clear when viewed.
- [ ] **Group chat markdown rendering** — reuse cleanMessageContent and ReactMarkdown from AgentChatPanel
- [ ] **Template skills audit** — role-appropriate skills per agent (engineers: github, coding-agent; QA: github; PM: gh-issues; CEO: web_search, memory)

## High Priority (Features) — Next Sprint

- [ ] **System agent: workflow creator** — create workflows from natural language description
- [ ] **System agent: org creator** — create full organizations (agents, groups, communities, workflows) from natural language. Allows users to input domain knowledge.
- [ ] **More domain templates** — personal assistants, students (high school + college), back office, legal assistants, retail stores. Start with workflows users can customize.
- [ ] **Agent/workflow logs filtering** — view logs from specific agent or groups of agents (by tag)
- [ ] **Workspace stats dashboard** — agent count, tokens consumed, costs, LLM calls. Enable pause/disable entire workspace.

## Medium Priority (UX)

- [ ] Templates page: list view with select/bulk-delete (like Workflows) — system templates read-only with badge
- [ ] Template tag filtering (like agents, workflows)
- [ ] Dark mode audit — some components may have missing variants
- [ ] Agent creation flow — agents from templates need `openclaw agents add` registration
- [ ] Consolidate cron scheduling with OpenClaw's native cron system
- [ ] "Forward to group" feature — share 1:1 agent chat to a group chat
- [ ] Mobile: remaining page-specific responsive audit (Agents detail view)
- [ ] Workflow chaining — one workflow triggers others

## Medium Priority (CI/CD)

- [ ] CI needs proper `.env` handling for API keys or mock mode
- [ ] Clean-room test — fresh install validation
- [ ] Branch protection for main

## Future (v1.2.0+ / Cloud)

- [ ] **Template marketplace** — publish workspace templates to shared GitHub repo, import from community. Leads to marketplace on ClawMax.ai.
- [ ] **Cloud deployment** — hosted ClawMax with multi-tenant workspaces
- [ ] **On-premise deployment** — Docker/Kubernetes packaging
- [ ] Add workflow schema validation — no `workflows.schema.json` exists yet
- [ ] Agent config editor: validate all sections against schema before saving

## Low Priority (Docs)

- [ ] Full docs refresh after clean-room test

## Planning Notes

Reserve ~1 hour per 10-hour sprint for bug fixes and refinements discovered during testing.

### GTC Demo Feedback (March 18 evening)
5 demos: 2 VCs, 2 VPs, 1 colleague. Key takeaways:
- Group chat works but needs polish (jitter, JSON, touch targets)
- @mention grouping critical for scaled teams
- Token metering/costs is a MUST for next demo (Opik integration)
- Domain-specific templates will drive adoption
- System agents for org/workflow creation from NL would be a killer feature
- Template marketplace is the long-term play
- Unread indicators needed for real-time feel

### Engineer Agent PR Assessment (March 18)
Engineer agent created 7 PRs but only 2 had actual code changes (#19, #20 — merged). PRs #21-25 had empty commits. All closed with feedback. ClawMax dev workspace agents were working end-of-day — review PRs first thing tomorrow.

### Tomorrow Morning (March 19) Plan
1. Review and merge/close PRs from ClawMax dev agents
2. Fix group chat bugs (jitter, JSON, touch targets)
3. @mention grouping
4. Start Opik token metering integration
5. Group chat markdown rendering
