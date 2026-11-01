# RC97 local acceptance — 2026-10-31

Candidate source: `5a7f1df1`, branch `integration/rc97-stability`.
Local preview: http://localhost:5198 (`2.0.0-test-rc97-review1.5a7f1df1`).
This is an isolated, initially empty workspace. Add your provider key in Model Integration. Existing RC96 and on-prem environments are unchanged. Images have not been built.

## Latest regression retest

- [x] **R1 — BYOK while creating an agent** (`reviewReason: external-environment`): Refresh the browser, open Create with AI, save your new-agent default in BYOK, and return to the wizard. The default should appear without reopening the wizard and the missing-model warning should clear.
- [x] **R2 — AI Editor generation** (`reviewReason: external-environment`): Enter a description, open AI Editor, expand it, then Save & Generate. Confirm files are generated and provisioning uses your selected model. Existing draft/key/workspace data was retained during the preview refresh.

User confirmed R1 and R2 passed. Workspace count failed acceptance: API returned 1 but the picker retained its initial 0. The picker and top-bar follow-up fixes passed user acceptance. Budget acceptance remains separate and unconfirmed.

- [x] **R3 — Chat usability** (`reviewReason: human-judgment`): Open group/community chat, confirm the wider desktop panel feels comfortable, then press Escape to close. Phone layout must still fit the screen.

- [x] **R4 — Required channel name** (`reviewReason: human-judgment`): For both group and community, click Create without generating a draft or entering a name. Expect a clear required-name message and focus on Name. Enter a name manually and create successfully; Generate Draft must remain optional.

User reports all existing checks except template apply passed, including live budget testing after Opik configuration. R4 is the only new regression retest.

## Human acceptance

- [x] **A1 — Basic agent flow** (`reviewReason: external-environment`): Configure your provider and default model, create an agent, chat, follow up, and reload. Confirm the selected model and conversation remain correct.
- [x] **A2 — Workspace counts** (`reviewReason: external-environment`): Create a second workspace and agents; switch workspaces, archive/delete an agent, and reload. Confirm each workspace's dropdown count matches its active roster. Especially repeat on the environment that previously showed zero.
- [x] **A3 — Budgets** (`reviewReason: external-environment`): Create a workspace with a budget; reopen settings and reload. Change only its name and confirm the budget remains unchanged. Check actual spending behavior with your provider; metering and enforcement are not claimed fixed by the settings changes.
- [x] **A4 — Organization template** (`reviewReason: external-environment`): Apply a small team template, inspect its agents/groups/workflows, and run a workflow. If apply fails, confirm it identifies the problem rather than claiming success. Report the template and exact error.
- [x] **A5 — Groups and communities** (`reviewReason: human-judgment`): Create with AI, inspect members, search/add/remove members, cancel without saving, then save and reload. Check readable names and keyboard/mobile usability.
- [x] **A6 — Workflows** (`reviewReason: external-environment`): Generate with AI using an explicit agent mention, review its owner/targets/content, save, run, and inspect the outcome. Verify your basic workflow and team creation flows carried forward from RC96.
- [x] **A7 — Plugins** (`reviewReason: human-judgment`): Open the enabled plugin pages and confirm the intended selection and familiar actions are available. User confirmed the plugin page opens; deeper plugin actions remain optional exploratory testing.

## Engineering evidence and boundaries

Already passed: 83 template tests (including missing-owner rejection before writes, partial workflow-save failure, and corrected reapply), server TypeScript, and the previously recorded focused workspace-budget/count, model selection, member-dialog, and secret-isolation checks. Full integration/validation/coverage finished: 559 passed, 1 failed (workspace-dialog mobile layout audit). Live provider chat was skipped because the isolated test runner had no API key. This remains an image-release gate. Afterward, all 14 agent-default browser scenarios and server TypeScript passed for the BYOK refresh fix.

Template preflight checks missing owners, explicit agent targets, team leaders and members. Workflow save failures report incomplete apply and preserve applied resources. This is **not a transactional apply**: there is no supported one-click undo, durable recovery journal, or guaranteed retry after arbitrary failure. Do not delete existing workspace resources to recover automatically.

Not included yet: automatic provider primary/backup pairs, WhatsApp pairing repair, complete metering fixes, and the remaining held PRs/feedback. RC96 functionality is retained. No claim that every reported problem is resolved.

## Local controls

Keep the preview process running while testing. Restart the same isolated data with:

```sh
./SYSTEM/local-dev.sh --root /private/var/folders/nv/8pltgq7960988zh0m43w7vf80000gn/T/clawmax-local-dev-BqPnRX --no-open
```

Run from this branch checkout. Ctrl-C in its launcher stops only this preview's Dashboard and Gateway. Do not use on-prem stop commands.

Release order: finish engineering checks → local human acceptance → exact RC97 source/tag → matching public and combined images → image smoke tests and handoff to Daniyar.

## Template follow-up acceptance

User confirmed group/community required-name validation passed. Remaining external checks:

- [x] **T1 — Wispr Flow** (`reviewReason: external-environment`): Open Create template with AI and dictate immediately. Confirm the focused team prompt receives the words and AI Editor/generation retains them. Browser insertion is tested; native Wispr integration needs this check.
- [x] **T2 — Generated template Apply Now** (`reviewReason: external-environment`): Generate a team, select Apply Now, and confirm it opens Deploy using defaults without the customization sequence. Apply it and verify agents/workflows. Separately confirm Customize opens customization.
- [ ] **T3 — Catalog and failure handling** (`reviewReason: external-environment`): Inspect a catalog team, compare Apply Now and Apply with Customization. Required setup/conflicts must stay visible and prevent incomplete deployment. When a real apply fails, record the exact template/error and confirm it does not claim success. Full rollback is still unsupported.

