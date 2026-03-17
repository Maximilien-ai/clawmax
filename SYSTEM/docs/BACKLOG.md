# Backlog

> Last updated: March 17, 2026 (evening session)

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

## High Priority (Bugs)

- [ ] `start.sh` API key warning is false positive — checks shell env but keys are in `.env` file, always warns
- [ ] Group chat "responding" indicator stays on forever — needs auto-clear timeout (30s) or message polling
- [ ] Schema path errors in logs — `tools.schema.json` and `soul.schema.json` still resolved via workspace path in some code paths
- [ ] Anthropic per-agent auth store issue — agents need `ANTHROPIC_API_KEY` in env, not just `.env`; gateway fallback to embedded mode works but logs errors

## Medium Priority (CI/CD)

- [ ] Verify GitHub Actions CI passes on a real PR (OpenClaw CLI install step untested)
- [ ] CI needs proper `.env` handling for API keys or mock mode
- [ ] Clean-room test — fresh install without OpenClaw or ClawMax to validate setup flow

## Medium Priority (UX)

- [ ] Dark mode audit — likely more components with missing dark variants
- [ ] Agent creation flow — agents created via templates aren't fully registered with `openclaw agents add`
- [ ] Workflow cron scheduler — scheduled workflows don't actually run on schedule (no daemon)
- [ ] Agent chat streaming — currently waits for full response, could stream deltas

## Low Priority (Docs)

- [ ] Review and archive completed/superseded docs in SYSTEM/docs/
- [ ] Update SETUP.md for gateway pairing flow and ngrok setup
- [ ] Full docs refresh after clean-room test

## Planning Notes

Reserve ~1 hour per 10-hour sprint for bug fixes and refinements discovered during testing. New features often surface edge cases that need immediate attention before moving on. Today's session demonstrated this — agent edit, model override, ngrok config, and gateway port detection were all unplanned but necessary improvements found during testing.
