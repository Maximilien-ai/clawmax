# RC98 acceptance — November 10

Historical acceptance/evidence snapshot. The [November 11 checklist](RC98_ACCEPTANCE_2026-11-11.md)
records #404 merged, feedback addressed, and the current scheduler batch. Pending
#404 merge/notification statements below describe their original checkpoint;
they are superseded by that closure receipt. Earlier criteria and results are retained.

Dashboard owner checklist. RC98 has not been cut. This source includes merged
PRs #385, #386, #349, #347, #341 and #340. The seven document/workflow/budget feedback
fixes already accepted by the owner do not need another manual check.

## Owner acceptance — #404 complete (November 11)

Open **http://localhost:5180**, refresh and select **RC98 Isolation Acceptance**.
Expected version: **`2.0.0-dev.c938a49f`**. All messages below are seeded synthetic
fixtures. Your earlier acceptance workspace and notes remain available.

- [x] **Chat navigation feels clear.** In Communications → List view, open
  **Isolation A**, then **Isolation_A**, then go back. The first has **ALPHA ONLY**,
  the second **BETA ONLY**. Judge whether the selected channel and its history
  remain clear while switching. No typing or agent execution is needed.
  `reviewReason: human-judgment`
- [x] **The recovery notice is understandable.** Open **Legacy Review**. Judge
  whether the notice clearly explains that older messages are preserved and
  require owner review before the chat can continue. This is a disposable
  synthetic recovery example; do not try to repair real histories for acceptance.
  `reviewReason: human-judgment`

Owner replied **“LGTM accept 404”** on November 11 after reviewing the expected
synthetic recovery notice. No further owner checks remain for #404. Automated isolation,
reload, delayed-response, recipient and recovery-state checks are engineering
verification, not additional owner tasks. [Recovery guidance](../guides/RECOVER_CHANNEL_HISTORY.md)
explains the operator procedure and rollback limitation.

## Owner acceptance — complete

- [x] **#347 — Manage Members keyboard behavior accepted November 10.**
  Owner accepted Tab/Shift+Tab containment, Escape and focus return, with the
  dark selected-row contrast reported as a follow-up.
- [x] **#341 — Details → Edit agent config accepted November 10.**
  Owner accepted the editing flow and preservation of Details context.

Historical dark-mode acceptance used the retained **RC98 Acceptance** workspace
on `2.0.0-dev.81fa8579`; the current dev identity and owner queue are above.

- [x] **Dark-mode appearance follow-up in PR #340 — accepted November 10.** In Communications →
  `acceptance-desk`, open the member count. Confirm the selected agent name
  and ID are readable, including while hovering. Switch to light mode once
  and confirm the selection still looks clear. No need to repeat Save or the
  previously accepted keyboard/config checks.
  `reviewReason: human-judgment`