Template focus, generated Apply Now completion, failed apply draft preservation, and retry navigation passed desktop/mobile synthetic browser checks. Server TypeScript passed. Images remain gated on the separate workspace mobile-layout failure and complete candidate validation.

## Final engineering checkpoint

User accepted the normal template/Wispr/Apply Now/Customize flows. Live failed-apply recovery has not been independently exercised; synthetic failure/retry checks passed, and transactional undo remains outside this candidate.

Kickoff display ordering is now stable and first among disconnected workflows, without altering dependency edges. Desktop/mobile graph checks passed. Workspace dialogs now use fixed titles/actions with a scrolling field region; the previously failing layout audit and short-screen budget checks pass. Full integration/validation/coverage rerun started on `2c5dfe84`; result recorded below. No images dispatched.

## Final local validation result

The full `integration --with-validation --coverage` run on product/test source `2c5dfe84` passed: **561 passed, 0 failed**. Statement/line coverage 83.78%, branches 81.48%, functions 92.09%. Log: `/private/tmp/rc97-final-validation.log`. Live paid agent chat was skipped because the isolated runner had no provider key; user live acceptance is separate evidence. Server TypeScript and focused browser checks passed; client diagnostics have no additions versus the existing baseline.

Local preview: `http://localhost:5198`, version `2.0.0-test-rc97-review1.1557b6c5` (documentation-only commit after the tested product changes). Data and Opik configuration retained. Workspace mobile-layout blocker is resolved. No RC97 images have been dispatched and no main merge is claimed by this result.

### Workflow sequence correction after acceptance

The kickoff-only ordering was insufficient. Saved organization-template Markdown omitted workflow IDs, so reloading generated title-derived IDs while dependencies still referenced the original IDs. The serializer/parser now preserves explicit IDs (legacy files without IDs retain their existing fallback). The DAG now lays stages out top to bottom and waits for all dependency and handoff predecessors before placing a downstream step.

Validated at product SHA `f80eed82`: server TypeScript, all 83 template tests, and desktop/mobile browser regression for Kickoff → Build → Assemble → Finalize. Three existing local Personal Operations workflow files were backed up and their exact broken references repaired; no agents or workflow history were deleted. Preview: `http://localhost:5198`, version `2.0.0-test-rc97-review1.f80eed82`.

Please visually confirm the full sequence in the existing team. The earlier 561/0 full suite predates this correction; rerun the release suite before image dispatch. No RC97 images have been dispatched.

### Final scope review and user test handoff

User accepted the restored compact horizontal sequences. Latest admitted fix: #375 preserves secondary output definitions during unrelated workflow edits (`726707ca`); server TypeScript and desktop/mobile workflow editor browser tests pass. The three integrated Daniyar PRs #346/#347/#349 remain open/review-required on GitHub, with green PR CI. No additional PR was merged in this review. Overlapping #339/#340/#341/#343 need reconciliation, not blind merging. Hold larger runtime/chat/scheduler and dependency upgrades for separate validation. Document safety (#351/#352/#355), workflow export (#367), metering (#354/#361/#362), and remaining UI feedback are unresolved scope, not claimed fixed.

The previous full 561/0 result predates the latest workflow changes. Run from the owning RC97 checkout, not the old main checkout:

```sh
cd /private/tmp/clawmax-rc97-worktree
DASHBOARD_PORT=3018 DASHBOARD_CLIENT_PORT=5199 DASHBOARD_APP_URL=http://localhost:5199 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

The wrapper prepares its pinned OpenClaw runtime and isolates test data. A paid-provider skip is not a live-provider pass. Images remain gated on this final result; no RC97 or RC98 image was dispatched.

### RC97 image admission

User ran the final integration, validation and coverage suite on the frozen candidate and supplied the complete passing output: 561 passed, 0 failed. Coverage: statements/lines 83.78%, branches 81.49%, functions 92.09%. Isolated artifacts: `clawmax-test-runtime-4ojAVj`. Paid-provider agent chat and live AI generation were skipped (no key); prior manual live acceptance remains separate evidence. Workflow kickoff completed and DAG progression passed. User authorized RC97 images after this result.

Recent public builds took 62–69 minutes; matching combined builds took 14–15 minutes. Release images require both architectures and registry/lifecycle/plugin smoke validation before readiness is claimed. Public and combined image tag: `2.0.0-test-rc97`.

RC97 public source pin: `v2.0.0-test-rc97` at `442afc2da52434a62f9872ebd825efb282ec9518`.
Public image CI: https://github.com/Maximilien-ai/clawmax/actions/runs/41252733312
Combined source pin: private `v2.0.0-test-rc97` at `eb9af8eb05988a7c5ed307e7aff3788a81107fab`.
Combined dispatch is queued behind successful public CI with identical `base_tag`/`image_tag` (`2.0.0-test-rc97`). Coordinator log: `/private/tmp/rc97-image-queue.log`. It stops without dispatch on public failure or a two-hour timeout. Images are not yet declared ready. Local `/api/system` reports exact `2.0.0-test-rc97`.

### RC97 images verified — 2026-11-01

Both image workflows completed successfully. Public run `41252733312` passed both architecture builds, registry smoke and lifecycle acceptance. Combined run https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/41270217012 passed validate, runtime-acceptance, build, native arm64/amd64 registry-smoke, and record-mirror-target. The local queue had not dispatched the combined build; it was stopped and the pinned combined workflow explicitly dispatched after confirming public success.

Tester deployment image: `ghcr.io/maximilien-ai/clawmax-plugins:2.0.0-test-rc97`.
Public-only image: `ghcr.io/maximilien-ai/clawmax-dashboard:2.0.0-test-rc97`.
This establishes image validation, not a deployed-fleet update or closure of deferred issues.
