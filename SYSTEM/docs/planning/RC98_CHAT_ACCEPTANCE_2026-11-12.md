# Archived RC98 chat acceptance — November 12

Existing [PR #227](https://github.com/Maximilien-ai/clawmax/pull/227) addresses
[#223](https://github.com/Maximilien-ai/clawmax/issues/223), part of #214.
Product/test source: `092498528046d13a1b748f93729a77b0797d4e19`, refreshed from
merged main `420e35bc`. Stable remains v1.9.9; RC98 has not been cut.

Owner accepted #227 November 13; it merged as `9ad021b0` and #223 is closed.
[Acceptance receipt](https://github.com/Maximilien-ai/clawmax/pull/227#issuecomment-6847518580).
No human checks remain. The source/preview identity below is historical; current
work is the [dependency maintenance queue](DEPENDABOT_2026-11-13.md).

## Archived human acceptance

Open **http://localhost:5180/agents**, workspace **RC98 Chat Acceptance**, version
**`2.0.0-dev.09249852`**. Open **Chat Acceptance Inspector**, then Chat.

- [x] **Clear/History wording is clear:** open Clear and read the confirmation,
  then Cancel. Open History, select **Example previous conversation — wording
  only**, open Delete and read the confirmation, then Cancel. Clear should explain
  that the current conversation moves to History and a new context starts; Remove
  should explain that only its History entry is removed and the stored transcript
  is kept. Reply **accept #223** or **accept #227**.
  `reviewReason: human-judgment`

The example is explicitly a wording fixture, so Continue is hidden. No model
calls, provider keys, or repeated functional testing are needed. Earlier acceptance
workspaces remain available. All engineering checks below belong to Dashboard.

## Engineering evidence

- Full local integration, validation and coverage: **574/574 passed, zero failures** on the exact
  product/test source above. Coverage: **83.91% statements/lines, 81.78% branches, 92.32% functions**. Log:
  `/private/tmp/clawmax-227-full-09249852.log`. Expected duration: 12–14 minutes.

  ```sh
  env -u OPENCLAW_BIN DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
  ```

  The headline counts suite/API checks. It grows from 571 to 574 through the new
  history-reconciliation suite, conversation-persistence suite and live lifecycle
  check; nested route/turn cases also expand.
- Real pinned OpenClaw: Clear starts fresh, History retains the exact transcript,
  and Continue restores the original context. The disposable live check uses an
  opaque nonce and three small provider calls, without exposing prompt contents.
- Focused contracts: **14 history cases**, **7 persistence cases**, **88 agent-route
  cases**, **8 turn-registry cases**, **67 execution cases**, and native
  selected-profile, active-branch, compression and read-only tests pass. Coverage
  includes failed atomic persistence, recovery/reopen, stale or queued admissions,
  unsafe stored session IDs, busy actions, mixed native/runtime history and
  runtime-specific continuation.
- Four light/dark × desktop/phone production-component runs pass history
  reconciliation, serialized polling, stale replies/errors after context changes,
  busy controls, visible failures and wrapped archive actions. The actual isolated
  preview also passes desktop/phone dialog and identity checks. Artifacts:
  `/private/tmp/clawmax-227-browser/`,
  `/private/tmp/clawmax-227-preview-{clear,remove}-{1440,390}.png`.
- Server TypeScript, focused lint and production build pass. Strict frontend
  TypeScript retains **290 baseline diagnostics**, with **zero new normalized
  patterns**; frontend typing is not green and remains an engineering follow-up.
- Same-query CodeQL comparison succeeds: **zero added findings**, **47 removed**,
  **zero primary findings on changed lines**. Official CLI **2.27.4**, JavaScript
  queries **2.5.0**, standard **89-query** suite. Main `420e35bc`: **606 raw
  results** (12 critical-rated, 588 high-rated, 6 other); candidate: **559**
  (12 critical-rated, 541 high-rated, 6 other). Compare `(ruleId, artifact URI,
  primaryLocationLineHash)` including multiplicities. Evidence:
  `/private/tmp/clawmax-227-codeql/{base.sarif,09249852.sarif,comparison-09249852.json}`.
  Only committed public regular files are extracted; ignored credentials, private
  plugins and absolute symlink targets are excluded. GitHub default setup skips
  fork PRs; this comparison does not turn a missing remote CodeQL run green. No
  queries or security settings were disabled. Dashboard owns reconciliation of
  retained raw findings with existing dispositions **before RC98 promotion**;
  this is regression evidence, not a complete security audit.
- [x] **Engineering merge gate complete:** final head `5be6371b` passed
  [CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43348900604), then the
  owner merged #227. Product-source evidence above remains on `09249852`.

## Behavior and retained limits

Clear and Reset end the current conversation and select a fresh session. Continue
selects the original session rather than copying a transcript over another one.
Removing History removes its dashboard entry only. Active/queued/cancelling turns
fence context changes; recovered sessions persist privately and survive reopening.
Stale polls cannot restore a previous context or close a newer one.

Selected OpenClaw profiles use their own state root, with no fallback to installed
history. Native/runtime transcript bytes and original session identities remain
intact across Clear/Reset. Claude/Droid adapter tests verify original versus fresh
session IDs; actual external Claude/Droid provider execution is not claimed.
Transcript-only legacy archives stay viewable/downloadable but cannot promise
resumption. A runtime mismatch blocks Continue; no cross-runtime context transfer
is claimed. Runtime stores are not edited directly.

## Completed and next batches

- [x] **#242/#243:** scoring and both thin Builder dividers accepted; #242 merged
  as `420e35bc`; #243 closed. [Acceptance](https://github.com/Maximilien-ai/clawmax/issues/243#issuecomment-6831081937),
  [merge receipt](https://github.com/Maximilien-ai/clawmax/issues/243#issuecomment-6838306279),
  [passed CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43270326285).
  The scoring-only feedback report is closed; its thank-you/future-version email
  was verified sent November 12 local time. Already-closed reports received no
  duplicate reply. [Historical evidence](RC98_ACCEPTANCE_2026-11-12.md).
- [x] **Feedback provenance:** `feedback` applied to **63 confirmed Dashboard
  issues** linked from clawmax.ai intake, preserving other labels. Archive-inclusive
  audit: **73 reports**, **52 open / 21 closed** after the scoring closure; every
  open report has GitHub issue links. The six unlinked reports are already closed.
  Linked issues alone do not establish that every separate topic is addressed.
- [ ] **After #227: eleven existing Dependabot PRs**, tested in compatible batches
  with a fresh review/merge order. Actions: #294/#297/#295; Node #384; Cognee #296;
  grouped packages #298; package majors #300/#301/#299/#303/#302. No blanket merge
  or new PRs. Verify artifact producer/consumer compatibility before choosing order.
- [ ] **Triage all open issues:** snapshot **108 open**, initially **103
  unlabelled**. #223 now has bug/ux/high-priority; provenance labeling is complete
  for the mapped intake issues, but full type/area/priority triage remains open.
- [ ] **Resolve remaining feedback topic by topic**, retaining GitHub issues for
  unresolved topics and replying truthfully with future-version status. #413 is
  only partially addressed by input/answer resizing; its other panels/sidebar and
  multi-topic reports stay open. [Scope receipt](https://github.com/Maximilien-ai/clawmax/issues/413#issuecomment-6840736808).
  Verify delivery and avoid duplicate replies. Keep raw participant details out
  of public documentation.

## RC98 gates

No RC98 readiness, image publication or installed upgrade is claimed. Before a
cut: finish current CI/security dispositions, the frontend typing baseline,
final-build mobile Workflow navigation, late budget-read cancellation regression,
documentation/archive cleanup, all-feedback reconciliation and owning-team
installed/provider evidence. Rerun the complete suite on final combined source,
align local `CLAWMAX_VERSION=2.0.0-test-rc98`, and verify visible/API identity.
Dispatch the public Test Container Image workflow, then the matching private
combined image; require amd64/arm64 packaging, registry smoke, plugin discovery,
restart persistence and public/private source-boundary evidence.
