# RC97 local acceptance — 2026-10-31

Candidate source: `336b0144`, branch `integration/rc97-stability`.
Local preview: http://localhost:5198 (`2.0.0-test-rc97-review1.336b0144`).
This is an isolated, initially empty workspace. Add your provider key in Model Integration. Existing RC96 and on-prem environments are unchanged. Images have not been built.

## Latest regression retest

- [ ] **R1 — BYOK while creating an agent** (`reviewReason: external-environment`): Refresh the browser, open Create with AI, save your new-agent default in BYOK, and return to the wizard. The default should appear without reopening the wizard and the missing-model warning should clear.
- [ ] **R2 — AI Editor generation** (`reviewReason: external-environment`): Enter a description, open AI Editor, expand it, then Save & Generate. Confirm files are generated and provisioning uses your selected model. Existing draft/key/workspace data was retained during the preview refresh.

## Human acceptance

- [ ] **A1 — Basic agent flow** (`reviewReason: external-environment`): Configure your provider and default model, create an agent, chat, follow up, and reload. Confirm the selected model and conversation remain correct.
- [ ] **A2 — Workspace counts** (`reviewReason: external-environment`): Create a second workspace and agents; switch workspaces, archive/delete an agent, and reload. Confirm each workspace's dropdown count matches its active roster. Especially repeat on the environment that previously showed zero.
- [ ] **A3 — Budgets** (`reviewReason: external-environment`): Create a workspace with a budget; reopen settings and reload. Change only its name and confirm the budget remains unchanged. Check actual spending behavior with your provider; metering and enforcement are not claimed fixed by the settings changes.
- [ ] **A4 — Organization template** (`reviewReason: external-environment`): Apply a small team template, inspect its agents/groups/workflows, and run a workflow. If apply fails, confirm it identifies the problem rather than claiming success. Report the template and exact error.
- [ ] **A5 — Groups and communities** (`reviewReason: human-judgment`): Create with AI, inspect members, search/add/remove members, cancel without saving, then save and reload. Check readable names and keyboard/mobile usability.
- [ ] **A6 — Workflows** (`reviewReason: external-environment`): Generate with AI using an explicit agent mention, review its owner/targets/content, save, run, and inspect the outcome. Verify your basic workflow and team creation flows carried forward from RC96.
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
