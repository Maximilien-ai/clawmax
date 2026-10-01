# Test10 SQLite preflight qualification

Status: conventional agent-schema startup refusal is implemented; automatic
migration and container acceptance remain unqualified. Dashboard owns the
remaining implementation and image gate.

The candidate helper is `SYSTEM/dashboard/scripts/sqlite-preflight.cjs`.
It invokes `openclaw doctor --session-sqlite validate
--session-sqlite-all-agents --json`, accepting only a structured validation
report with consistent target counts and zero reported issues. It bounds the
command at 420 seconds and captured output at 8 MiB; raw stdout/stderr is never
published. Exit zero means this validation completed, not that migration ran.

CLI may use the helper only with the intended runtime binary/config/state paths:
`OPENCLAW_BIN` selects the candidate binary (otherwise image PATH is used).
The helper neither stops a runtime nor proves it is stopped. Establish runtime
quiescence and backup independently before any subsequent migration action.
Do not run broad Doctor repair, delete owner leases, or substitute another
instance's configuration based on a preflight failure.

Evidence on September 30, 2026:

- Four regression tests passed: bounded projection, command/timeout/parse
  failures, inconsistent counts, exact read-only command and limits.
- TypeScript passed.
- Real pinned OpenClaw 2026.9.5 validation against a disposable empty workspace
  returned `ready: true`, `targets: 0`, `issues: 0`. This establishes invocation
  compatibility only, not persisted database or large-inventory acceptance.

Still required before startup integration or image qualification:

Persisted-fixture follow-up (`37794e13`): the pinned session validation command
returned zero targets for a current SQLite-only agent. The wrapper now compares
reported Agent IDs against databases in the conventional state-directory agent
inventory and refuses omitted targets. Six focused tests and the real pinned
runtime fixture test passed; both current and schema-19 database bytes were
unchanged. The schema-19 fixture follows the upstream historical fixture shape.
That checkpoint proved refusal/preservation, not successful schema migration. Custom
database locations and complete registered inventory still need qualification;
the session validation command alone is insufficient for general startup gating.

Migration follow-up (`8291cf07`): the opt-in synthetic test now invokes the
pinned upstream maintenance API under its real maintenance lease. Schema 19
migrates to schema 21; session nodes, windows and transcript events are preserved
across database reopen. The deliberately rebuilt `entry_valid` projection is
checked separately. A forced schema-publication failure rolls both version
markers back to 19 and preserves history. TypeScript passed. This is upstream
API qualification, **not a packaged CLI/container migration implementation**;
process interruption, active-owner refusal, full inventory and live restart
acceptance still remain.

The opt-in persisted test is
`SYSTEM/dashboard/scripts/sqlite-preflight-persisted.test.mjs`. Supply
`CLAWMAX_TEST_OPENCLAW_PACKAGE_ROOT`, `OPENCLAW_BIN`, and
`TSX_TSCONFIG_PATH` pointing to the pinned source `tsconfig.json`, and run Node
with `--import <pinned-source>/scripts/tsx.mjs`. It creates and retains only a
disposable synthetic state directory; it does not use an installed workspace.

- Representative current and older-schema databases with synthetic data; prove
  all expected stores are discovered and unchanged by read-only validation.
- Safe stopped-runtime migration and verified post-migration reads, including
  corrupt/newer schemas, failure/interruption, active leases, and preservation
  of credentials, agents, workspaces, and unrelated plugin restrictions.
- Authenticated readiness for large persisted inventories and controlled restart
  evidence. Test10's historical inventory is 13 Dashboard agents / 54 stores;
  that historical count is not asserted as its current live state.

The shared handoff remains `CLI-WEB-DASHBOARD-01` /
`test10-storage-and-fleet-rotation`. No image or deployment authority is granted.

## Packaged health false-positive and startup refusal

Source checkpoint `2a0fc6f3`: a disposable packaged OpenClaw 2026.9.5 gateway
returned authenticated health success while leaving schema-19 storage unchanged
and reporting unavailable sessions. Health success alone cannot qualify storage.
The optional `CLAWMAX_TEST_PACKAGED_STARTUP=true` fixture now reproduces that
limitation, gracefully stops its gateway, and checks the new refusal gate.

`openclaw-schema-gate.cjs` is packaged in the image and runs before gateway and
Dashboard startup. It reads conventional `agents/*/agent/openclaw-agent.sqlite`
stores without repair, requiring both schema markers to equal pinned version 21.
Old/newer/mismatched markers, corrupt databases and linked inventory entries
refuse startup with bounded codes. It never removes leases or runs repair.
Existing legacy JSON migration still precedes this gate; that existing repair
path is not covered by the read-only guarantee.

Focused evidence: 54 synthetic current-schema stores accepted with identical
database bytes; old/newer/mismatched/corrupt/linked stores refused; entrypoint
tests prove schema failure starts neither gateway nor Dashboard. Dockerfile
contracts, shutdown tests and TypeScript passed. Real leased migration and
forced rollback/history-preservation checks passed after reproducing the health
gap. This is not a 54-agent authenticated gateway or built-container test.

Limits: this is a schema-marker guard, not integrity validation, custom-path
inventory discovery, credential validation or a stopped-runtime migration tool.
Those acceptance gates remain open. The schema constant must track the pinned
runtime; the opt-in real fixture asserts that alignment. The user's preceding
green full-suite report predates this checkpoint and is not acceptance of it.
