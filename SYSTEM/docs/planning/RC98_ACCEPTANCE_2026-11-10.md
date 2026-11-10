# RC98 acceptance — November 10

Dashboard owner checklist. RC98 has not been cut. This source includes merged
PRs #385, #386, #349, #347 and #341. The seven document/workflow/budget feedback
fixes already accepted by the owner do not need another manual check.

## Your two checks

Open **http://localhost:5180** and refresh. Expected version:
**`2.0.0-dev.ffa172c0`**. Select workspace **RC98 Acceptance** if needed.
The disposable fixtures contain two agents and the `acceptance-desk` group.

- [ ] **#347 — Manage Members feels usable with the keyboard.** Open
  Communications, choose Grid view if needed, then click the member count on
  `acceptance-desk`. Tab/Shift+Tab should stay inside Manage Members. Escape
  should close it and return focus to the member-count button.
  `reviewReason: human-judgment`
- [ ] **#341 — editing from Details feels clear and preserves context.** In
  Agents, open **Acceptance Inspector** → Details → **Edit agent config** (the
  pencil in the Details header). Add a harmless note to **SOUL.md**, Save and
  reopen Edit. Confirm the note remains and Details stayed open after saving.
  `reviewReason: human-judgment`

Reply **`accept #347/#341`**, or name the failing step. No provider keys,
agent execution, workflow runs, repeated budget checks or manual failure
injection are needed. #349 secret protection is engineering-verified with
synthetic credentials; do not enter real credentials to demonstrate it.

## Engineering evidence — completed

- [x] User merged #386 (`b3802461`), #349 (`a99c063e`), #347 (`3b41e708`) and
  #341 (`ffa172c0`). Local main is at the complete merged source.
- [x] Full local integration, validation and coverage on exact source
  **`ffa172c0b0aaf887f2625c1d53f21b953dfdda32`**: **563 passed, zero failed**.
  Statements/lines **83.70%**, branches **81.41%**, functions **92.02%**.
  Observed duration about **11 minutes**; live chat/workflow execution passed.
  Log: `/private/tmp/clawmax-rc98-combined-ffa172c0.log`.
- [x] Required suite includes eight workflow-secret persistence cases. The
  headline total counts suite/API checks, not individual nested test cases.
- [x] Desktop/mobile membership browser checks passed on the supplied build:
  Escape/Cancel discard, Tab wraps, focus returns and Save survives reload for
  both groups and communities.
- [x] Desktop/mobile Details browser checks passed on the supplied build:
  pinned/unpinned editor, focus, Escape/Cancel, card-menu entry, successful Save
  and preserved Details scroll. Fixture now uses the searchable model picker.
- [x] Real disposable workspace: membership keyboard check passed; editing
  Acceptance Inspector's SOUL saved to the server and survived reload/reopen.
  The test edit was restored afterward. No agent turn was executed in this dev.
- [x] Dev uses the exact tested source, with retained isolated data. Budgeting
  uses a synthetic key and intercepted Opik trace transport. Real operator
  provider keys were not copied into this acceptance dev.
- [x] Combined `npm run build` passed on `ffa172c0`; log:
  `/private/tmp/clawmax-combined-build-ffa172c0.log`.

Dev restart on this machine:
`node /private/tmp/clawmax-budget-acceptance-dev.mjs`.
Its data remains under
`/private/var/folders/nv/8pltgq7960988zh0m43w7vf80000gn/T/clawmax-local-dev-bq7ZPP`.
These local helper commands require this machine; the Markdown checklist can
be read independently on GitHub.

## Remaining engineering work before RC98 readiness

- [ ] Record the strict frontend TypeScript baseline and its follow-up: main and #341
  each had 291 diagnostics, with no added diagnostic patterns. The passing
  shell suite checks server TypeScript. Repeat the comparison for any new
  candidate changes and do not describe strict frontend typing as green.
- [ ] Resolve the final-build mobile workflow-navigation rerun; earlier preview
  mobile and final desktop preservation checks passed. This remains an
  engineering follow-up, not a repeat owner acceptance item for #375.
- [ ] Add the explicit late budget-read cancellation/stale-response regression
  carried from the previous engineering queue.
- [ ] Reproduce the group-message isolation report (#404), prioritize any
  confirmed boundary failure, and assess remaining stability/security findings
  against current source. An issue link alone does not establish a fix.
- [ ] Confirm current candidate remote CI/security evidence; refresh active
  release docs and archive superseded plans before promotion. Keep unresolved
  installed-instance/provider checks with their owning teams.
- [ ] Refresh all-feedback intake for later arrivals and verify pending email
  delivery. Previous audit and accepted-fix receipts are in the November 8
  record; do not infer today's inventory from that snapshot.
- [ ] For the actual RC98 candidate, align local version to
  `2.0.0-test-rc98`, restart, and verify UI plus `/api/system`.
- [ ] Dispatch public Test Container Image from the approved candidate, then
  the matching private combined image with the same public base/private tag.
  Record both CI links; verify amd64/arm64 builds, registry smoke, packaged
  identity, plugin discovery, restart persistence and the public/private source
  boundary. Diagnose and rerun failed smoke checks rather than marking them green.

These engineering items remain separate from the two human usability checks.
The acceptance-documentation branch adds only evidence/checklists to tested
main; it does not publish a release image or change the running fleet.

## History

[November 8 evidence and accepted feedback](RC98_ACCEPTANCE_2026-11-08.md)
retains the earlier 562-check run, owner acceptance for #351/#355/#367/#375/
#376/#377/#378, central report reconciliation and notification receipts.
The full test command remains:

```sh
env -u OPENCLAW_BIN DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

Run against an identified committed source, keep it unchanged during the run,
and retain the final Passed/Failed summary and coverage evidence.
