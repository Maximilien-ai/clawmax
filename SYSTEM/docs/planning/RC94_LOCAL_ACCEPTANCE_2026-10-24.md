# RC94 local acceptance — October 24, 2026

Status: local-dev acceptance first. On October 26 Maximilien clarified that
Daniyar and Maximilien should validate locally before images are built for
on-prem/cloud testing and official RC94. Exact product source:
`b865da6fa340eae300ff1d1e40236da54efa95f0`. The earlier review-image attempt
was stopped; no combined image was dispatched. Official RC94 remains reserved.
Start with the
[shareable review handoff](RC94_REVIEW_HANDOFF_2026-10-26.md).

October 25 handoff: earlier product/dependency source `04818ac56a58198ed08affa0c580e0a36060ca88`
passes the clean local suite and CI. Latest feedback checkpoint `d092640c` includes
searchable group membership and collapsed model suggestions, with focused
verification below. The working checkout is already on the
integration branch and is available at **http://localhost:5174** (API on 3001).
The displayed `2.0.0-test-rc94` is a local candidate label, not a published tag.

## Source and merge status

- Dashboard integration branch: `integration/rc94-daniyar`.
- Integration PR: [#291](https://github.com/Maximilien-ai/clawmax/pull/291).
- Eighteen of Daniyar's 27 open PRs are combined on this branch, preserving
  their original commits. This is not yet a merge to `main`.
- Merge status: **0 landed on main; 18 combined in #291; nine held**. GitHub
  requires an approving review on #291 (`REVIEW_REQUIRED`); no protection or
  security gate has been bypassed. Daniyar can review the combined result.
- Included: #246, #248, #250, #254, #256, #260, #262, #264, #266, #272,
  #274, #276, #278, #280, #282, #284, #286, #290.
- Additional change: a remembered pin beside X on agent details, Edit Agent
  Config, and chat, in modal and right-side layouts. Outside-click dismissal is
  the default; pinning ignores outside clicks. Escape and X remain available.
- Held for feedback: #219, #227, #228, #229, #252, #258, #268, #270, #288.

## Engineering evidence

These are Dashboard-owned checks, not acceptance tasks for reviewers.

### October 26 review-image candidate

- Model Integration follow-up: `651e2181`, with active coding fixture correction
  `b865da6f`. The model dialog no longer duplicates runtime controls; the top
  Runtime pill retains them. Both default selectors group active choices by
  provider. Unused deprecated models are hidden, including fallback lists and
  automatic recommendations. An existing agent's deprecated selection remains
  visible with a warning; shutdown handling and replacement policy still apply.
  Focused helper/model-fit/BYOK tests, lint, server TypeScript and production
  build pass. Client TypeScript retains the same 291 baseline diagnostics.
  Local/cloud browser tests pass at 1440, 1280, 390 and 320px, including grouped
  choices, save failure, save/reload, runtime preservation, and separate Runtime
  access. The agent-editor regression verifies the existing deprecated choice.
  A14 requests independent human acceptance of the revised UI.

- Latest follow-up `99803424` removes retired OpenAI models automatically at
  known shutdown dates, including discovery/refresh/advanced/warm-cache paths.
  New defaults, saved primary/backup resolution, and built-in AI helpers use
  active replacements. Existing model-policy restrictions still apply. Valid
  selections remain unchanged; newly announced dates require a policy update.
  **347 focused tests**, server TypeScript, lint, production build, and
  desktop/mobile browser regression pass. Client TypeScript adds zero errors
  to the 291-diagnostic baseline. Latest-source
  [CI](https://github.com/Maximilien-ai/clawmax/actions/runs/40345278230) was running
  at handoff. A13 requires real-provider acceptance. The full-suite result below
  belongs to the earlier source and must be rerun before final images.
- Exact source: `1729992e9555002a8d34e91b644ecf9d153b27bb`.
- Full isolated integration/validation/coverage: **547/547 passed, zero failed**.
  Statements/lines 83.18% (60981/73311), branches 80.65% (19566/24259),
  functions 91.81% (2512/2736). The command below was rerun unchanged on this
  exact source. Expected cached duration: 10–20 minutes; observed about 11
  minutes. Local log: `/private/tmp/clawmax-rc94-image-validation.log`.
- Saved panel, group membership/direct-scroll, and AI-creation disclosure
  browser regressions all passed again at desktop/mobile widths. These use
  synthetic API fixtures and do not replace real-provider acceptance.
- `npm run security:audit`: passed with zero High/Critical advisories.
- [Exact-source CI](https://github.com/Maximilien-ai/clawmax/actions/runs/40173948664):
  passed. [CodeQL scan](https://github.com/Maximilien-ai/clawmax/actions/runs/40173946407)
  completed, but its PR gate reports **20 unresolved findings: 2 critical and
  18 high**. The earlier 19-finding result below is historical. Dashboard owns
  disposition before merge/promotion; no alerts were dismissed.
- Local Dashboard was restarted and browser/API version checked. Its local
  label is `2.0.0-test-rc94-review1`; this does not establish a published image.
  Image creation is deferred until local acceptance. Public and combined
  workflows must both pass before a matching pair is reported ready.

### October 25 acceptance-feedback changes

- Corrected the group jump in `d092640c`: the earlier `scrollIntoView` could
  scroll panel ancestors and move its header out of view. The regression
  reproduces that failure. Navigation now scrolls only the existing detail
  body and preserves the original frame, header/footer, and page position.
  Desktop/mobile browser checks, lint and focused tests pass; client TypeScript
  adds zero diagnostics relative to the recorded baseline. A12 awaits user
  retest. Maximilien accepted the AI-creation collapse (A11).

- Follow-up to accepted A9/A10: the card group-count button opens details at
  Groups, scrolling and moving keyboard focus after activity loads. This passes
  the browser regression below a long identity at 1440px and 390px. Source:
  `c29e1d2a`. AI creation now also uses the collapsed suggestion disclosure;
  synthetic generation tests pass at desktop/mobile widths. New user checks
  A11/A12 cover those small additions; A9/A10 remain accepted.

- Maximilien accepted A1 and A2; their original criteria are preserved with
  strikethrough below. Daniyar's independent results remain pending.
- Edit Agent Config now starts with the entire automatic model suggestion
  collapsed. Expanding it does not change the model. Existing auto-selection
  status and recommendation errors remain visible in the disclosure summary.
  Source: `dae63012`; component tests, model-fit integration tests, lint,
  TypeScript and desktop/mobile browser regression passed.
- Agent details and expanded cards now show current group membership with
  remove controls and **Add to group**. The picker lists available groups and
  searches their names, display names, and descriptions. It exposes pending,
  loading, empty, retry and save-failure states. Changes read fresh memberships,
  update groups only, then verify persistence.
- Fixed the membership writer treating `### group` headings as `## section`
  headings. The regression failed before the fix and passed afterward. Source:
  `8f8b79a0` (writer) and `c79f7218` (UI). All 79 agent-route tests pass,
  including persisted add/remove, other-agent/community preservation, invalid
  selections, and write failures. Client helper and 1440px/390px browser tests
  pass, covering search, retry, saving, failed removal, reload persistence,
  externally added memberships, and Escape.
- Latest client TypeScript comparison: the same 291 baseline diagnostics, with
  zero new diagnostics. Server TypeScript, changed-file lint, and focused
  client TypeScript pass.
- **The full-suite/CI results below belong to the earlier recorded source.**
  Full integration/validation/coverage and CI must be rerun on the final
  feedback candidate before RC94 is cut. These are engineering-owned gates;
  A3–A8 and the corrected A12 check are the remaining user acceptance checks.

- Server TypeScript: passed.
- Changed panel code lint and focused TypeScript: passed.
- Panel persistence and Forward-menu focused tests: passed.
- Full client TypeScript: 291 diagnostics on both candidate and untouched
  `origin/main`; normalized diagnostic messages match, with no added errors.
- Clean full isolated integration/validation/coverage at `04818ac5`: **545/545,
  zero failed**. Statements/lines 83.12% (60708/73034), branches 80.66%
  (19485/24156), functions 91.96% (2505/2724). Command:
  `DASHBOARD_PORT=3003 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage`.
  Private local log: `/private/tmp/clawmax-rc94-clean-validation.log`.
  Expected duration recorded before execution: 30–45 minutes including clean
  runtime preparation; subsequent runs reused the prepared runtime.
- Browser interaction and responsive audit: **passed**, using synthetic API
  responses on a separate loopback preview. Config/details/chat default and
  pinned dismissal, remembered choice, modal/right-side chat, Escape/X,
  nested Forward Escape/focus, and 390px controls passed without page errors.
  Builder scrolling, long template-card titles and the top bar were visually
  checked at 1440px, 390px and 320px. This does not establish real model,
  installed-runtime, or restart acceptance.
- Browser regression:
  `SYSTEM/dashboard/scripts/agent-panel-persistence-browser.test.mjs`.
  It accepts `PLAYWRIGHT_MODULE`, `CHROME_BIN`, `TEST_FRONTEND_URL`, and
  `CLAWMAX_BROWSER_ARTIFACT_DIR`; it uses synthetic API responses only.
- The real local Dashboard's `/api/system` and browser-rendered version both
  show `2.0.0-test-rc94`. The local server was restarted with the pinned
  OpenClaw 2026.9.7 CLI after patching dependencies, with gateway bootstrap
  disabled so installed services were left alone.
- [Candidate CI at 04818ac5](https://github.com/Maximilien-ai/clawmax/actions/runs/40121662437):
  **passed**. A later documentation-only checkpoint may have its own pending CI;
  use the recorded source SHA for the implementation evidence.
- [CodeQL analysis](https://github.com/Maximilien-ai/clawmax/actions/runs/40121659695)
  completed, but the PR security gate reports 19 new-to-PR findings: two critical
  and 17 high. This is unresolved; successful scan execution is not clearance.
  Findings concern model-discovery outbound requests and hashing/regex handling,
  plus filesystem paths in skill, workspace-import, and deletion code. Dashboard
  owns disposition before merge/promotion. No alerts have been dismissed.
  The two custom-URL model-discovery fetches and body-based discovery route
  already exist on main; that observation alone does not clear the SSRF findings
  or prove the cloud endpoint policy sufficient. Keep these findings open for
  bounded source review and ask Daniyar to help trace the affected PR paths.
- The six residual RC93 command/path findings remain separately tracked in
  [RC93 triage](RC93_CODEQL_TRIAGE_2026-10-21.md).

### Dependency remediation

The first integration CI stopped at production audit. Reproduced counts were
five production findings (one high, four moderate) across 336 production
dependencies; full graph: eight findings (one high, seven moderate), 593 total
dependencies. Commit `edbbd53f` applies non-major updates to body-parser
1.20.9, Express 4.22.3, fast-uri 3.1.9, ip-address 10.7.4,
postcss-selector-parser 6.1.5, and qs 6.16.1. The high production advisory was
[GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828).

After remediation, `npm run security:audit` passes. `npm audit --omit=dev
--json` reports **zero production findings**. Full `npm audit --json` reports
**three moderate, zero high, zero critical**, comprising the development
Tailwind/PostCSS chain for
[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
Dashboard owns that residual review by November 1, 2026 UTC. The available full
remediation proposes a Tailwind major upgrade; no forced major upgrade or audit
exception was added. These dependency results do not constitute a complete
security audit or resolve CodeQL findings. Focused security-boundary and
agent-route tests (78 route tests), production build, and the subsequent clean
545-check run passed.

## Acceptance for Maximilien and Daniyar

Remaining for Maximilien: **A4, A5, A6, A7, A8, and A13**. The BYOK UI
confirmation accepts A14; A7 still requires real-provider and credential-isolation
evidence. Daniyar records independent results.

Maximilien confirmed A1, A2, A9, A10, and A11 on October 25, and A3/A12/A14 on
October 26. Their criteria remain below with strikethrough. Daniyar's independent results remain pending.

Each reviewer should record their own result on the exact same source revision.
Use disposable agents/workspaces for changes and deletion tests. Record the
source SHA, platform, browser, result, and a short failure description. Never
include provider keys or raw participant conversations in the report.

| ID | reviewReason | Check and expected result |
| --- | --- | --- |
| ~~A1~~ | human-judgment | ~~Open agent details and Edit Agent Config. The pin is visible beside X. Unpinned, an outside click closes the panel. Pinned, it stays open. Inside clicks never close it. X and Escape close it. Reopen/reload and confirm the choice is remembered.~~ **Maximilien: passed, October 25.** |
| ~~A2~~ | human-judgment | ~~Open chat, pin it, switch to its right-side layout, and click outside. It stays open. Unpin and click outside; it closes. Open History/Forward and press Escape: the inner surface closes first. Confirm X closes only the chat when details are underneath.~~ **Maximilien: passed, October 25.** |
| ~~A3~~ | external-environment | ~~With a real configured provider/runtime, send two chat turns, close/reopen, then restart Dashboard. Confirm replies/history remain accessible and a new turn succeeds. Record runtime and model identities.~~ **Maximilien: passed, October 26.** |
| A4 | external-environment | Create a disposable manual workflow. Save/reopen its run limit and handoff settings. Run it and inspect the result. For Claude/Droid where installed, Stop must actually end the runtime step and permit a later run. |
| A5 | external-environment | Save a scheduled disposable workflow with a valid timezone and verify its next tick. An invalid timezone is refused with an error; unrelated workflows still schedule. Do not infer that duplicate Gateway cron execution is fixed: #288 remains held. |
| A6 | external-environment | Bulk-delete disposable agents, including one with an active turn. Confirm activity stops, agents disappear from the Dashboard/runtime, and they remain absent after restart. Report partial failures visibly rather than retrying blindly. |
| A7 | external-environment | Use BYOK model discovery with a real configured provider. Confirm the expected model list, successful chat, and isolation between different credentials. Do not paste keys into the result. |
| A8 | human-judgment | At desktop and mobile widths, check Builder first-use suggestions, long conversation scrolling, and the single result-panel toggle. Check long template names, card actions, the top bar, and Forward menu dismissal. Nothing overlaps or becomes unreachable. |
| ~~A9~~ | external-environment | ~~In agent details or an expanded card, choose **Add to group**, search by group name, and add the agent. The membership badge appears and remains after reload. Remove it with × and reload again. Verify the group, its other members, the agent's other memberships, and communities remain intact. Test the empty-state Add action and check mobile usability.~~ **Maximilien: passed, October 25.** |
| ~~A10~~ | human-judgment | ~~Reopen Edit Agent Config: **Automatic model suggestion** starts collapsed. Expand it to see the existing suggestion/priority controls. Expanding or collapsing does not change the selected model or save the agent. Close/reopen and confirm it starts collapsed again.~~ **Maximilien: passed, October 25.** |
| ~~A11~~ | human-judgment | ~~After AI generation in Add Agent, Automatic model suggestion starts collapsed. Expand it only when needed; the suggestion, priority, and existing selection controls remain available. Check desktop/mobile and confirm generation does not provision an agent automatically.~~ **Maximilien: passed, October 25.** |
| ~~A12~~ | human-judgment | ~~Click an agent card's group count. The same details panel opens and only its existing body scrolls to Groups; its header/footer and the underlying page stay fixed. Group add/remove controls remain available. **Previous jump rejected by Maximilien; fixed in `d092640c`, awaiting retest.**~~ **Maximilien: passed, October 26.** |
| A13 | external-environment | Refresh OpenAI BYOK models: retired GPT-4/3.5 must be absent, including advanced lists. Verify a new agent, a disposable older agent with a retired primary/backup, and built-in AI generation use active models and return a real reply/result without the deprecated-model 404. Reopen/restart and repeat. Confirm valid model choices remain unchanged; report any provider-access or explicit-policy failure. |
| ~~A14~~ | human-judgment | ~~Open BYOK: its title is Model Integration, and the duplicate Run via CLI section is absent. Both default model pickers have provider groups and hide unused deprecated models. An agent already using a deprecated model still shows that current selection and warning. The top Runtime pill retains working runtime controls. Save/reopen defaults and check desktop/mobile usability.~~ **Maximilien: passed, October 26 (BYOK/Model Integration looks good).** |

Result format: `reviewer / source SHA / platform / A1–A14 pass, fail, or not run /
brief evidence or reproduction`. A missing runtime is `not run`, not a pass.

## Feedback for Daniyar before the remaining PRs land

- #258: the required-field regex skips a completely blank `- **Event name:**`
  line. Cover that and whitespace-only values.
- #288: workflow deletion discards legacy-cron cleanup failures. Surface the
  surviving schedule/failure, and preserve #248's per-workflow sync isolation.
- #270: persistent 502–504 responses retry indefinitely without an actionable
  error state. Add failure/recovery and cancellation tests.
- #268: add focus containment and keyboard regression tests for the modal.
- #252: add HTTP tests for long/oversized bodies and authentication before parsing.
- #219: cover fenced group-chat code containing runtime-error phrases; the
  communication error summarizer must preserve the code.
- #227: demonstrate multi-tab Clear/Continue, active-turn handling, restart and
  old-store migration acceptance.
- #228: provide CI and startup/stop ownership, existing-service, secret-broker and
  restart acceptance evidence.
- #229: demonstrate real Gateway streaming, reconnect, cancellation, retries,
  duplicate events, and final-response consistency.

## Release gate

The latest October 26 instruction requires local-dev acceptance by both reviewers
before deployment images and official RC94. Complete engineering validation, disposition
security findings with evidence, and obtain the required PR approval before
merge/promotion. No production rollout is authorized or claimed.

## Archived release-gate wording — superseded October 26

An earlier October 26 instruction authorized review-only images tagged
`rc94-review1` before acceptance. A review tag and public build were started;
the build was stopped and prerelease returned to draft after the local-dev-first
clarification. No combined image was dispatched.

Complete engineering validation, resolve or explicitly disposition security
findings with evidence, and obtain the user's local acceptance first. Only then
select the final SHA and cut RC94. Matching public/private images and installed
MBP14/test10 acceptance remain later steps; this document does not authorize or
claim a production rollout.
