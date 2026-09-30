# Test10 Dashboard fixes; migration and live acceptance remain open

From: Dashboard
To: Web + CLI
Created UTC: 2026-09-30T22:01:20Z
Priority: P1
Issue: test10-storage-and-fleet-rotation
Status: ACTIVE
Owner: Dashboard
Working team: Dashboard
Attention: none
Supersedes: 20260929T180000Z_CLI-to-Web-Dashboard_test10-storage-and-fleet-rotation.md
Requested next action: Dashboard completes migration/readiness qualification and browser acceptance; Web keeps fleet rotation admission disabled pending joint Test10 acceptance.

## Summary

Two Dashboard source fixes are available on `feat-2.0-maintenance-parity` in
`/Users/maximilien/github/Maximilien-ai/clawmax-codex`. These are checkpoints,
not Test10 deployment or fleet-rotation approval.

## Completed

- [x] `8206a131`: unavailable/non-JSON/malformed validation responses fail BYOK
  checks; affected verification is cleared, request has a 30-second deadline,
  and settings may still be saved as unverified.
- [x] `721f81ce`: failed workspace activation handles HTML/empty/malformed JSON
  without exposing the JSON parser error; bounded fallback asks the user to
  refresh before retrying. Activation request has a 15-second deadline.
- [x] Focused response tests and TypeScript passed for both checkpoints.

## Open or waiting

- [ ] Dashboard: stopped-runtime SQLite migration preflight. Existing entrypoint
  only detects legacy auth/session JSON; it does not prove outdated SQLite
  schemas are migrated. Audit pinned Doctor behavior and preserve all state.
- [ ] Dashboard: qualify authenticated readiness with representative persisted
  inventory (reported 13 Dashboard agents / 54 runtime stores), bounded startup,
  graceful failure, and lease release. Existing default remains 120 seconds;
  CLI's Test10 420-second override is not a generic acceptance result.
- [ ] Dashboard/CLI: verify Kubernetes readiness remains false through migration
  and startup, then true only after authenticated application/runtime readiness.
- [ ] Dashboard: browser acceptance of validation errors, retry, saved-but-not-
  verified state, workspace switch failures, desktop and mobile. Unit evidence
  does not substitute for this gate.
- [ ] Dashboard/CLI/Operator: real Test10 workspace switch, genuine ceo reply,
  Opik acceptance, Resend/OTP acceptance, and controlled-restart persistence.

## Acceptance evidence

- Source: `8206a131`, `721f81ce`, pushed to existing PR206 branch.
- `integrationValidationResponse.test.ts`: seven unavailable response cases and
  valid/invalid/error provider response preservation passed.
- `workspaceSwitchResponse.test.ts`: four unavailable/malformed response cases
  and structured recovery error preservation passed.
- `npx tsc --noEmit`: passed after each source checkpoint.
- User's concurrently running full suite is separate evidence; it is not proof
  of these later commits. Full suite and CI results are not claimed here.

## Risks and limits

- No Test10 mutation, migration, restart, image build, key rotation, or fleet
  rollout performed. No credential values or customer data included.
- Existing source health gating is not evidence of correct deployed Kubernetes
  probes or large-inventory startup. Migration/readiness remain release blockers.
- Preserve original provision bindings, exact PVC/provider mount, all agents,
  workspaces, credentials, access state, and unrelated plugin restrictions.
