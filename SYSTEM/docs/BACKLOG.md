# Backlog

> Last updated: March 18, 2026 (GTC demo prep session)

## Completed Since v1.1.0

- [x] `.env` in `.gitignore` — fixed token paths, added WORKSPACES/
- [x] Agent config editor — edit IDENTITY.md, SOUL.md, TOOLS.md from UI
- [x] Model override on template apply — collapsible section with provider-grouped dropdown
- [x] Ngrok URL configurable via `.env` — removed hardcoded domain
- [x] Ngrok auth failure detection — guides user to set authtoken
- [x] Gateway port auto-detection — probes both 18789 and 18889
- [x] Test template switched to openai/gpt-4o-mini (more reliable with env var keys)
- [x] Dark mode: workflow tags on Organizations page
- [x] Workflow confirmation dialogs removed
- [x] package-lock.json committed for reproducible installs
- [x] `start.sh` API key warning false positive — now checks `.env` before warning (PR #19)
- [x] SETUP.md for gateway pairing and ngrok setup (PR #20)
- [x] CI fix — OpenClaw CLI build step resilient to upstream changes (stub fallback)
- [x] Mobile responsive: chat panels (1:1, agent, group) — full-width on mobile
- [x] Mobile responsive: all modal dialogs (add agent, delete, archive, sync, link, status)
- [x] Mobile responsive: DocHub file browser — toggle sidebar on mobile
- [x] Mobile responsive: Communication docked chat pane
- [x] Mobile responsive: TopBar — hide verbose info on small screens
- [x] Group chat auto-scroll fix — no longer kicks user out of input field during polling
- [x] Engineer agent PRs reviewed — 2 merged (#19, #20), 5 closed (empty commits)
- [x] `setup.sh` creates WORKSPACES directory with subdirs — already implemented

## High Priority (Bugs)

- [ ] Group chat "responding" indicator stays on forever — needs auto-clear timeout (30s) or message polling
- [ ] Schema path errors in logs — `tools.schema.json` and `soul.schema.json` still resolved via workspace path in some code paths
- [ ] Add workflow schema validation — no `workflows.schema.json` exists yet (have schemas for agents, communities, groups, identity, mandate, soul, tools only)
- [ ] Agent config editor: validate all sections against schema before saving, show user-friendly errors (like Documents tab does)
- [ ] Anthropic per-agent auth store issue — agents need `ANTHROPIC_API_KEY` in env, not just `.env`; gateway fallback to embedded mode works but logs errors

## High Priority (Mobile / GTC Demos)

- [ ] Agent not proactively responding in 1:1 chat after first response — says "I'll update you" but never does. User has to actively ask. Repeatable in both 1:1 and group. Likely needs server-side push or long-polling for agent-initiated messages.
- [ ] Agent API key timeout errors during 1:1 chat — intermittent, likely gateway session/key expiry
- [ ] "Forward to group" feature — ability to share/forward 1:1 agent chat messages to a group chat (e.g., Engineer 1:1 -> Status group). Important for keeping team agents informed.
- [ ] Mobile: remaining page-specific layouts need responsive audit (Agents roster detail view, Workflows page)

## Medium Priority (CI/CD)

- [ ] CI needs proper `.env` handling for API keys or mock mode
- [ ] Clean-room test — fresh install without OpenClaw or ClawMax to validate setup flow
- [ ] Branch protection for main — GitHub flagging unprotected main branch

## Medium Priority (UX)

- [ ] Parameterized templates — allow users to specify agent counts in Apply wizard (e.g., "Number of Engineers: 2" with min/max). Template defines `parameters` array, wizard renders number inputs, apply logic clones agents with suffixed IDs.
- [ ] Dark mode audit — likely more components with missing dark variants
- [ ] Agent creation flow — agents created via templates aren't fully registered with `openclaw agents add`
- [ ] Workflow cron scheduler — scheduled workflows don't actually run on schedule (no daemon)
- [ ] Agent chat streaming improvement — streaming works but could be more responsive

## Low Priority (Docs)

- [ ] Review and archive completed/superseded docs in SYSTEM/docs/
- [ ] Full docs refresh after clean-room test

## Planning Notes

Reserve ~1 hour per 10-hour sprint for bug fixes and refinements discovered during testing. New features often surface edge cases that need immediate attention before moving on.

### Engineer Agent PR Assessment (March 18)
Engineer agent created 7 PRs but only 2 had actual code changes (#19, #20 — merged). PRs #21-25 had empty commits with no file changes despite claiming work (dark mode, docs, streaming, tests). All closed with feedback. Issues remain open for proper implementation.
