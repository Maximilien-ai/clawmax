# RC98 scheduler acceptance — November 11

Dashboard source checkpoint for existing [PR #288](https://github.com/Maximilien-ai/clawmax/pull/288), addressing [#287](https://github.com/Maximilien-ai/clawmax/issues/287). This is not an RC image or fleet deployment. Stable remains v1.9.9; RC98 has not been cut.

## Your check

- [ ] **Recovery wording is clear.** Read the message below and judge whether it makes clear that a failed cleanup preserves the workflow and that deletion can be retried after checking Runtime. No need to force a failure, delete your workflows, or run an agent. `reviewReason: human-judgment`

> The workflow was kept because its older scheduled jobs could not be stopped. Check Runtime status before trying again.

Reply **accept #287** (or **accept #288**) if the wording is clear. Everything below is engineering verification, not extra reviewer tasks. Local dev: **http://localhost:5180**; version **`2.0.0-dev.0bb4540c`**, workspace **RC98 Scheduler Acceptance**. One paused fixture is provided; do not run it for acceptance. All earlier acceptance data remains available.

## Resulting behavior

- Dashboard alone owns tracked workflow schedules. New saves do not create Gateway cron jobs; pause, runtime authority, budgets, run limits and history remain in the tracked workflow path.
- Legacy cleanup only removes jobs whose Gateway-listed names establish the old ClawMax namespace. A crafted workflow cannot remove a foreign job or another workflow's named legacy job through a stored ID.
- Partial, malformed or inconsistent inventories delete nothing and retain retry evidence. Gateway-supplied IDs cannot become CLI options; selected-runtime failure cannot fall back to global OpenClaw.
- Startup cleanup remains asynchronous, removes orphaned legacy jobs, and reports incomplete/failed cleanup through scheduler diagnostics. An active-workspace switch cannot clear another workspace's workflow metadata.
- Repeated scheduling sync keeps one active timer. Replaced/stopped timers and disabled workflows reject stale callbacks.
- Failed deletion retains the definition and execution history and returns a safe error. Bulk deletion settles all requests, refreshes the result, retains failed selections and retries only remaining workflows.

## Engineering evidence

Product/test source: `0bb4540cd180a4fb1d3937310e9d4ce27f0508f9` (later documentation-only checkpoints do not change this product source).

- [x] Current main `0de68dae` merged into the existing fork PR without rewriting its history. The newer selected-runtime refusal, Template authority, disabled-tick guard and per-workflow scheduling failure isolation were preserved.
- [x] Scheduler: **12 cases**; cron security: **75 assertions**; workflow library: **82 cases**; workflow routes: **26 cases**; deletion helper: **13 scenarios**. Required shell coverage now includes the deletion suite and reports actual cron assertion counts with nonzero exits respected.
- [x] Real pinned OpenClaw **2026.9.7 (c074824)** Gateway: scoped removal, foreign/native-job preservation, orphan cleanup and idempotency passed in a new isolated state, with cron execution disabled and no agent turns. Its built-in review job was correctly retained. Log: `/private/tmp/clawmax-288-native-gateway.log`.
- [x] Production Workflows page and dialogs: **four light/dark × 1440px/390px runs** passed retained errors, safe messages, pending/partial batch results and successful retry. Screenshots reviewed after animations settled: `/private/tmp/clawmax-288-browser/`.
- [x] Isolated-gateway startup, occupied-port and cleanup tests passed after adding the explicit scheduler-smoke mode.
- [x] Server TypeScript, focused lint and production build passed. Strict frontend TypeScript remains **291 baseline diagnostics**, with no new patterns. It is not claimed green.
- [x] Exact-source full local integration/validation/coverage on **`0bb4540c`**: **571/571 passed**, zero failures, **11.0 minutes**. Coverage: **83.89% statements/lines**, **81.60% branches**, **92.21% functions**. Live agent, group/community isolation and workflow execution passed. Log: `/private/tmp/clawmax-288-full-0bb4540c.log`. The new deletion suite adds one top-level check; the extended suites report nested counts separately.
- [x] Same-query CodeQL comparison: **zero added/removed findings**, **zero findings on added/modified lines**, successful query execution, on exact product source `0bb4540c` against merged main `0de68dae`. GitHub default setup excludes fork PRs; this is a local regression scan, not a missing remote run labelled green. Official CLI **2.27.4**, JavaScript queries **2.5.0**, standard **89-query** code-scanning suite. Both archives produced **606 raw results**: **12 critical-rated**, **588 high-rated**, **6 other**. These baseline results are not automatically waived or claimed fixed. Dashboard owns reconciliation with existing alert dispositions before RC98 promotion; this is not a complete security audit. Source archives contain only committed public files. CLI ZIP SHA-256 verified: `7da72a7a758ef272985cce665ddb22bccc0b0a212f09f175d943eb5ff5fc57e4`.
  Results: `/private/tmp/clawmax-288-codeql/base.sarif`, `candidate.sarif`, `comparison.json`. Main extracted **936/936**, candidate **940/940** JavaScript/TypeScript files. Reproduce with official CLI `database create --language=javascript-typescript --build-mode=none`, then `database analyze` using `codeql/javascript-queries@2.5.0/codeql-suites/javascript-code-scanning.qls` on both identified archives; compare `(ruleId, artifact URI, primaryLocationLineHash)` with multiplicities. Go/Actions source was unchanged; this does not claim a new scan of other languages.
- [x] [CI passed on product source `0bb4540c`](https://github.com/Maximilien-ai/clawmax/actions/runs/43069176717).
- [ ] Pass the actual current PR head's CI before owner merge if the final documentation checkpoint triggers another run. Previous comparable CI took about **43 minutes**; earlier heads' results do not establish a newer head's status.

CodeQL archives contain committed public source only, excluding ignored credentials and private plugins. No query or repository security setting was disabled. The unsuccessful same-commit dispatch probe created no replacement PR, and its temporary validation branch was deleted.

## Completed prior batch

- [x] Owner accepted #404; PR #417 merged November 11 as `0de68dae7eed6698e11ff904a727cd2eb40eb081`; #404 is closed. Exact review head `74ce9db6` passed **570/570** local checks and final CI/CodeQL.
- [x] Management feedback `8b793b8a-bc32-4df0-8600-1ccfbe7e0591` closed as addressed. Closure receipt `0bc877d4-a9ca-46c2-b012-fe7f945f96f9`; resolution reply `18055f63-cfee-4ba4-8a2b-9f937e5d2144` thanks the reporter and confirms inclusion in a future ClawMax version. Email was requested; the saved receipt was pending at submission, and delivery is unconfirmed. No installed-instance upgrade is claimed.
- [x] Earlier document/workflow/budget fixes, membership keyboard behavior, Details editing and dark-mode follow-up remain accepted. Their historical criteria and results stay in the [November 10](RC98_ACCEPTANCE_2026-11-10.md) and [November 8](RC98_ACCEPTANCE_2026-11-08.md) records.

## Remaining release gates

This is a single-Dashboard scheduler fix, not a distributed scheduler lease. Two Dashboard processes writing one workspace remain outside this claim. A manually renamed legacy job cannot establish legacy-name ownership automatically; preserve it for owner review. A degraded cleanup diagnostic remains an unresolved operational condition, not proof that all legacy duplicates stopped. Schedules run only while Dashboard runs.

Retain the strict frontend baseline follow-up, final-build mobile workflow-navigation rerun, late budget-read cancellation regression, fresh all-feedback intake/email delivery verification, candidate CI/security review, release-document cleanup and installed-instance/provider checks with their owners. For RC98 itself, align `2.0.0-test-rc98`, verify UI/API identity, then validate matching public/private amd64/arm64 images, smoke, plugin discovery, restart persistence and source boundaries. No image is released here.
