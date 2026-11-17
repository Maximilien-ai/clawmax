# RC98 acceptance — November 16

**Status: preparation; do not test or install RC98 yet.** Stable remains v1.9.9.
Dashboard will add the final immutable source, public/private image digests, CI
links and preview address after validation. The old localhost:5182 preview is
`2.0.0-dev.e2cd7796` and is not RC98.

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
- [ ] Merge #434 then #435 after current-head required CI; freeze source.
- [ ] Validate the focused RC98 Review catalog and final release checkpoint.
- [ ] Align ignored local version to `2.0.0-test-rc98`, restart and verify visible
  and `/api/system` identity while preserving the preview's private state.
- [ ] Publish public Test Container Image from the candidate ref; validate both
  architectures and immutable identity. Last three runs took 66–69 minutes.
- [ ] Publish matching Private ClawMax Plugins Image with the same exact tag;
  validate package privacy, discovery, restart persistence and both architectures.
  Last combined run took about 13 minutes. Record failures or reruns explicitly.
- [ ] Add exact image digests, CI links and any remaining limitations here.

## Retained limits

Strict frontend typing is not clean: the dependency candidate has 289 diagnostics
versus 290 on its baseline, with no new diagnostic identities. Security regression
checks do not dispose of the historical scan baseline. #418 tracing, #419 offline
consent, #420 legacy recovery and #426 PDF task lists remain tracked. Known UI
reports #370/#371 remain open. Contributor features #192/#228/#229/#292 are not
claimed included. No fleet deployment or stable promotion is authorized by an
image build. See [progress and issue closeout](RC98_PROGRESS_2026-11-16.md).
