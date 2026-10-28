# RC96 local acceptance — October 28, 2026

Dashboard team. Candidate branch: `integration/rc96-daniyar`. No RC96 images or release tag yet. Human acceptance precedes image creation.

## Included

- All RC95 source/features, including pins, chat composer expansion, AI workflow/group/community creation, model warnings, and public Review/Lifecycle support. Private extensions remain separate local attachments and are not copied into this public repository.
- #329 integrates #328/#330 recipient-length security fixes once (not three independent changes).
- #332 Add Agent fixes: saved defaults before generation, provider/runtime readiness, server/Gemini key support, visible configuration-load failures and credential redaction.
- RC96 fixes: per-request AI credential isolation; reject trust derived from external Host headers; exclude known image-only models from text-agent lists/saves; direct configuration editing from Details; inspect members from grid cards; horizontally scroll wide chat tables; honest response wording.

## Not included / unresolved

- #227: chat session lifecycle/migration needs old-store, multi-tab, active-turn and restart evidence.
- #228: automatic Gateway management needs proof it respects another installation's service and recovers safely.
- #229: progressive streaming needs reconnect, cancel/retry, duplicate-event and final-message persistence tests. RC96 does not promise progressive rendering.
- #288: legacy schedule cleanup must expose failures and prove duplicate schedules cannot survive restart.
- OpenAI-compatible runtime alias consistency remains under investigation; do not treat that provider path as newly certified.
- CodeQL false positives are not blanket-dismissed. Host/CSRF changes need independent review and fresh analysis; alert #727 needs re-analysis. Local targeted tests are not a complete security audit.
- Daniyar's real-environment runtime persistence and workflow acceptance remain pending until R5/R6 are recorded.

## Run locally

```sh
git fetch origin
git switch integration/rc96-daniyar
git pull --ff-only
./SYSTEM/local-dev.sh --no-open
```

Use the exact URL printed by the script; it chooses available ports. Keep that terminal running. Stop with Ctrl-C. Restart using the printed `./SYSTEM/local-dev.sh --root <directory>` command to retain the same isolated data. A fresh invocation without `--root` creates a separate environment. Add your own key through BYOK. Public source alone does not include private plugins.

Maximilien's existing preview is being refreshed at http://localhost:5182; confirm the visible version starts with `2.0.0-test-rc96-review1` before testing. Existing workspace data is retained.

## Accept these six checks

Record Pass / Fail / Blocked, visible version, provider/runtime and a short note. Avoid keys and private conversation content. Existing RC95 reports remain in their own release; they are not copied forward as unfinished work.

- **R1 — BYOK and new AI agent** (external-environment): Set your new-agent default to a supported text model, close/reopen Add Agent, generate and save an agent, then send a real chat. The saved model must match your explicit selection; no image-only model should be offered. Try a missing/invalid key: explain the failure and preserve the draft.

- **R2 — Existing agent model refresh** (human-judgment): Open agent Details, use Edit agent configuration in its header, change the model and save. Details must show the new model immediately. An unsupported existing model must show a warning and allow you to choose a replacement.

- **R3 — Chat readability** (human-judgment): Ask for a wide Markdown table and code block. Check horizontal table scrolling, copying, follow-up and Resend at desktop and narrow widths. The chat must remain usable without page overflow.

- **R4 — Group/community members** (human-judgment): In Communications grid, click the member count on a group and community. Confirm the displayed members, add/remove a test member, save and reopen. Check that names and purpose remain understandable.

- **R5 — Workflow with real agents** (external-environment): Create with AI, review owner, targets, schedule/timezone and content, save, run manually and inspect each participant result and execution logs. Real provider failures must be visible; do not accept only a green creation result.

- **R6 — Runtime restart and persistence** (external-environment): In the isolated preview, create a disposable agent/group/workflow, stop with Ctrl-C and restart the same --root. Confirm data, selected runtime, model, enabled plugins and a real chat still work. Do not stop the on-prem VM for this test.

## Engineering evidence

Focused server tests, request-isolation tests, model discovery/catalog tests and desktop/mobile browser regressions passed. Server TypeScript passed; client diagnostics did not increase over the existing baseline. Full integration/validation/coverage must be rerun on the final candidate; this document does not claim a finished release gate. Images stay deferred until that gate and user acceptance pass.

## October 28 acceptance feedback update

Checkpoint `fc29f422` adds searchable grouped model lists in BYOK and agent primary/backup selectors. Filtering retains the current selection. AI workflow generation accepts manual schedules and explicit participant selection (including Select all); the review editor also offers Select all agents. Re-test the reported manual workflow and save/run it with your provider.

