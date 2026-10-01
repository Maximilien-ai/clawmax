# RC89 local acceptance — October 1, 2026

Branch: `feat-2.0-maintenance-parity` / PR206. This is an acceptance checklist,
not a declaration that RC89 is qualified or its images exist.

## Engineering gate

Repair the isolated pinned OpenClaw 2026.9.5 dependency cache, verify a real CLI
command beyond `--version`, then run:

```sh
DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

Record the tested SHA, result, coverage and CI. The wrapper's test workspace is
disposable; start normal dev separately afterward. Do not leave a synthetic test
workspace running as the owner's dev environment or advertise it as real data.

## Short owner acceptance

Use a disposable workspace for mutations; do not paste keys into evidence.

1. **Chat and Doctor:** send a short message to AstroGuide; expect a nonempty
   response or a bounded actionable failure, not an indefinite spinner. Verify
   model selection and inspect Doctor's specific proposed repairs and outcome.
2. **BYOK:** save a valid configured provider key; verify a bounded result and
   subsequent chat. In a disposable configuration, reject an invalid key with a
   useful error; service unavailability must not be reported as valid. Restore
   the valid configuration. Do not rotate or invalidate production credentials.
3. **Search:** Ctrl/Cmd+K, partial-name search, and correct navigation for a known
   workspace, agent, workflow, group, community, skill, template and plugin object.
   Switch workspaces while searching; no stale cross-workspace results. Check
   a narrow/mobile window for usable trigger, focus and no header overflow.
4. **Skills and switching:** opening Skills from an agent should default to
   Available; assign a disposable skill and confirm Assigned remains accessible.
   Switch workspaces repeatedly; preserve selection and show readable failures,
   never an HTML/JSON parsing error.
5. **Partners:** inspect Cognee and AgentForge configuration without errors.
   Configuration alone must not enable activity export or count as user consent.

These checks are intended to reveal gaps, not assert every behavior is complete.

## Personal clearing — separate disposable instance only

Do not clear the owner's real Personal workspace for acceptance. Seed disposable
agents, workflows, groups and documents, with another workspace as a preservation
control. Cancel each confirmation once, then confirm with `CLEAR PERSONAL`.
Personal must remain selectable and empty; the other workspace and shared
credentials must remain unchanged. Restart, create a new Personal agent and chat.
The runtime keeper may remain outside Personal. Shared-auth ownership, linked
storage and legacy ambiguous rosters deliberately refuse cleanup.

See [the detailed clearing contract](PERSONAL_WORKSPACE_CLEAR_ACCEPTANCE.md).

## Remaining release gates

- Packaged stopped-runtime migration, complete persisted inventory and truthful
  authenticated readiness; interruption/active-owner and preservation evidence.
- Remaining local UX and joint CLI operations acceptance, not just test totals.
- Reviewed/merged source and green CI, then exact public and matching combined
  images on both architectures with smoke tests and identity verification.
- CLI cloud/on-prem upgrade, restart, persistence and chat acceptance on explicitly
  authorized targets, with backups and rollback; Mike and Mac mini remain distinct.

No broad rollout or default-image promotion is authorized by local acceptance.