Owner replied **“accept dark mode.”** No current manual acceptance checks remain
for #347, #341 or this appearance follow-up. The same defect was corrected in
WhatsApp group/community sync rows, document validation messages and matching
popup hover controls; those checks are engineering-owned. The owner merged
PR #340 on November 10 as `da30720f8b1673092bfcd9b6137b23e335b4151a`.
Its [CI passed](https://github.com/Maximilien-ai/clawmax/actions/runs/42852650501)
in about 23 minutes. Source completion, CI and owner acceptance are recorded;
this does not establish RC98 image or fleet deployment readiness.

## Pending chat PR audit — completed

- [x] **#339 closed as superseded; #333 closed as completed.** Main already
  contains `116db34b5ab1884cf57d6d1dacd875b6893149bf`, which uses the shared
  `ScrollableMarkdownTable` in Agent Chat and Group Chat. The original PR's
  synthetic regression passed all four desktop/phone × modal/slide scenarios
  on dev `81fa8579`: independent table scrolling, no page/conversation overflow,
  visible Close/composer, compact short tables and preserved code scrolling.
- [x] **#343 closed as superseded.** Main already uses **Responses from the
  active runtime**, without promising live token delivery. Confirmed in all
  four browser scenarios above. This resolves wording only; **#225 and #229
  remain separate work for actual incremental streaming**.
- [x] Tested `AgentChatPanel.tsx` and `ScrollableMarkdownTable.tsx` were compared
  by Git blob hash with `origin/main` and matched exactly. No new chat product
  code or merge was necessary. Screenshots reviewed; artifacts:
  `/private/tmp/clawmax-chat-table-current/`. Evidence/replies attached to both
  PRs and #333; these comments do not establish participant email delivery.

**#404 owner acceptance is complete; CodeQL is clear and final CI is pending.** The confirmed
channel-name collision is fixed with durable legacy recovery, recipient/session
isolation and browser state separation. See [exact-source evidence](MESSAGE_ISOLATION_404_2026-11-10.md).
After this reviewed fix, assess scheduler reliability #288 against current
source before implementing further changes.

## PR #417 remote evidence — November 11

[PR #417](https://github.com/Maximilien-ai/clawmax/pull/417) remains open for the
owner to merge after current-head checks pass. The original review head `6bc69e79`
[passed CI tests](https://github.com/Maximilien-ai/clawmax/actions/runs/42938739082)
in about **43 minutes**, but its aggregate security gate reported 14 high alerts.
That original result is historical, not the status of the updated head.

Security changes `50d180bb` and `602347c5` now constrain message paths to one
filename inside the selected store, use constant logging formats, avoid logging
channel prompt/reply text, and iterate validated recipient arrays. The storage
mock was also narrowed to its exact synthetic directory. Storage isolation now
passes **15 scenarios**; routing isolation passes **7 scenarios**, including
array-like malicious recipient payloads. The other directly affected message,
archive, channel and public plugin suites passed. Server TypeScript, focused lint
and production build passed.

On exact product source **`602347c5c4e3a58957aee4b0d2e1ab7c521a529e`**,
[all CodeQL analysis jobs passed](https://github.com/Maximilien-ai/clawmax/actions/runs/43030142713)
and [the aggregate gate passed](https://github.com/Maximilien-ai/clawmax/runs/130555049710).
The authenticated PR-ref alert inventory returned **zero open alerts**.

CSRF alerts [#728](https://github.com/Maximilien-ai/clawmax/security/code-scanning/728)
(production) and [#746](https://github.com/Maximilien-ai/clawmax/security/code-scanning/746)
(the new isolated HTTP fixture) were dismissed as verified false positives, not
silently excluded. The existing origin guard covers `/api` before cookie-auth
routes; real HTTP tests reject forged/null origins, cookie requests without
provenance and spoofed Host/forwarded headers for POST/PUT/PATCH/DELETE, while
trusted Origin/Referer requests remain usable. **133 HTTP assertions** and
**103 security-contract assertions** passed. The [official query](https://github.com/github/codeql/blob/main/javascript/ql/src/Security/CWE-352/MissingCsrfMiddleware.ql)
recognizes token/library patterns rather than this origin guard. Dashboard owns
these regressions; no query was disabled and no broad security-audit claim is made.

The [CI run on product source `602347c5`](https://github.com/Maximilien-ai/clawmax/actions/runs/43030150496)
was in progress when this checkpoint was written. Later documentation-only heads
can trigger fresh checks: wait for the actual PR head, not an older green run.
The final complete local integration/validation/coverage rerun is pending at this
checkpoint; its result will be attached to PR #417 with the exact tested SHA.
No repeat owner acceptance is required for this engineering hardening. The
retained acceptance dev remains on the owner-tested `c938a49f` UI; it is not the
new security-source verification runtime.

## Current #404 engineering evidence — complete

- [x] Exact product source **`c938a49fda2b3e7e4567f6e76a3397223f5f5941`** passed
  **570/570** full integration/validation/coverage checks, zero failures, in
  **11.7 minutes**. Real group/community replies remained isolated.
  Statements/lines **83.83%**, branches **81.48%**, functions **92.11%**.
  Log: `/private/tmp/clawmax-404-full-c938a49f.log`.
- [x] Required regressions include **13 storage** and **7 routing scenarios**;
  five added native integration checks explain the increase from 565 to 570.
  Headline totals count suite/API checks, not each nested assertion.
- [x] Four light/dark × desktop/phone browser runs passed for delayed responses,
  channel/workspace state, draft separation and persistent recovery errors.
  Production List navigation and real isolated-dev history switching passed.
- [x] Production build, server TypeScript and focused lint passed. Strict client
  comparison remains **291 baseline diagnostics**, with no new patterns.
- [x] Dev UI/API identify `2.0.0-dev.c938a49f`; synthetic acceptance data is ready.
  Later documentation-only commits do not change this tested product source.

A future-version status reply was saved for the feedback author; its email is
queued, with delivery unconfirmed. The [receipt](MESSAGE_ISOLATION_404_2026-11-10.md#acceptance-rollout-and-feedback)
keeps the report in progress until the reviewed fix is merged.

## Earlier engineering evidence — completed

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
- [x] Complete the two #404 human judgments (owner accepted November 11).
- [x] Remediate the CodeQL findings and record the verified CSRF false positives;
  analysis and aggregate gates passed on `602347c5`, zero open PR-ref alerts.
- [ ] Pass current-head remote gates and merge
  the isolated fix. Then resolve its linked feedback and record the notification
  receipt. Assess other stability/security findings against the current candidate.
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
The current branch contains the tested #404 implementation plus documentation.
It does not publish a release image or change the running fleet.

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
