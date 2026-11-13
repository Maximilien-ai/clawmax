# Archived RC98 prompt-readiness acceptance — November 12

[PR #242](https://github.com/Maximilien-ai/clawmax/pull/242) merged as
`420e35bc7fb1d979c0f421c3615ef4a06671ea50`; #243 is closed. Both the scoring
weighting and thin answer/prompt dividers are owner-accepted. No reviewer checks
remain for this batch. Stable remains v1.9.9; RC98 has not been cut.

Current reviewer queue and release gates: [chat acceptance #227](RC98_CHAT_ACCEPTANCE_2026-11-12.md).
The source identities, preview URLs and intermediate CI statuses below are
historical; use the current checklist for the running preview.

## Archived resize acceptance

- [x] **Resize feels useful:** owner accepted both thin answer/prompt dividers
  with “accept resize.” `reviewReason: human-judgment`
  [Acceptance](https://github.com/Maximilien-ai/clawmax/issues/243#issuecomment-6831081937).
- [x] Final head `e9df7c42` [CI passed](https://github.com/Maximilien-ai/clawmax/actions/runs/43270326285)
  before merge. [Merge receipt](https://github.com/Maximilien-ai/clawmax/issues/243#issuecomment-6838306279).

## Archived scoring acceptance

Owner accepted the weighting November 12 with “It's good.” [Receipt](https://github.com/Maximilien-ai/clawmax/issues/243#issuecomment-6829263864). No repeat scoring acceptance is required.


- [x] **Approve the weighting:** domain detail contributes **15 points**, so the seven categories total **100**. Goal 20, Context 15, Inputs 10, Output 15, Constraints 15 and Success 10 stay unchanged. Ready/Excellent thresholds remain 80/90. `reviewReason: human-judgment`

The arithmetic, score ceiling, live updates and advisory behavior have already been verified; no need to repeat those engineering checks.

Optional visual reference: **http://localhost:5180/builder**, workspace **RC98 Prompt Readiness Acceptance**, version **`2.0.0-dev.8e22489d`**. Click **Open Editor** and enter a prompt to inspect its category breakdown. Generation is not required. The isolated preview has no copied provider keys and retains earlier acceptance workspaces. Its synthetic agent only avoids first-run onboarding.

## Resize follow-up evidence

Historical follow-up source: `8e22489d`. Both handles are now thin dividers: a 1px line with a 4px center grip in 12px of layout height, with an expanded invisible hit area. The labeled bar and visible instruction paragraph have been removed to save space. One divider below the conversation resizes the answer area; one below the textarea resizes the prompt independently. Default sizing is preserved. Both use the shared `VerticalResizeHandle` component with captured mouse/touch dragging, keyboard arrows, Home reset, cancellation cleanup, minimum height and viewport-relative maximum. Answer minimum is 128px; prompt minimum is 88px. Size remains local to the mounted view.

Four light/dark × desktop/phone browser runs pass independent answer growth/shrink, long-answer scrolling, prompt draft retention, thin layout height, keyboard reset, actual touch and cancellation, preset controls and reachable actions. API writes are intercepted. Focused layout suites, server types, lint and build pass; strict frontend diagnostic patterns retain the existing baseline. Artifacts/log: `/private/tmp/clawmax-builder-thin-browser/`, `/private/tmp/clawmax-builder-thin-browser.log`. Full 571-check/CodeQL evidence remains on the earlier identified scoring source; no full-suite/security rerun is claimed for these UI follow-ups.

### Archived handle iterations

Visible-handle follow-up source: `3cb9f0710c1e2dfd690faba50ab36687146adffa`. The owner could not discover the native corner grip, so a blue Resize bar with up/down chevrons now sits directly below the input. It supports captured mouse/touch dragging, Arrow Up/Down adjustments and Home to restore the current preset. Pointer release/cancellation ends dragging; bounds retain the input minimum and viewport maximum. Four theme/viewport browser runs passed actual handle dragging and keyboard controls, with real touch gestures at phone width. Build, lint, server types and focused layout suites pass; strict frontend diagnostic patterns are unchanged. Artifacts: `/private/tmp/clawmax-builder-handle-browser/`. This supersedes the corner-only interaction below; the earlier criteria/results remain historical evidence. The isolated launcher now aligns its readiness workspace with its .env selection to prevent the earlier timeout shutdown.

Source `c4ee5caf29c0855bfa684df8c29cc747e620525f` adds vertical prompt resizing to this existing PR. Expanded default stays 192px; reduced preset stays 88px. Both presets now allow dragging in either direction, within a viewport-relative maximum. The hint identifies the native resize corner, and the existing button provides keyboard-accessible presets. Resize height is local to the current mounted view; no saved preference is promised.

- [x] Four light/dark × desktop/phone browser runs pass actual mouse drags shorter/taller, unchanged default, keyboard preset reset, retained long drafts, internal scrolling and reachable actions after a synthetic Builder response. All API writes are intercepted; no model calls. Script: `SYSTEM/dashboard/scripts/builder-prompt-resize-browser.test.mjs`. Artifacts/log: `/private/tmp/clawmax-builder-resize-browser/`, `/private/tmp/clawmax-builder-resize-browser.log`.
- [x] Builder layout and three mobile-layout cases, focused lint, server TypeScript and production build pass. Strict frontend diagnostics are byte-identical to the 291-diagnostic scoring baseline.
- [x] Superseded merge gate: final head `e9df7c42` passed CI and merged. Full 571-check suite and CodeQL evidence below belong to `9132ec6d`; the resize follow-up has focused verification. The combined source is covered by the later 574-check #227 run.

## Scoring engineering evidence

- [x] All seven domains total exactly 100: general, agent, skill, template, workflow, plugin and builder. Both partial domain rules award 8/7; empty/rich prompts score 0/100; 80/90 thresholds remain unchanged. **69 assertions** pass.
- [x] **35 integration contracts** and **six scoring-runner cases** pass. The shell runner now requires exit zero and a positive actual assertion count; missing/zero output and failing processes cannot report success from pass-looking text.
- [x] Production AI editor and readiness panel: **28 domain/theme/viewport scenarios** pass at 1440px/390px, light/dark. Live 5→0→100 updates, a bounded full progress bar, reachable actions, nonempty low-score generation and independent empty-input validation passed with no provider/API calls. Browser script: `SYSTEM/dashboard/scripts/prompt-readiness-browser.test.mjs`; artifacts: `/private/tmp/clawmax-242-browser/`.
- [x] Actual isolated Builder preview at desktop/phone: exact API/UI version and workspace, working editor and 100/100 display, no agent turns. Screenshots: `/private/tmp/clawmax-242-preview-{1440,390}.png`; log: `/private/tmp/clawmax-242-live-preview.log`.
- [x] Server TypeScript, focused lint and production build pass. Strict frontend TypeScript retains **291 baseline diagnostics**, with no new normalized patterns against the prior baseline; frontend typing is not claimed green.
- [x] Exact-source full local integration/validation/coverage: **571/571 passed**, zero failures. Coverage: **83.90% statements/lines**, **81.62% branches**, **92.21% functions**. Live agent/workflow tests passed. Log: `/private/tmp/clawmax-242-full-9132ec6d.log`. Command:

  ```sh
  env -u OPENCLAW_BIN DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
  ```

  Expected duration was 11–12 minutes. The headline 571 counts suite-level checks; the scoring suite now reports its actual 69 assertions instead of a fixed 12.

- [x] Same-query local CodeQL: **zero added/removed findings**, **zero findings on changed lines**, successful execution. Official CLI **2.27.4**, JS queries **2.5.0**, standard **89-query** suite; **941/941** JS/TS files extracted. Baseline `21e5bda1` is code-equivalent to merged main `4d3d686a` (only two Markdown files differ). Candidate `9132ec6d` and baseline both have **606 raw results**: 12 critical-rated, 588 high-rated, 6 other. These are baseline scan results requiring reconciliation with existing dispositions, not automatically confirmed or waived vulnerabilities. Dashboard owns reconciliation before RC98 promotion. No complete security audit is claimed.
  Archives contain committed public regular files only; ignored credentials/private plugins are excluded, and the absolute `mandate.schema.json` link is not followed. Evidence: `/private/tmp/clawmax-242-codeql/{create.log,analyze.log,result.sarif,comparison.json}`; baseline `/private/tmp/clawmax-288-codeql/final.sarif`. Reproduce with `codeql database create --language=javascript-typescript --build-mode=none`, then `database analyze` with the pinned `javascript-code-scanning.qls`. Compare `(ruleId, artifact URI, primaryLocationLineHash)` with multiplicities. GitHub default setup skips fork PRs; this local comparison does not label a missing remote CodeQL run green. No security configuration or queries were disabled.
- [x] **Engineering merge gate complete:** final head `e9df7c42` passed [CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43270326285), then #242 merged. Earlier run [43245328324](https://github.com/Maximilien-ai/clawmax/actions/runs/43245328324) was pending at the original checkpoint.

## Completed batches and feedback

- [x] #288 wording accepted November 12; merged as `4d3d686a544f718d650804dffce16e524ec8c859`; #287 closed. [Acceptance](https://github.com/Maximilien-ai/clawmax/pull/288#issuecomment-6825106459), [merge receipt](https://github.com/Maximilien-ai/clawmax/issues/287#issuecomment-6825155649), [final CI passed](https://github.com/Maximilien-ai/clawmax/actions/runs/43129574990). No repeat owner checks.
- [x] #404 accepted, #417 merged and linked Management feedback closed. Thank-you/future-version email requested; delivery remains unconfirmed. Do not send a duplicate notification. Earlier budget, docs, membership, Details and dark-mode fixes remain accepted and merged; their evidence stays in the November 8–11 records.
- [x] #243 closed after #242 merged. Its scoring-only feedback report was resolved and closed; the thank-you/future-version email was verified sent. An already-closed report received no duplicate reply. Multi-topic resize reports remain open for the rest of #413. Source completion does not establish an installed upgrade.

## Remaining RC98 gates

Engineering owns the frontend typing baseline, final-build mobile workflow-navigation rerun, late budget-read cancellation/stale-response regression, current CI/security review, baseline alert disposition, active-document cleanup and fresh all-feedback/email-delivery reconciliation. Installed-instance/provider evidence remains with the owning teams. New feedback without a resolved implementation must retain an existing or new GitHub issue; duplicates may close only with traceable resolution evidence.

Before cutting RC98, rerun the complete suite on the final combined source, align local `CLAWMAX_VERSION=2.0.0-test-rc98`, verify visible/API identity, then dispatch the public Test Container Image workflow followed by the matching private combined image. Verify amd64/arm64 packaging, registry smoke, plugin discovery, restart persistence and source boundaries. No RC image or deployment is claimed by this batch.
