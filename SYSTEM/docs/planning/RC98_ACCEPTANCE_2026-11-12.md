# RC98 prompt-readiness acceptance — November 12

Existing [PR #242](https://github.com/Maximilien-ai/clawmax/pull/242) fixes [#243](https://github.com/Maximilien-ai/clawmax/issues/243). Product/test source: `9132ec6d19cdeab4eba965a42c5465342314b4e9`, refreshed from merged main `4d3d686a`. Stable remains v1.9.9; RC98 has not been cut.

## Your one check

- [ ] **Approve the weighting:** domain detail contributes **15 points**, so the seven categories total **100**. Goal 20, Context 15, Inputs 10, Output 15, Constraints 15 and Success 10 stay unchanged. Ready/Excellent thresholds remain 80/90. `reviewReason: human-judgment`

Reply **accept #243** (or **accept #242**) if that balance is suitable. The arithmetic, score ceiling, live updates and advisory behavior have already been verified; no need to repeat those engineering checks.

Optional visual reference: **http://localhost:5180/builder**, workspace **RC98 Prompt Readiness Acceptance**, version **`2.0.0-dev.9132ec6d`**. Click **Open Editor** and enter a prompt to inspect its category breakdown. Generation is not required. The isolated preview has no copied provider keys and retains earlier acceptance workspaces. Its synthetic agent only avoids first-run onboarding.

## Engineering evidence

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
- [ ] **Engineering merge gate:** current PR head CI must pass. Product/test run: [43245328324](https://github.com/Maximilien-ai/clawmax/actions/runs/43245328324), pending at documentation time. Any documentation-only head also needs its own run; use the [PR checks](https://github.com/Maximilien-ai/clawmax/pull/242/checks). Comparable CI takes about 43 minutes. Owner acceptance may happen while CI runs; merge afterward.

## Completed batches and feedback

- [x] #288 wording accepted November 12; merged as `4d3d686a544f718d650804dffce16e524ec8c859`; #287 closed. [Acceptance](https://github.com/Maximilien-ai/clawmax/pull/288#issuecomment-6825106459), [merge receipt](https://github.com/Maximilien-ai/clawmax/issues/287#issuecomment-6825155649), [final CI passed](https://github.com/Maximilien-ai/clawmax/actions/runs/43129574990). No repeat owner checks.
- [x] #404 accepted, #417 merged and linked Management feedback closed. Thank-you/future-version email requested; delivery remains unconfirmed. Do not send a duplicate notification. Earlier budget, docs, membership, Details and dark-mode fixes remain accepted and merged; their evidence stays in the November 8–11 records.
- [ ] #243 remains open until #242 merges. Reconcile any linked feedback then, preserving separate unresolved issues and recording the resolution/reporter reply. Source completion does not establish an installed upgrade.

## Remaining RC98 gates

Engineering owns the frontend typing baseline, final-build mobile workflow-navigation rerun, late budget-read cancellation/stale-response regression, current CI/security review, baseline alert disposition, active-document cleanup and fresh all-feedback/email-delivery reconciliation. Installed-instance/provider evidence remains with the owning teams. New feedback without a resolved implementation must retain an existing or new GitHub issue; duplicates may close only with traceable resolution evidence.

Before cutting RC98, rerun the complete suite on the final combined source, align local `CLAWMAX_VERSION=2.0.0-test-rc98`, verify visible/API identity, then dispatch the public Test Container Image workflow followed by the matching private combined image. Verify amd64/arm64 packaging, registry smoke, plugin discovery, restart persistence and source boundaries. No RC image or deployment is claimed by this batch.
