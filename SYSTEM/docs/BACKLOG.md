# Backlog

> Last updated: March 18, 2026 (v1.2.0 release)

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

## High Priority (Bugs)

- [ ] Template apply: agent GROUPS.md and COMMUNITIES.md not always created — intermittent, manual fix needed after apply. Verify after applying small startup template.
- [ ] Schema path errors in logs — `tools.schema.json` and `soul.schema.json` resolved via workspace path
- [ ] Add workflow schema validation — no `workflows.schema.json` exists yet
- [ ] Agent config editor: validate all sections against schema before saving
- [ ] Anthropic per-agent auth store issue — gateway needs auth-profiles.json per agent

## High Priority (Mobile / GTC Demos)

- [ ] Agent proactive updates — 1:1 chat polling added (3s), group chat works natively. For demos, use group chat (Status group) where agents post automatically via cron workflows.
- [ ] "Forward to group" feature — share 1:1 agent chat to a group chat
- [ ] Mobile: remaining page-specific responsive audit (Agents detail view)

## Medium Priority (CI/CD)

- [ ] CI needs proper `.env` handling for API keys or mock mode
- [ ] Clean-room test — fresh install validation
- [ ] Branch protection for main

## Medium Priority (UX)

- [ ] Templates page: list view with select/bulk-delete (like Workflows page) — system templates read-only (show "system" badge), workspace templates deletable
- [ ] Dark mode audit — some components may have missing variants
- [ ] Agent creation flow — agents from templates need `openclaw agents add` registration
- [ ] Consolidate cron scheduling with OpenClaw's native cron system (currently using node-cron as interim)

## Low Priority (Docs)

- [ ] Full docs refresh after clean-room test

## Planning Notes

Reserve ~1 hour per 10-hour sprint for bug fixes and refinements discovered during testing.

### Engineer Agent PR Assessment (March 18)
Engineer agent created 7 PRs but only 2 had actual code changes (#19, #20 — merged). PRs #21-25 had empty commits. All closed with feedback.
