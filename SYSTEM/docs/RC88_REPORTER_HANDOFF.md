# Maximilien-AI team: Operations Reporter handoff

Dashboard sources: `0f7d03af` (combined delivery), `a6eae8d4` (wait for active
workflows and Reporter readiness), `0149b42b` / `f8a86a3b` (channel labels and
on-demand Agent availability).

## Dev changes to carry into the owned Template

Add an Operations Reporter Agent with only the `clawmax-resend` Skill. Keep the
existing Collector-only Maximilien Skill and credential binding unchanged.
The Reporter delivers saved brief content, not a second model-generated summary.
Do not independently instruct other Agents to send the same reports.

User-approved destination: `max@maximilien.ai`. After either manual or scheduled
workflow completion, collect newly completed, unsent briefs into a combined email.
Wait 60 seconds after the newest completion. If companion workflows are still
actively running, wait for them to finish. Use the live runtime registry, not a
stale on-disk running flag, so interrupted runs cannot block delivery. Never
wait for a weekly workflow that has not started. Later briefs form a later batch.
Failed runs and old rehearsal history are excluded.

Daily account/site schedules remain 09:00 America/Los_Angeles; relationship
follow-up is Monday 09:00. Every successful run retains its dated brief and latest
brief. Recalculate package digests after authored changes. Keep import inert and
make email opt-in separate from Resend setup; do not package credentials.

## Implemented Dashboard dev contract

`SYSTEM/brief-delivery.json` is workspace-local, disabled by absence. Schema:

```json
{
  "version": 1,
  "enabled": false,
  "recipient": "owner@example.test",
  "reporterId": "operations-reporter",
  "enabledAt": "2026-09-26T17:50:27Z",
  "workflowIds": ["tr-1234567890abcdef-workflow-123456789abc"]
}
```

The dev worker reads durable successful runs from
`SYSTEM/dev-template-workflow-runs`, checks Reporter Skill assignment, and calls
the existing ClawMax Resend command implementation in the exact workspace scope.
It uses no additional LLM call. It runs only with the existing dev runtime flag;
this is not production Template activation or an image release sign-off.

Receipts in `SYSTEM/brief-deliveries/<batch-id>.json` retain run IDs, recipient,
Reporter ID, submission time, state, and provider ID—not email bodies or secrets.
Notifications identify successful submission or uncertain delivery. Provider
acceptance is not proof of inbox receipt. Email failure does not fail the analysis.

Set `enabled` to false to stop future automatic sends. Removal of the Reporter
Skill also blocks dispatch. No separate settings UI exists for this dev opt-in.
A process interrupted while sending leaves a durable claim and possibly a
`dispatch.lock`; automatic replay is intentionally blocked. Inspect the receipt
and Resend before repairing a stale lock or authorizing a retry. Never clear
claims to blindly resend. Production work should add operator-facing recovery
and delivery settings before general release.

## Acceptance

1. Refresh localhost:5174, select the isolated Operations workspace, and find
   Operations Reporter. Verify only `clawmax-resend` is assigned.
2. Run account and site workflows close together. After both briefs complete and
   the collection window passes, expect one combined email and one notification.
3. Confirm both dated briefs are included, with no old rehearsal content.
4. Refresh/restart: those same run IDs must not be emailed again.
5. A later manual or weekly run produces a new batch. Failed analysis produces
   no brief email. Review uncertain email acceptance in Resend before retrying.

Private workspace settings, emails, reports, and package bytes stay out of Git/CI.
The portable ZIP has not been rebuilt; Maximilien-AI owns that follow-up.

## Observed dev verification

On September 26, both daily workflows completed and saved briefs. Resend accepted
one batch with both run IDs (`c121d7bc-c6a6-4e97-9a05-6642ca231f12`); the private
receipt includes its provider ID. Inbox receipt still needs the user's check.
All five Agents report runtime availability after restart. That is availability,
not proof of an active turn or guaranteed provider authentication; running and
credential status remain separate signals.

TypeScript, frontend build, focused delivery/availability tests, 11 notification
route tests, 21 channel route tests, and 15 Organization-team tests passed.
The complete integration/coverage suite and release-image gates remain pending.
