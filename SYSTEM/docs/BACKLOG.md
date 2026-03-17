# Backlog — Next Session

> Created: March 17, 2026 (after v1.1.0 release)

## High Priority (Bugs)

- [ ] `.env` not in `.gitignore` — API keys at risk of being committed
- [ ] `start.sh` API key warning is false positive — checks shell env but keys are in `.env` file, always warns
- [ ] Group chat "responding" indicator stays on forever — needs auto-clear timeout (30s) or message polling
- [ ] Schema path errors in logs — `tools.schema.json` and `soul.schema.json` still resolved via workspace path in some code paths

## Medium Priority (CI/CD)

- [ ] Verify GitHub Actions CI passes on a real PR (OpenClaw CLI install step untested)
- [ ] CI needs proper `.env` handling for API keys or mock mode
- [ ] Clean-room test — fresh install without OpenClaw or ClawMax to validate setup flow

## Medium Priority (UX)

- [ ] Dark mode audit — likely more components with missing dark variants
- [ ] Agent creation flow — agents created via templates aren't fully registered with `openclaw agents add`
- [ ] Workflow cron scheduler — scheduled workflows don't actually run on schedule (no daemon)

## Low Priority (Docs)

- [ ] Review and archive completed/superseded docs in SYSTEM/docs/
- [ ] Update SETUP.md for gateway pairing flow
- [ ] Full docs refresh after clean-room test
