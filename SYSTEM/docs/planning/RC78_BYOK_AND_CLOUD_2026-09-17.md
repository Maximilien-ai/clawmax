# RC78 BYOK and cloud execution — 2026-09-17

Status: release validation in progress; no RC78 image or client rollout yet.
RC77 remains unchanged on MBP14 and test10. Operations deployment remains
outside this stability candidate; recurring Operations schedules stay disabled.

## Candidate scope

- BYOK dialogs keep Save visible with a scrolling body at desktop/mobile sizes
  (`d41d3a88`).
- Cloud instances do not offer machine-local models or local CLI execution.
  Explicit cloud-reachable compatible endpoints remain supported; stale local
  endpoint settings cannot mask usable hosted credentials (`494eddab`).
- Shared root lint/build/test commands and CI wiring (`710e7fd2`, `76fe3606`).
- Release API checks use bounded configurable timeouts, report transport errors,
  and never retry writes. Test workflow fixtures start disabled and manual
  (`94f5245d`).

## Engineering evidence

- Root lint, server TypeScript, and production build passed. Existing frontend
  chunk-size warning remains. Whole-client TypeScript retains 290 pre-existing
  diagnostics (down from 291); it is not a clean client typecheck.
- Cloud execution focused suites: 222 tests passed; prior evidence is recorded
  in the [RC77 source follow-up ledger](RC77_STABILITY_AND_CHAT_2026-09-16.md).
- Cloud/on-prem isolated browser regressions repeated against this checkout:
  1440x900, 1280x600, 390x844, and 320x568 passed layout, save/reload,
  availability, validation-error, and agent create/edit presentation checks.
  API traffic used synthetic fixtures, not real user keys or instance writes.
- Ignored local `.env` set to `CLAWMAX_VERSION=2.0.0-test-rc78`; restarted source
  dashboard reports that version through `/api/system` and its visible header.
  Screenshot: `/tmp/clawmax-rc78-local-version.png`.
- Private source `ce2516d8a07ef96796ca138b748e6bd501672547`: all plugin validators,
  image/entrypoint contracts, and runtime acceptance against this public host
  passed. No private source changes were made.
- [Pre-harness-fix CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35237396283)
  passed at `a898350674ef50329f446d0bd2b343108beacf1a`.

### Initial local gate — not passing release evidence

Full integration/validation/coverage run exited 1: 465 passed, 4 failed.
Failures concerned two agent fields, skill assignment, and workflow creation.
Subsequent reads confirmed the agent fields and all workflow IDs were present;
the workflow create had committed despite the client's ten-second timeout.
That exact run-owned `test-workflow` (created 15:36:34 UTC, author `test-suite`)
was deleted successfully. Existing workflows and legacy workspace files were
not removed. A complete rerun is required after the harness fix; the skill
assignment failure is not independently cleared by those read-only checks.

Coverage from this failed run: statements/lines 82.65%, branches 72.33%,
functions 92.01%. Log: `/tmp/clawmax-rc78-release-gate.log`. Observed duration
approximately 40 minutes, exceeding the original 20–30 minute estimate.

The timeout fix passed all three developer-command contracts, shell syntax,
root lint, and server TypeScript before commit. It changes test behavior only,
not production request limits or validation assertions.

## Publication and acceptance gates

1. Pass the complete replacement integration/validation/coverage run and CI.
2. Tag the exact candidate and dispatch public `Test Container Image` with
   `source_ref=refs/tags/v2.0.0-test-rc78`, `test_tag=rc78`.
3. After public success, dispatch the private combined image with both
   `base_tag` and `image_tag` set to `2.0.0-test-rc78`.
4. Record both CI links, immutable digests, both architecture results, packaged
   version, registry smoke, restart persistence, discovery, and source boundary.
5. Validate MBP14 and test10 before any broader test-client rollout. A fresh
   cloud model response remains required; existing-history checks are not a
   substitute. This image-building task does not itself roll out clients.

Recent image durations: public approximately 32 minutes; combined 23 minutes.
Check near halfway and expected completion plus one minute, then sparsely if
overdue. Do not call the public/combined candidate ready until both pass.
