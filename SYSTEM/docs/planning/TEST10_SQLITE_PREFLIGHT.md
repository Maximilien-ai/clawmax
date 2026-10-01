# Test10 SQLite preflight qualification

Status: read-only diagnostic checkpoint; automatic migration/startup wiring is
not qualified. Dashboard owns the remaining implementation and image gate.

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
This proves refusal/preservation, **not successful schema migration**. Custom
database locations and complete registered inventory still need qualification;
the session validation command alone is insufficient for general startup gating.

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
