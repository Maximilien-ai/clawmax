# RC98 acceptance — November 10

Dashboard owner checklist. RC98 has not been cut. This source includes merged
PRs #385, #386, #349, #347 and #341. The seven document/workflow/budget feedback
fixes already accepted by the owner do not need another manual check.

## Owner acceptance and remaining visual check

- [x] **#347 — Manage Members keyboard behavior accepted November 10.**
  Owner accepted Tab/Shift+Tab containment, Escape and focus return, with the
  dark selected-row contrast reported as a follow-up.
- [x] **#341 — Details → Edit agent config accepted November 10.**
  Owner accepted the editing flow and preservation of Details context.

Open **http://localhost:5180**, refresh and select **RC98 Acceptance**.
Expected version: **`2.0.0-dev.81fa8579`**. The isolated workspace and any
owner notes are retained.

- [ ] **Dark-mode appearance follow-up in PR #340.** In Communications →
  `acceptance-desk`, open the member count. Confirm the selected agent name
  and ID are readable, including while hovering. Switch to light mode once
  and confirm the selection still looks clear. No need to repeat Save or the
  previously accepted keyboard/config checks.
  `reviewReason: human-judgment`

Reply **`accept dark mode`**, or name the unreadable control. The same defect
was corrected in WhatsApp group/community sync rows, document validation
messages, and matching popup hover controls. Those checks are engineering-owned;
no WhatsApp account or real credentials are needed for acceptance.

## Engineering evidence — completed

- [x] PR #340 refreshed from merged main, with the contrast fix
  `c7ae85a8` and grid selection/persistence regression `81fa8579`.
  The full **563/563** result below is for `ffa172c0`; these follow-ups have
  focused validation and must not be described as a new full-suite run.
- [x] Source audit covered **44 dialog/pop-up files**. Runtime appearance audit
  passed **32 theme/viewport scenarios** using production dialog components,
  document-validation errors and production popup hover styles. It covers
  light/dark at 1440px and 390px; this does not claim every dialog state was
  exercised at runtime.
- [x] Membership regression passed **8 theme/viewport/channel scenarios**:
  selected name/ID contrast at least 4.5:1 at rest and on hover, keyboard
  containment, Cancel/Escape, focus return and Save/reload persistence.
- [x] PR #340 grid regression passed mouse, keyboard, touch, saved membership,
  separation from chat, and Select-mode select/deselect behavior.
- [x] Production build passed on `81fa8579`; log:
  `/private/tmp/clawmax-dialog-build-81fa8579.log`.
- [x] Server TypeScript, focused ESLint, disabled-button theme audit and mobile
  dialog source audit passed. Screenshots were reviewed at desktop/phone widths.
  Artifacts: `/private/tmp/clawmax-dark-dialog-audit/`,
  `/private/tmp/clawmax-dark-members/`, `/private/tmp/clawmax-dark-grid-members/`.

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
- [x] Acceptance dev preserves isolated data. Budgeting
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
