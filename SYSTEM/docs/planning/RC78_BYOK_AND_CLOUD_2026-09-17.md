# RC78 BYOK and cloud execution — 2026-09-17

Status: public and combined image CI passed; full local retry passed. The user
approved RC78 installation on MBP14 and test10, and both now run the pinned
combined image. Broader rollout remains held: MBP14's live GTM probe exceeded
three minutes, and test10 encountered a gateway startup configuration race
that required a controlled restart. Fresh cloud chat acceptance passed after
that restart; all four Operations workflows were verified disabled in the UI.
Operations deployment remains
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

### Replacement local gate and retry

- `/tmp/clawmax-rc78-final-release-gate.log`: exit 1, 481 passed, 1 failed.
  All four original failures passed, including skill persistence and exact
  workflow deletion. Live agent chat failed with OpenClaw's
  `Opening handshake has timed out`; this remains unresolved, not a passing gate.
- Coverage: statements/lines 82.65%, branches 72.32%, functions 92.01%.
  Disposable integration-workspace cleanup and absence of test artifacts in
  the default workspace passed.
- One complete retry passed with `CLAWMAX_TEST_API_TIMEOUT_SECONDS=180`:
  exit 0, 486 passed, 0 failed, including live agent chat and fixture cleanup.
  Coverage: statements/lines 82.65%, branches 72.32%, functions 92.01%.
  so slow setup requests have a bounded opportunity to finish. No production
  timeout was changed and no automatic request retries were added.
  Log: `/tmp/clawmax-rc78-retry-release-gate.log`.
- [Candidate CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35243395539)
  passed for `f421634ce864bc5371bb8ec05fd1547ed0d4320a`.

## Publication and acceptance gates

1. Candidate CI and the complete local integration/validation/coverage retry
   passed. Canary execution evidence remains separate from local test success.
2. Immutable tag `v2.0.0-test-rc78` pins
   `f421634ce864bc5371bb8ec05fd1547ed0d4320a`.
   [Public image CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35245572021)
   started 2026-09-17 16:16:37 UTC with
   `source_ref=refs/tags/v2.0.0-test-rc78`, `test_tag=rc78`.
3. [Combined image CI](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/35248971424)
   passed at private source `ce2516d8a07ef96796ca138b748e6bd501672547`, with
   matching `base_tag` and `image_tag` `2.0.0-test-rc78`.
4. Both architecture builds and registry smoke passed. Public lifecycle jobs
   passed on amd64/arm64; combined native smoke passed on both architectures,
   including packaged discovery and the arm64 populated restart/lifecycle lane.
   Public index: `sha256:add211d14d05140618af516527acdfb2b3376b3ef9ccfaa31e9451daa0c67b46`.
   Combined index: `sha256:b499b785ebf05b75e1220e58241e9d4667b2496d9fe40ab6f2f29a4aabd510b4`.
5. Validate MBP14 and test10 before any broader test-client rollout. A fresh
   cloud model response passed, but MBP14 chat and cloud startup reliability
   remain unresolved. Only the two explicitly approved canaries were upgraded.

Recent image durations: public approximately 32 minutes; combined 23 minutes.
Check near halfway and expected completion plus one minute, then sparsely if
overdue. Do not call the public/combined candidate ready until both pass.
The temporary coordinator `/tmp/clawmax-rc78-images.cjs` records progress in
`/tmp/clawmax-rc78-images.log`; it checks the expected public source, verifies
private main still matches the source above, dispatches matching tags exactly
once, and stops on a failed pipeline. It performs no client deployments.

## Canary installation and live checks

- MBP14 deployment-worker action `mbp14-rc78-canary-20260917` completed;
  the installed worker continues to report healthy on the pinned RC78 digest.
  The Podman VM was not stopped. HTTP loopback issuer remains unchanged.
- test10 deployment `clawmax-dashboard` was changed to the same combined digest.
  This is direct Kubernetes rollout evidence, not coordinator queue acceptance.
  Initial external 502 responses settled. Its PVC UID remains
  `8025e55b-12fb-451c-a6ba-238235bb5c45`.
- Authenticated CLI version checks report RC78 on both. Agent/workflow counts
  and sorted-ID hashes match before/after across all four MBP14 workspaces and
  all six test10 workspaces. Evidence: `/tmp/clawmax-rc78-before.json` and
  `/tmp/clawmax-rc78-after.json`.
- Settled public readiness counts: MBP14 14 agents, 83 templates, 4 groups,
  5 workflows; test10 default 13 agents, 85 templates, 11 groups, 9 workflows.
  The cloud template/group figures are post-upgrade observations, not a new
  independently collected pre-upgrade equality claim.
- BYOK desktop/mobile visual checks passed on both. On-prem local options remain;
  cloud local-model/CLI options are absent and cloud-reachability guidance is
  visible. Save is within the visible dialog on both. No keys or model selections
  were changed. Screenshots mask form inputs.
- Existing GTM chat contents match after close/reopen (hash comparison without
  logging message contents). Markdown downloads succeeded: MBP14 7,750 bytes,
  test10 2,363 bytes. Agent ZIP downloads succeeded: MBP14 24,740 bytes, test10
  22,243 bytes; both passed `unzip -t`. Downloads stay in local `/tmp` only.
- MBP14's fresh synthetic no-tools chat did not complete within 180 seconds.
  The exact probe was cancelled; its child process was confirmed gone. Existing
  GTM configuration manually selects `openai-compatible/qwen/qwen3.6-27b`.
  Its configured local compatible endpoint passes live connection validation,
  including the UI's direct prompt-completion check using `qwen/qwen3.6-27b`.
  This narrows the failure beyond basic endpoint reachability but does not
  establish that the full agent execution path works.
  This does not yet establish whether the response delay is an image regression,
  local model performance, or another runtime issue. Existing history is intact.
- test10 initially had a refused connection on gateway port 18789 while
  dashboard/storage readiness was green. Startup stderr reported:
  `Refusing to run automatic gateway startup migrations because the selected config changed during startup.`
  One controlled deployment restart recovered the gateway connectivity probe.
  The concurrent writer is not identified yet; this is an unresolved startup
  reliability issue, not a fully passing cold-start acceptance claim.
- After the user signed in again following the controlled restart, one fresh
  synthetic no-tools cloud GTM chat returned exactly `RC78_OK`. The response
  was present and no request remained active at the check 116 seconds after
  submission; this is an observation bound, not measured response latency.
  A subsequent gateway connectivity probe remained healthy. Existing cloud GTM
  selects hosted `openai/gpt-5.4-pro` with `openai/gpt-5.4` backup. No model
  settings were changed and no user credentials were copied or logged.
- CLI RC4 compatibility gaps observed: Groups and Templates listing returned
  route-not-found on RC77 before upgrade; agent health on both RC78 instances and
  cloud workflow detail also return route-not-found. Do not substitute a private
  API for these missing CLI contracts. Operations deployment is still unavailable.
- No workflow was run or enabled by these canary checks. Post-restart UI checks
  in the Operations 0.1.0 workspace confirmed all four workflows display
  `Disabled` and `No upcoming run`: daily account operations, daily site health,
  weekday relationship follow-up, and weekly newsletter planning. This is
  explicit schedule-state evidence, separate from unchanged ID/count checks.
- RC77 rollback image retained:
  `ghcr.io/maximilien-ai/clawmax-plugins@sha256:1db1e5aeb4000f92601c0ac6e998635bd4d99f086a4a35d3d4f46fa295923477`.
