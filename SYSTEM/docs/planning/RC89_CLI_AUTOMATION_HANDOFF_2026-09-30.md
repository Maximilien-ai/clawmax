# RC89 local automation coordination

Time: 2026-09-30 15:06 UTC (08:06 PDT)
From: Dashboard team
To: CLI team
Priority: P0 release-gate coordination
Status: implementation in progress; no image build or external deployment authorized

Dashboard source: `/Users/maximilien/github/Maximilien-ai/clawmax-codex`
Branch: `feat-2.0-maintenance-parity`

## Verified Dashboard checkpoints

- `efea78eb`: BYOK Save no longer waits for CLI runtime discovery. Server preserves
  omitted runtime selections; browser save has a bounded timeout. Fifteen route
  tests and TypeScript passed.
- `b140c01e`: synthetic browser checks passed for local/cloud deployments at
  1440, 1280, 390, and 320 pixels, covering blocked discovery, save failure/retry,
  browser-key persistence, and dialog layout. No real provider calls or keys used.
- `e34ab6eb`: shared managed-config writer refuses nested OpenClaw redaction
  placeholders before disk mutation, including protected gateway values inherited
  from disk. Ten config tests and TypeScript passed. This is a protective guard,
  not identification of the original writer or full template recovery.

The MBP14 template split-state and gateway watchdog handoffs remain RC89 blockers.
Legacy organization import still needs a durable cross-store transaction/recovery
path. Do not infer those defects fixed from the checkpoints above.

## CLI automation gap and requested action

Inspected installed `/opt/homebrew/bin/clawmax`: `2.0.0-test-rc17`.
`clawmax instance templates --help` explicitly states plan/apply remain fail-closed
pending remote authority bindings. The checked-out CLI Skill confirms that
limitation and prohibits substituting private endpoints.

Please provide the exact compatible CLI source/binary and supported authenticated
local-instance E2E setup, or confirm the remaining public contract requirements:

1. Disposable workspace creation and exact-ID cleanup without changing an operator's
   selected production instance/workspace.
2. Public Template plan/apply/inspect/retry/cleanup with server-owned bindings,
   idempotency, and recovery status. Clarify how the legacy parameterized nine-agent
   organization-import regression maps to the supported portable/public contract.
3. Agent chat, Group chat, workflow run/wait/result/cancel, and restart persistence
   with bounded JSON evidence and safe synthetic prompts.
4. Authentication bootstrap suitable for an isolated local fixture without putting
   credentials in argv, logs, committed fixtures, or handoff files.

Dashboard will test browser-only settings such as BYOK and search through synthetic
browser tests; CLI coverage must not be claimed for unavailable command surfaces.
Do not enable missing commands by bypassing Dashboard authorization or using local
credential-binding files against remote APIs.

## Joint acceptance

Before images: complete local fixes, focused and browser tests, full integration/
validation/coverage, then user acceptance. After RC89 candidates are built, repeat
the acceptance matrix on explicitly authorized cloud and on-prem targets before
promotion. No fleet changes, no default-image changes, no private customer data in
fixtures. Record CLI/Dashboard SHAs, exact versions, immutable resource IDs, bounded
results, cleanup evidence, and unresolved limitations.
