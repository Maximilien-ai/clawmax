# Message isolation #404 — November 10

**Closed November 11:** PR #417 merged as `0de68dae`; #404 and its linked
feedback are addressed. The [November 11 receipt](RC98_ACCEPTANCE_2026-11-11.md#completed-prior-batch)
records the resolution reply and requested email. Pending statements below are
historical source checkpoints, not the current issue disposition.

Owner-accepted product source: `c938a49fda2b3e7e4567f6e76a3397223f5f5941`.
Latest security product source: `602347c5c4e3a58957aee4b0d2e1ab7c521a529e`.
Status: owner accepted November 11. CodeQL analysis and aggregate gates pass on
`602347c5`, with zero open PR-ref alerts after remediation and documented CSRF
false-positive dispositions. Current-head full CI and the final local full rerun
remain separate verification gates. RC98 has not been cut or deployed.
See the [security checkpoint](RC98_ACCEPTANCE_2026-11-10.md#pr-417-remote-evidence--november-11)
for exact results, links and disposition evidence. Earlier verification below
identifies its original source rather than silently applying to later changes.

## Reproduced failure

On merged main `da30720f`, two separately created groups, `Sales Team` and
`Sales_Team`, shared `sales_team.json`. Posting a synthetic marker only to the
first group caused a cold read of the second to return it. Exact-name memory
keys masked the normalized filename collision until a cold load. The archive
code used the same normalization. The reproduction used disposable data and
production creation/message handlers; no participant data was copied.

## Resulting behavior

- New named-channel histories and archives use exact identities, scoped by
  workspace and channel type. Spaces, underscores, case and other supported
  characters cannot collapse into the same history filename.
- Unambiguous legacy history retains its original bytes and receives a durable
  ownership record. Creating a similar new name preserves an already provable
  old owner before catalog mutation.
- Ambiguous legacy history returns HTTP 409 with a recovery code. Its bytes are
  preserved, and its blocked state survives subsequent catalog changes or
  deletion of a conflicting channel. Warm caches cannot bypass that state.
- Chat state, drafts and caches cannot move into another channel, same-named
  community or workspace. Delayed responses are ignored after leaving a chat.
  List-view row/name clicks switch the pane without an outside-click closing it.
- A stale workspace header rejects a request rather than choosing another
  workspace. Delayed work retains its original workspace context; a removed
  context cannot fall back to the active/default workspace.
- Recipient admission happens before saving or dispatching. Only current active
  members are eligible; duplicate mentions dispatch once. Admission is checked
  again at the head of the per-agent execution queue. Temporary selected-agent
  conversations retain their explicit workspace-local behavior.
- Native runtime sessions distinguish workspace, channel kind/name and agent.
  Successful CLI execution no longer creates a redundant default-state session
  directory outside the selected runtime state.
- Recovery is a persistent, readable failure state. It blocks sending/clearing,
  has no false empty-history message, and does not suppress healthy channels'
  message counts. Public Lifecycle evidence follows the same archive ownership.

The storage-format change concerns named groups/communities. The direct-message
filename format is unchanged; this record does not claim a complete messaging
security audit.

## Verification

- **570/570 full local integration/validation/coverage passed**, zero
  failures, on exact source `c938a49f`. Observed duration: 11.7 minutes.
  Statements/lines **83.83%**, branches **81.48%**, functions
  **92.11%**. Log: `/private/tmp/clawmax-404-full-c938a49f.log`.
- Real targeted **OpenClaw 2026.9.7 (c074824)** group and same-named community
  turns completed. Their replies stayed in the intended history; a disjoint
  near-colliding group remained empty. Checks use explicit integration BYOK
  credentials, exactly as the existing single-agent test does; ambient host
  credentials are not admitted to make a test pass.
- Required storage suite: **13 scenarios**, including fresh child processes,
  legacy ownership, durable recovery after catalog changes/deletion, archives,
  failed persistence and corrupt ownership records.
- Required routing suite: **7 scenarios**, including disjoint memberships,
  community dispatch, deduplication, scoped sessions/replies, workspace switches,
  membership revocation during queueing and removal of a pinned workspace.
- Four browser theme/viewport runs passed at 1440px/390px in light/dark mode.
  Each desktop run also exercises the production Communications List page.
  Checks cover delayed responses, cache and draft separation, workspace guards,
  persistent recovery during retries and readable errors. Screenshots reviewed.
- The real isolated dev also passed distinct-history List navigation and visible
  recovery using seeded data, without agent execution during that UI check.
- Production build, server TypeScript and focused ESLint passed. Strict frontend
  TypeScript remains at **291 baseline diagnostics**, with no new diagnostic
  patterns. That baseline is still an engineering release gate.

Browser artifacts: `/private/tmp/clawmax-404-browser-final/` and
`/private/tmp/clawmax-404-live-list.png`, `/private/tmp/clawmax-404-live-recovery.png`.
Build log: `/private/tmp/clawmax-404-build-c938a49f.log`.

An earlier `f09c45d6` run passed 565/565 before five live channel checks were
added. Intermediate runs exposed missing explicit credentials in those new
fixtures; the final run above supersedes them. Product credential admission was
not relaxed.

## Acceptance, rollout and feedback

The [owner checklist](RC98_ACCEPTANCE_2026-11-10.md) records both short human
judgments accepted November 11: clarity when switching seeded chats and clarity
of the recovery notice. Owner reply: “LGTM accept 404.” No repeat check is needed.
[PR #417](https://github.com/Maximilien-ai/clawmax/pull/417) awaits current-head
CI before merge. Its original 14-alert CodeQL hold is superseded by the verified
security checkpoint above: analysis and aggregate gates pass on `602347c5`, with
zero open PR-ref alerts. Owner acceptance remains complete.

[Recovery guidance](../guides/RECOVER_CHANNEL_HISTORY.md) explains retained bytes,
manual review, backup/export and the rollback limitation. Older builds do not
read `.v2` histories; a rollback must account for the new data rather than reuse
stale legacy files. No fleet deployment or release image was changed here.

Management feedback `8b793b8a-bc32-4df0-8600-1ccfbe7e0591` links only #404. It stays
open until the GitHub issue is addressed through the reviewed merge. The saved
reply/notification receipt is recorded separately below; queued email is not
reported as delivered.

Management reply saved as `23d82d43-559c-4c80-af51-b9066d3e0a53` with decision `in_progress`.
The authorized thank-you/future-version email was requested; service status is
`pending` (due `2026-11-11T01:37:17.456615+00:00`), with no delivery
timestamp. This is a queued notification, not evidence of delivery. The report
retains its sole #404 issue link and is not resolved before acceptance/merge.
