# RC94 local acceptance — October 24, 2026

Status: pre-release integration; RC94 has not been tagged or built. The user must
complete local testing and explicitly confirm acceptance before RC94 is cut.

## Source and merge status

- Dashboard integration branch: `integration/rc94-daniyar`.
- Integration PR: [#291](https://github.com/Maximilien-ai/clawmax/pull/291).
- Eighteen of Daniyar's 27 open PRs are combined on this branch, preserving
  their original commits. This is not yet a merge to `main`.
- Included: #246, #248, #250, #254, #256, #260, #262, #264, #266, #272,
  #274, #276, #278, #280, #282, #284, #286, #290.
- Additional change: a remembered pin beside X on agent details, Edit Agent
  Config, and chat, in modal and right-side layouts. Outside-click dismissal is
  the default; pinning ignores outside clicks. Escape and X remain available.
- Held for feedback: #219, #227, #228, #229, #252, #258, #268, #270, #288.

## Engineering evidence

These are Dashboard-owned checks, not acceptance tasks for reviewers.

- Server TypeScript: passed.
- Changed panel code lint and focused TypeScript: passed.
- Panel persistence and Forward-menu focused tests: passed.
- Full client TypeScript: 291 diagnostics on both candidate and untouched
  `origin/main`; normalized diagnostic messages match, with no added errors.
- Full isolated integration/validation/coverage: in progress. Runtime preparation
  is included. Expected duration: 30–45 minutes, based on recent approximately
  30-minute CI runs and clean local runtime preparation.
- Browser interaction and responsive audit: in progress, using synthetic API
  responses on a separate loopback preview. This does not establish real model,
  installed-runtime, or restart acceptance.
- [Candidate CI](https://github.com/Maximilien-ai/clawmax/actions/runs/40104693024):
  in progress.
- [CodeQL analysis](https://github.com/Maximilien-ai/clawmax/actions/runs/40104690341)
  completed, but the PR security gate reports 19 new-to-PR findings: two critical
  and 17 high. This is unresolved; successful scan execution is not clearance.
  Findings concern model-discovery outbound requests and hashing/regex handling,
  plus filesystem paths in skill, workspace-import, and deletion code. Dashboard
  owns disposition before merge/promotion. No alerts have been dismissed.
- The six residual RC93 command/path findings remain separately tracked in
  [RC93 triage](RC93_CODEQL_TRIAGE_2026-10-21.md).

## Acceptance for Maximilien and Daniyar

Each reviewer should record their own result on the exact same source revision.
Use disposable agents/workspaces for changes and deletion tests. Record the
source SHA, platform, browser, result, and a short failure description. Never
include provider keys or raw participant conversations in the report.

| ID | reviewReason | Check and expected result |
| --- | --- | --- |
| A1 | human-judgment | Open agent details and Edit Agent Config. The pin is visible beside X. Unpinned, an outside click closes the panel. Pinned, it stays open. Inside clicks never close it. X and Escape close it. Reopen/reload and confirm the choice is remembered. |
| A2 | human-judgment | Open chat, pin it, switch to its right-side layout, and click outside. It stays open. Unpin and click outside; it closes. Open History/Forward and press Escape: the inner surface closes first. Confirm X closes only the chat when details are underneath. |
| A3 | external-environment | With a real configured provider/runtime, send two chat turns, close/reopen, then restart Dashboard. Confirm replies/history remain accessible and a new turn succeeds. Record runtime and model identities. |
| A4 | external-environment | Create a disposable manual workflow. Save/reopen its run limit and handoff settings. Run it and inspect the result. For Claude/Droid where installed, Stop must actually end the runtime step and permit a later run. |
| A5 | external-environment | Save a scheduled disposable workflow with a valid timezone and verify its next tick. An invalid timezone is refused with an error; unrelated workflows still schedule. Do not infer that duplicate Gateway cron execution is fixed: #288 remains held. |
| A6 | external-environment | Bulk-delete disposable agents, including one with an active turn. Confirm activity stops, agents disappear from the Dashboard/runtime, and they remain absent after restart. Report partial failures visibly rather than retrying blindly. |
| A7 | external-environment | Use BYOK model discovery with a real configured provider. Confirm the expected model list, successful chat, and isolation between different credentials. Do not paste keys into the result. |
| A8 | human-judgment | At desktop and mobile widths, check Builder first-use suggestions, long conversation scrolling, and the single result-panel toggle. Check long template names, card actions, the top bar, and Forward menu dismissal. Nothing overlaps or becomes unreachable. |

Result format: `reviewer / source SHA / platform / A1–A8 pass, fail, or not run /
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

Complete engineering validation, resolve or explicitly disposition security
findings with evidence, and obtain the user's local acceptance first. Only then
select the final SHA and cut RC94. Matching public/private images and installed
MBP14/test10 acceptance remain later steps; this document does not authorize or
claim a production rollout.
