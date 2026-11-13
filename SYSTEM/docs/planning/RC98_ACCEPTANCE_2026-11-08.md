# November 8 acceptance and RC98 plan

Historical checkpoint: the [November 10 checklist](RC98_ACCEPTANCE_2026-11-10.md)
is the current owner queue and combined-build evidence. Criteria, results and
notes below are retained as history.

Owner: Dashboard. Times are America/New_York. RC98 has **not** been cut.
This is the current checklist; check items independently and add a short failure
note beside any unchecked item. A checked acceptance box records owner judgment,
not a deployment or an email delivery.

## Quick status

- [x] Owner accepted #351/#355: safe document creation and retained edit drafts.
- [x] Owner accepted #367/#375: workflow dependency/type and output preservation.
- [x] User merged their source in [PR #385](https://github.com/Maximilien-ai/clawmax/pull/385), main `ed02d56b`.
- [x] Morning budget batch #376/#377/#378: verified and **owner accepted** with `accept #376/#377/#378 merge and give me next batch` on November 8. Merge/notification receipts are recorded separately.
- [ ] Evening batch: proposed #349, #347, #341; include only after engineering checks and required review.
- [ ] RC98: conditional on the engineering gates below; no commitment to cut tonight if they fail.

Latest local result: Dashboard reran the owner's exact integration/validation/
coverage command on **`5e27326932cb34bef5976b7a2a9320b3a9f45d33`**:
**562/562 checks passed, zero failures**, including live agent/workflow execution.
Coverage: statements/lines **83.54%**, branches **81.31%**, functions **91.93%**.
Observed duration: about **10.2 minutes**. Log:
`/private/tmp/clawmax-rc98-full-rerun-5e273269.log`.

Prior result retained: owner ran source `50ca52b7`: **560/561 checks passed**;
live agent/workflow integration passed. Coverage: statements/lines 83.52%,
branches 81.30%, functions 91.93%. The one failure was a Dashboard env test
reading the operator's local system key. `96292200` isolates cold-start
configuration in synthetic fixtures (35/35 cases pass), restores that suite to
required CI, and prints failure diagnostics. `1f1f46a7` adds a distinct budget
loading check: 12 parse/save cases plus 19 load cases pass. Both changes were
included in the successful full rerun above. Later documentation commits do not
change the tested product or tests.

## Run the full local suite before owner acceptance

The requested checkout is `/Users/maximilien/github/Maximilien-ai/clawmax-codex`,
branch **`fix/workspace-budget-persistence`**. It includes merged main `ed02d56b`
(#385 and #346), both budget implementation commits and this checklist. The
evening PRs #349/#347/#341 are not included. No branch named
`/work/budget/assistance` is checked out in this repository.

From Terminal:

```sh
cd /Users/maximilien/github/Maximilien-ai/clawmax-codex
git switch fix/workspace-budget-persistence
git status --short --branch
git rev-parse HEAD

env -u OPENCLAW_BIN \
  DASHBOARD_PORT=3002 \
  DASHBOARD_CLIENT_PORT=5176 \
  DASHBOARD_APP_URL=http://localhost:5176 \
  ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

That test command is correct. Ports 3002 and 5176 were free during preparation.
`env -u OPENCLAW_BIN` lets the wrapper select pinned OpenClaw 2026.9.7; integration
mode creates a dedicated Gateway, workspace and registry. It tests the current
checkout and stops its own processes afterward. The isolated acceptance dev on
5180/3007 is separate. Live integration cases use the configured provider keys;
the synthetic budget key belongs only to the 5180 acceptance environment.

Allow about **40 minutes** based on prior full CI runs; local duration varies.
Leave the source checkout unchanged during the run and do not launch a second
full suite on these ports. Record the starting SHA, final Passed/Failed summary,
exit status, coverage summary and any failure log paths. Coverage artifacts are
in `SYSTEM/dashboard/coverage/`. Fix any failed gates before owner acceptance.

This wrapper's TypeScript stage is the **server** check. Opt-in browser scripts
and strict frontend TypeScript are separate: budget browser checks have passed,
but the strict frontend baseline of 291 errors below remains unresolved. A green
wrapper run must not be described as every possible check passing.

The final total counts top-level suite/API checks, not every case/assertion.
For example, the 83-case workflow library suite contributes one check. Expanded
tests within an existing suite do not increase that total. The new standalone
budget-loading suite adds one: expect **562 checks** under the same runtime
conditions as the owner's 561-check run. Suite logs now show actual budget case
counts instead of the stale “8 assertions” label. Browser regressions remain
separate from this shell-suite total.

- [x] Owner ran the command on `50ca52b7`; sole env-test failure fixed.
- [x] Dashboard reran the same full command on `5e273269`: 562/562 passed;
  reviewed coverage and live integration. No repeat full run is needed solely
  for this test-fixture fix before the short owner checks below.

## Morning: owner checklist (about 5–10 minutes after the full suite passes)

Dev: **http://localhost:5180/templates**, version **`2.0.0-dev.5e273269`**
(source `5e27326932cb34bef5976b7a2a9320b3a9f45d33`). Reload the page before
testing. On mobile, open the menu to inspect the version/its title. The previous
`226a33d9` build is superseded for this batch. Budget controls use a synthetic
key and intercepted Opik trace transport in this isolated acceptance environment;
no real Opik account is used. This is a development build, not RC98.
Use a disposable workspace. Zero means **no positive spending cap**, not a
zero-dollar allowance. Failure injection and duplicate-creation detection are
engineering checks; you do not need to cause server failures manually.

- [x] **#376 — zero survives creation:** workspace menu → Create New Workspace;
  use a unique name, budget `0`, and choose enforcement. Create, then reopen its
  Edit Workspace dialog. Budget is still `0`; the no-cap wording is clear.
- [x] **#377 — editing metadata preserves budget:** in that workspace set budget
  `42`, turn enforcement off, save and reopen. Rename it and change its color
  without editing the budget. Save, reload, reopen: `42` and enforcement off
  are retained along with the new name/color.
- [x] **#378 — creation feels complete:** create a second disposable workspace
  with budget `123`. Open Edit Workspace: it shows `123`. There is one workspace
  entry with that name and no misleading success or missing configuration.
- [x] **Dialog usability:** at a narrow window or on a phone, inspect Create
  and Edit Workspace. Inputs can be reached by scrolling and the footer actions
  stay reachable. Wording/errors make the next action clear.

Reply `accept #376/#377/#378` (or individual numbers). For a failure, give the
issue number, step, expected/observed result and build version. No need to repeat
the four already accepted document/workflow checks.

## Evening: proposed owner checklist (not in the morning build)

This is a soft plan, not ready work. Refresh the final included list and dev
version before the evening session. Existing PRs remain unmerged and require
review; no new PRs are planned for this batch.

- [ ] **#347 — membership dialog usability:** open Manage Members on a disposable
  group/community; Tab/Shift+Tab stay in the dialog, Escape closes it and focus
  returns to its opener. Owner judges whether this feels usable.
- [ ] **#341 — edit agent configuration from Details:** open a disposable agent's
  Details panel, use Edit, change a harmless description, save and reopen.
  The edit entry point and updated details are clear.
- [ ] **Optional external-provider check:** only if a runtime-impacting change is
  included, run one disposable agent and one manual workflow with the provider
  you intend to use. Check useful output, visible progress/history and actionable
  failures. Dashboard will supply the exact scenario before asking for this.

[#349](https://github.com/Maximilien-ai/clawmax/pull/349) workflow-secret
redaction is engineering-owned acceptance: synthetic secrets must be absent
from stored run records without breaking execution. No real credentials should
be entered for a human demonstration. Proposed merge/review order is
**#349 → #347 → #341** (latest rebased CI test checks passed November 7).
Pause/rebase and rerun checks whenever an earlier merge changes a later PR's
files. [#242](https://github.com/Maximilien-ai/clawmax/pull/242) score cap is on
hold: its latest rebased full CI failed despite the focused unit pass. Diagnose
before adding it to tonight's acceptance.

## Engineering gates — Dashboard owns these, not the owner queue

- [x] #376/#378: browser tests cover zero, normal creation, overwrite, disabled
  budget feature, HTTP/transport failure, retained inputs, truthful partial
  success, retry without duplicate creation, and reopening after partial close.
- [x] #377: failed/malformed budget reads cannot overwrite saved settings;
  metadata-only saves issue no budget write; retry loads the saved value;
  failed writes preserve edits; successful changes persist. Snapshot updates also
  prevent a completed budget write from repeating after a metadata-save failure.
- [ ] Add an explicit late-response/cancel regression; implementation aborts
  and ignores stale loads, but the current browser suite does not exercise this race.
- [x] Desktop/mobile visual audit; server TypeScript, lint, budget client tests,
  8 server budget tests and 8 mobile-dialog audit assertions pass. Build passes.
- [ ] **Strict frontend TypeScript baseline:** current main and budget branch
  each report 291 diagnostics with identical diagnostic lines. No new diagnostic
  lines were introduced. This is an unresolved engineering gate, not a green
  frontend typecheck; resolve the baseline before declaring all type gates green.
- [x] Refresh committed local dev; verify visible version and `/api/system`;
  repeat final browser checks on the exact supplied build.
- [ ] Resolve the prior final-build mobile workflow-navigation timeout (#375);
  preview checks and desktop passed, but the final mobile rerun is still owed.
- [ ] Review #349/#347/#341 against current main and complete applicable tests.
  Latest observed full test results are green; required GitHub review is pending.
- [ ] Investigate #242's CI failure. Keep #298/#384 (also failing CI), unresolved
  chat/runtime/export changes and broad dependency upgrades outside RC98 unless
  a focused stability need justifies inclusion and all gates pass.
- [x] Commit/push the morning batch and test fixes. Full local integration,
  validation and coverage pass on `5e273269` (562/562, log above); the user's
  exact command was used. No new PRs created or merged.
- [ ] After any additional evening product changes, rerun required gates on the
  final RC98 candidate, including restart persistence and real workflow evidence;
  record exact source and remote CI links. This morning's pass does not validate
  changes added later.
- [ ] Audit active release docs/version identities; set local ignored
  `CLAWMAX_VERSION=2.0.0-test-rc98`, restart and verify UI plus API.
- [ ] Dispatch public Test Container Image from the approved candidate; then the
  private combined image with the same base/image tag. Record both CI links.
- [ ] Verify amd64/arm64 builds, registry smoke tests, packaged identity, plugin
  discovery, restart persistence and public/private source boundary. Failed smoke
  tests stay unresolved until rerun/diagnosed; a built image alone is insufficient.
- [ ] Human/external acceptance above complete for the actual included scope;
  no unresolved release-blocking regression. Only then call RC98 ready to cut.

## All feedback coverage and replies

Scope confirmed by the owner: **all feedback in the system**, with no event/date
filter. November 8 authenticated fetch included all pages and archive views:
**73 reports, 72 open and one closed** before this session's actions. Ownership
metadata: 58 Dashboard, 8 Web, 7 Unassigned. These are reports, not distinct bugs.
Dashboard coordinates Web/CLI-owned work through handoffs rather than claiming
their implementation/deployment as completed here. Reports may contain several
issues and require complete issue-link sets.

- [x] Management login repaired by owner; authenticated all-page fetch succeeds.
- [x] Fetch all current reports and archive views, without date/event filters;
  baseline counts above. Keep participant identities/descriptions private.
- [ ] Compare each current report and its reply history with existing open and
  closed GitHub issues, source fixes and evidence; check for late arrivals again
  before claiming complete coverage. Record issues, duplicates and positives separately.
- [ ] Split each multi-issue report into linked issue dispositions without
  dropping existing links. Each issue needs owner, reproduction/current-source
  result, fix/test evidence, acceptance and release inclusion or a concrete
  remaining action. Link duplicates to their shared fix.
- [ ] Prioritize stability/security/persistence first, including investigating
  the reported group-message isolation problem; do not claim it is fixed yet.
- [ ] For each report, prepare one reply covering **every** issue raised: fixed,
  duplicate, unreproduced (request precise missing evidence), or still planned.
  Do not close a whole report because only one of its issues is resolved.
  Already-fixed reports can close with evidence; duplicate reports can close
  with the canonical issue/report link while unresolved underlying work remains
  tracked. Explain “duplicate” separately from “fixed.” Positive acknowledgements
  need no fabricated engineering issue.
- [ ] Thank every submitter, including people who are not current customers.
  For verified fixes say they are addressed in a **future version of ClawMax**;
  do not imply a live deployment. Record actual delivery separately from drafts.
- [x] Central feedback for #351/#355/#367/#375 closed as addressed after reading
  existing conversation history. Four resolution replies saved with explicit
  thanks and future-version wording; email notification receipts are **pending**
  in the service's digest queue. This is not proof of email delivery.
- [ ] Verify delivery receipts for those four queued notifications.
- [x] Final all-feedback reconciliation: **73 total, 16 closed, 57 open**;
  15 closures in this pass (four accepted Dashboard fixes, five positives,
  one already-supported input-resize request, three duplicates, two verified
  Web-owned fixes). The four corresponding Dashboard GitHub issues are closed.
- [x] Created 35 scoped issues for 26 previously unlinked reports: Dashboard
  #387–416 and Web/intake #37–41. Reused #243 for duplicate score reports.
  Authenticated final audit: **zero open reports without issue links, zero
  without replies, zero missing expected multi-topic links**, and no further pages.
  These are tracked future fixes/enhancements, not implementations added to RC98.
- [x] Retried the one notification request interrupted by throttling; it is
  queued. Fresh #351 receipt confirms its resolution email was sent at
  2026-11-08T14:05:17Z. Recent notifications remain asynchronous/pending.
- [ ] Web/CLI follow-up: [#42](https://github.com/Maximilien-ai/clawmax-ai/issues/42)
  tracks concurrent keychain refresh failures and OAuth throttling during bulk
  feedback work. Complete remaining delivery verification; do not resend saved
  replies blindly or confuse queued notifications with delivered emails.
- [ ] After each batch, update report/issue links, acceptance, release status and
  reply-delivery evidence. Close only the resolved scope and retain remaining
  issues in the backlog. Recheck for late arrivals before final wrap-up.

Suggested fixed-issue reply: “Thank you for your feedback about [behavior]. We
have fixed [specific outcome], and it will be included in a future version of
ClawMax. [Status/next step for each additional issue in your report.]”

## Session record

| Round | Exact dev version / source | Owner results | Engineering evidence | Remaining items |
|---|---|---|---|---|
| Prior batch | `2.0.0-dev.226a33d9`; merged #385 | #351/#355/#367/#375 accepted | [Backlog](../BACKLOG.md) | final mobile rerun, central replies |
| November 8 AM | `2.0.0-dev.5e273269` | Pending | Same budget product code as verified browser/persistence build; full local command 562/562 passed; env 35 cases, budget 12 parse/save + 19 load cases | owner #376/#377/#378, strict frontend baseline, remaining release gates |
| November 8 PM | Pending; proposed scope above | Pending | Existing PR CI checked; review still required | finalize scope before session |

Update this file as gates pass. A checked box may be accompanied by date, verifier,
build and evidence so the checklist remains useful away from this machine.

Restart this specific budget environment with
`node /private/tmp/clawmax-budget-acceptance-dev.mjs`. Its workspace data is retained
under `/private/var/folders/nv/8pltgq7960988zh0m43w7vf80000gn/T/clawmax-local-dev-bq7ZPP`.
The acceptance launcher and network intercept are local helpers; this command is
available on this development machine only. A different machine needs its own
local setup. Current isolated fixture: `AM budget acceptance … renamed`, budget
42 with enforcement off, created during real persistence verification. No
workflow or agent was executed by the budget checks.
