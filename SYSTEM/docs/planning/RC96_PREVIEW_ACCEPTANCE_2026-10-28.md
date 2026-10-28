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

Focused server tests, request-isolation tests, model discovery/catalog tests and desktop/mobile browser regressions passed. Server TypeScript passed; client diagnostics did not increase over the existing baseline. Full integration/validation/coverage is in progress; this document does not claim a finished release gate. Images stay deferred until that gate and user acceptance pass.
