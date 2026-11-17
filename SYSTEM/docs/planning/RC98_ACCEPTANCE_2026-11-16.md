# RC98 acceptance — November 16

**Local source preview ready; image acceptance is pending.** Stable remains v1.9.9.
Frozen source: `v2.0.0-test-rc98` at
`d51aa681ebbfe6dcf14758914486b492ac91ade9`. Open **http://localhost:5182** for the
preserved local preview, version **2.0.0-test-rc98**. Its API and visible desktop
version, phone rendering and Builder interactions have been verified.

[Public image build](https://github.com/Maximilien-ai/clawmax/actions/runs/44016642306)
is running from the exact candidate tag. The matching private image follows only
if public validation succeeds. Do not treat either image as ready yet. The local
source preview can be used for task-quality acceptance; installed image acceptance
waits for the exact public/private validation and digests below.

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

Dependency audit follow-up [#436](https://github.com/Maximilien-ai/clawmax/issues/436)
tracks the 10 Moderate advisories (zero High/Critical) with Dashboard ownership and
a before-stable-2.0 deadline. Source-security baseline disposition is independent.