Focused evidence: workflow library 83 passed, workflow routes 24 passed, skills route edge cases 14 passed, overlapping credential isolation passed; Add Agent/BYOK search, agent-edit search and workflow browser regressions passed at desktop/mobile widths. Server TypeScript passed and client diagnostics did not increase.

The prior full run reported two failed suites due to the mocked credential setter export; both now pass after the compatibility fix. A complete gate must still run again on the final image candidate. No RC96 images have been created.

### Same-name agent recreation

Fixed at `6620bb10`: explicit deletion clears the workspace initialization attestation even without optional profile-state removal. Failure to clear it prevents deletion rather than leaving a half-deleted agent. Agent routes: 82 passed; server TypeScript passed. Acceptance: create a disposable agent, delete it with ordinary defaults, recreate the same name, then chat. Other agents must remain intact.

### Consistency regressions — dropdowns, mentions and AI editors

- Open a model dropdown in BYOK/Add Agent/Edit Agent; search inside it, choose a result, and verify the dropdown closes. Escape closes only the dropdown, preserving the draft. Check near the bottom of a mobile dialog.
- Start another workflow after selecting all in the previous draft: selection starts empty. Type `@agent-slug`, `@Agent Name`, or `@all` and verify selected members. Removing a mention removes its selection; partial/unknown mentions never select a different agent.
- Repeat mentions and Open AI Editor → Save/Generate for groups and communities in Communications and Organization. A new form starts without members from the prior form.
- Verify readable group/community names on cards and member dialogs; agent and workflow names stay readable too. Internal routing IDs are retained and are not guessed from shared prefixes.

Regression evidence: desktop/mobile workflow, agent-edit, Add Agent/BYOK and group/community browser suites passed; AI generation 60 tests and communication-title 21 tests passed. Shared mention matching and participant pagination/error tests are in the standard test runner. Server TypeScript passes; no new client diagnostics over baseline. Full release gate remains required before image creation.

### Latest reported regressions

- Backup model: search, click the first filtered result, verify its label updates, save and reopen. Also try No backup model.
- AI workflow: start with a simple test workflow prompt for `@test-agent`, expand in Open AI Editor, then generate. Review the generated steps and any fenced sample inputs/outputs, save and run. Prompt quality is advisory, not proof of generated correctness.
- DAG deletion: use a disposable workflow's trash icon. Check the agent count, current run count, history and dependency consequences; cancel first, then confirm with its name. Targeted agents must remain.

Engineering evidence: reproduced first-filtered backup selection failure before fixing it; desktop/mobile selection tests pass. AI generation suite passes 61 tests, including raw and outer-fenced JSON with nested Markdown examples and rejected truncated JSON. Formatted agent mentions pass. Workflow browser regressions (including DAG delete cancellation and confirmation) pass at desktop/mobile widths. Server TypeScript passes. These checks do not replace real-provider acceptance or the final full release gate.

## Deployment-provided OpenAI access (RC96)

Web's supplied contract is `OPENAI_API_KEY` plus `USER_OPENAI_API_KEY`, injected as secret environment variables into each Dashboard container. RC96 fixes the default resolver so process-provided user keys are detected without browser BYOK. No key is returned to the browser or copied to browser storage. A fresh instance displays OpenAI as a deployment default and selects `openai/gpt-5.4-mini` for new-agent and system defaults; explicit saved workspace choices win. Web's validation model is not a workspace default because Web does not currently send a model setting. Restart/recreate the container after changing its environment.

Dashboard evidence at `e2466928`: injected-key regression failed before the fix; environment tests 32, execution-env tests 23, workspace-default tests 8, integration-route tests 16, and AI generation tests 61 passed. Browser checks passed at desktop/mobile with empty stored keys, selected defaults, generation and provision validation. Server TypeScript passes; client remains at its existing 291 diagnostics, with none added. Provider calls in these tests are synthetic. This does not prove the Web worker has injected a real canary's keys or that its account can execute a live model.

External acceptance (R1): deploy with both variables and open a fresh browser session; confirm OpenAI is configured, defaults are selected, create an AI agent without entering BYOK, and send its first chat. Reload and repeat. Confirm an explicitly selected model is retained. Web/CLI own worker delivery and runtime injection evidence. Do not put key values in reports.

Release checkpoint: Max accepted the reported model, workflow and DAG fixes. Pre-deployment-key full gate at `11afb9f1` passed 559/559 with 83.55% statements, 81.21% branches and 91.92% functions. The final full gate must pass again with deployment-key changes before image dispatch. #320 merged; #324 and #330 need fresh CI after updating main. #342's additional speech/transcription filtering is integrated with RC96's stricter image exclusion preserved. Main integration #344 still needs independent approval and CodeQL disposition; test-image publication is not security clearance or fleet deployment.
