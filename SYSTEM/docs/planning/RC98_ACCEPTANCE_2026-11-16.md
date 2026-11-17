# RC98 acceptance — November 16

**RC98 public and combined private image validation passed. Both GCP mirror workflows passed.** Stable remains v1.9.9; no fleet deployment implied.

Local packaged dev acceptance is ready at **http://localhost:3202**, in a dedicated Podman container `clawmax-rc98-dev-acceptance` and persistent volume `clawmax-rc98-dev-acceptance-data`. Existing instances remain untouched. Set provider credentials through this dev instance's Keys & Secrets; LM Studio on the Mac is reachable from the container using `host.containers.internal`, not container localhost.

## Quick RC97 → RC98 spot checks requested by owner

These are optional repeat spot checks of accepted changes, not a new mandatory Review queue.

- [ ] **Provider switching:** with only LM Studio/OpenAI-compatible configured, Add Agent and AI generation use an available compatible model. Add an OpenAI key: GPT-5.4-mini becomes available/default again; generate successfully.
- [ ] **Chat history:** exchange a memorable fact, Clear and start fresh (no old context), then History → Continue the old conversation (old context returns). Older history is readable when present.
- [ ] **Builder:** resize both prompt and answer vertically using thin handles; edit a prompt and confirm readiness changes without blocking generation.
- [ ] **Dialogs:** in dark mode, selected Manage Members rows remain readable; Escape closes the dialog and keyboard focus stays inside while open.
- [ ] **Saved edits:** edit an agent from its details panel, a document, workflow settings, and a workspace budget; reload and confirm each change remains.
- [ ] **Channels:** send distinct messages in two groups/communities; confirm histories stay separate. Legacy mixed history must show recovery guidance, not combined messages.
- [ ] **Rendering and extensions:** read Markdown/code/table content and open the enabled plugin pages; check readability and useful controls on your usual screen.
- [ ] **Event task and restart:** complete one realistic task, judge its output, restart the dev container, and confirm saved results remain.

Restart this isolated instance with `podman restart --time 30 clawmax-rc98-dev-acceptance`.

## Owner checks (when ready)

- [ ] **Event task quality:** in a disposable workspace, run one representative
  event task using the model/provider you intend to demonstrate. Read the actual
  agents' work and final artifact. Confirm the result and division of work are
  useful; record any unclear or incorrect behavior. `reviewReason: human-judgment`
- [ ] **Event environment:** on the actual event device/installed test instance,
  open the candidate, use its intended network/provider, complete one short task,
  restart through its supported launcher, then reopen the saved result. Record
  the device, image/version and any installation/provider error. Coordinate an
  installed upgrade with the CLI/deployment owner. `reviewReason: external-environment`

Reply **accept RC98 task**, **accept RC98 environment**, or describe the failed
step. Earlier #191/#194, resize, dark-mode and chat-wording acceptances remain
accepted; they are not copied into a new unfinished reviewer queue.

## Dashboard-owned release evidence

- [x] Combined dependency source `575b348d` passes **582/582** local integration,
  validation and coverage checks on verified Node 24.22.3. Caller registry unchanged.
- [x] Lint, server TypeScript, production build, 30 responsive/theme browser checks,
  macOS native runtime tests and Linux amd64/arm64 native checks pass.
- [x] Both #434/#435 merged after green current-head CI through #435 `6bf0dbf9`.
- [x] Focused RC98 Review catalog passes 32 host cases, source contracts and
  four responsive/theme browser cases. Final product checkpoint `33287ab3`
  passes **582/582**, caller registry unchanged.
- [x] Ignored local version is `2.0.0-test-rc98`; preserved preview restarted on
  verified Node 24.22.3. Visible desktop/API identity, mobile rendering and four
  theme/width Builder resize cases pass; no agent turns were started.
- [x] Public and combined private images pass both-architecture validation; corrected lifecycle runs and historical failures are recorded in the progress checklist.
- [x] Public GCP mirror 44096998734 and private GCP mirror 44095101350 passed.
- [x] Local isolated packaged dev at localhost:3202 reports `2.0.0-test-rc98`, persistent stores ready and authenticated gateway ready. Fresh workspace has no agents; configure your provider before task acceptance.
- [x] Exact image digests and CI links are recorded in [the progress checklist](RC98_PROGRESS_2026-11-16.md).

## Retained limits

Strict frontend typing is not clean: the dependency candidate has 289 diagnostics
versus 290 on its baseline, with no new diagnostic identities. Security regression
checks do not dispose of the historical scan baseline. #418 tracing, #419 offline
consent, #420 legacy recovery and #426 PDF task lists remain tracked. Known UI
reports #370/#371 remain open. Contributor features #192/#228/#229/#292 are not
claimed included. No fleet deployment or stable promotion is authorized by an
image build. See [progress and issue closeout](RC98_PROGRESS_2026-11-16.md).

Dependency audit follow-up [#436](https://github.com/Maximilien-ai/clawmax/issues/436)
tracks the 10 Moderate advisories (zero High/Critical) with Dashboard ownership and
a before-stable-2.0 deadline. Source-security baseline disposition is independent.
