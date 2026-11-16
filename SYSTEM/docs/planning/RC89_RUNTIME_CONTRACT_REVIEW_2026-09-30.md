# RC89 runtime observation aligned; isolated fixture preparation next

From: Dashboard
To: CLI
Created UTC: 2026-09-30T17:39:29Z
Priority: P0
Issue: rc89-runtime-observation
Status: ACTIVE
Owner: Dashboard
Working team: Dashboard
Supersedes: 20260930T162246Z_CLI-to-Dashboard_rc89-runtime-observation.md
Requested next action: Dashboard prepares the dedicated isolated identity, immutable fixture IDs, and pinned serving target; then coordinates live acceptance with CLI and Operator.

## Summary

Dashboard reviewed CLI commit `8bb10053b73ee218e85d6da0056b451a4b4e51ff` against
Dashboard contract `7b8347d2`. Schema and restart-observation semantics align.
This closes the source-contract review, not the live acceptance gate. We follow
handoff convention v1.1 without a proposed change.

## Completed

- [x] Reviewed CLI authenticated runtime client, trusted-discovery instance check,
  public command envelope, and lifecycle-runner comparison.
- [x] Passed both Dashboard before/after response fixtures through CLI runner
  validation after mapping to its documented public CLI envelope.
- [x] Independently ran the nine synthetic lifecycle-runner tests and focused Go
  runtime client/command tests; all passed without live targets or provider calls.
- [x] Confirmed the observed CLI working-tree changes are unrelated to the reviewed
  runtime implementation. No CLI source, installed profiles, or keys were changed.

## Open or waiting

- [ ] Dashboard: prepare dedicated fixture identity/membership, immutable workspace,
  Agent, Group, and Workflow IDs, plus a pinned single serving target. These are not
  yet supplied; do not reuse customer instances or infer an approved fixture.
- [ ] Dashboard and CLI: use a clean committed CLI build with exact version/digest,
  isolated browser/keychain bootstrap, and explicit instance/workspace selection.
- [ ] Operator with Dashboard/CLI: separately authorize and record the real restart,
  then compare observations and verify health plus same-ID resource persistence.
- [ ] Dashboard/Web/CLI: exact workspace cleanup and public Template lifecycle
  authority/recovery contracts remain separate RC89 blockers.

## Acceptance evidence

- Dashboard repository: `/Users/maximilien/github/Maximilien-ai/clawmax-codex`.
  Branch `feat-2.0-maintenance-parity`; runtime implementation `7b8347d2`;
  contract documentation `99e198bc`.
- CLI repository: `/Users/maximilien/github/Maximilien-ai/clawmax-cli`;
  reviewed feature `8bb10053b73ee218e85d6da0056b451a4b4e51ff`.
- `node --test scripts/test-instance-lifecycle.test.cjs`: 9 passed, 0 failed.
- `go test ./src/pkg/instanceclient ./src/cmd -run Runtime -count=1`: both
  packages passed.
- Dashboard fixtures `SYSTEM/dashboard/test/fixtures/instance-runtime-before.v1.json`
  and `instance-runtime-after.v1.json`: both accepted by CLI `validateRuntime`.
- Field agreement: `clawmax.instance/v1`, `RuntimeObservation`, instance identity,
  UUID boot identity, RFC3339 timestamp, and `dashboard-process` scope. CLI wraps
  those values in `clawmax.cli/v1alpha1`; it does not change the wire contract.

## Risks and limits

- A different Dashboard boot ID does not prove Gateway/container/VM restart,
  persistence, new-image rollout, or model usability. Load-balanced replica changes
  remain inconclusive without a pinned target and independent restart evidence.
- This review used synthetic fixtures, not an authenticated live lifecycle run.
  The fixture/authentication work remains Dashboard-owned, not a CLI response wait.
- No deployment, image build, default promotion, customer mutation, or broad cleanup
  was performed. Images remain delayed until local fixes, tests, and user acceptance.
