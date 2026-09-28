# Weekly recap: September 21–27, 2026

Prepared Monday, September 28. Scope: public `main` commits and recorded release
evidence from the week. The [Sunday NYU hackathon recap](../LESSONS_LEARNED_2026-09-27.md)
covers the 1.9.x event canary and AgentForge work in detail; its private branch,
fleet, and partner statements are recorded handoffs, not freshly verified here.

## The week in one view

ClawMax advanced from RC81 to a tagged RC88 source candidate while keeping
`v1.9.9` stable. The strongest gain was turning Template and Operations work
into more observable, rehearsable flows: admitted Agent/Group chat, a two-stage
dev Workflow with durable run briefs, editable schedules, and a narrowly scoped
Reporter delivery path. The main unresolved question remains installed-instance
reliability and acceptance. RC85 public and matching combined images passed
their recorded build and smoke gates; that evidence does not validate later
RC86–RC88 changes or clear the cloud/on-prem and tester gates.

### Work completed or materially advanced

- **Runtime and release stability (Sept. 21–23).** Recovered container startup,
  gateway shutdown/reload, native profile and plugin handling, and test-runtime
  isolation. RC85 recorded 485 passing validation checks, 77.19% branch
  coverage, and passing public/combined amd64 and arm64 image gates. See the
  [RC85 gate](../planning/RC85_RELEASE_GATE_2026-09-23.md).
- **Template and plugin usability.** Added authenticated CLI Template and Group
  discovery/chat paths, staged portable Template lifecycle and Skill packaging,
  OpenClaw runtime plugin inventory/controls, and clearer readiness, Logs, and
  Builder behavior. The public Template Workflow executor remained a separate
  admission gate; staged/rehearsal support is not production execution.
- **Offline recovery (Sept. 24).** Added source commands for verified backup and
  isolated candidate restore, including safe link handling and version
  provenance. The private M4 RC57→RC85 fixture, stopped-writer proof,
  promotion, and rollback remain open. See the [recovery contract](../planning/ONPREM_OFFLINE_UPGRADE_RECOVERY.md).
- **Operations rehearsal (Sept. 25–26).** Built host-authorized Skill/Agent
  rehearsal and two-stage dev Workflows; repaired history, polling, manual-run
  and pause semantics; then persisted schedules and readable, durable briefs.
  A temporary every-minute schedule completed both stages and saved a brief.
  The Reporter later submitted one combined batch for two completed daily
  briefs, with receipt and duplicate-send protections. Inbox receipt, the
  authored portable package, full suite, and release images remain pending.
  See [Workflow](../RC88_WORKFLOW_AUTOMATION_HANDOFF.md) and
  [Reporter](../RC88_REPORTER_HANDOFF.md) handoffs.
- **Sunday NYU event track.** The separate
  [hackathon recap](../LESSONS_LEARNED_2026-09-27.md) records a 1.9.x Cognee4
  canary, AgentForge consent/export work, and a wizard crash found through the
  real configuration path. It also records the combined-image compatibility
  failure and remaining partner/fleet acceptance. Do not fold those maintenance
  changes into 2.0 without review.

## WWR / WWW / lessons

| WWR: repeat | WWW: correct | Lesson for next week |
| --- | --- | --- |
| Small, focused commits and isolated canaries made regressions and rollback boundaries easier to identify. | Image, source, deployment, and user acceptance were sometimes discussed under one “green” label. | Name the exact gate, source SHA, image/digest, and environment for each claim. |
| Durable run history, briefs, receipts, and runtime-aware waiting made Workflow outcomes inspectable. | Proxy resets, stale run flags, request storms, and schedule/manual coupling needed several repair passes. | Test recovery and state transitions through the real browser/runtime path before widening scope. |
| Focused boundary tests caught consent, authority, storage, and fixture isolation problems early. | The AgentForge wizard path and full test runner invocation were missed by narrower checks. | Cover the user's complete entry path and the actual CI/test harness, including mobile and failure/reopen states. |
| Host Skill authority and candidate-only restore kept risky operations scoped. | M4 upgrade and current combined-image compatibility still lack end-to-end proof. | Keep preservation and rollback evidence ahead of rollout; do not promote a source contract into a fleet claim. |

## Open decisions and soft plan for Sept. 28–Oct. 4

1. **First, close the event canary loop.** Confirm AgentForge Edit/Save/Reopen,
   receiver consent/delivery/revocation, Cognee service behavior, and the exact
   live slot state. Let CLI/Web complete protected update admission before any
   additional slots. Use the [hackathon owners/evidence table](../LESSONS_LEARNED_2026-09-27.md).
2. **Then reestablish a 2.0 release baseline.** Reconcile the RC85-era
   [status](../STATUS.md), [backlog](../BACKLOG.md), [known issues](../KNOWN_ISSUES.md),
   and docs index against RC86–RC88 evidence. Run the full integration/coverage
   gate and publish matching images only for the exact candidate selected;
   obtain installed-instance and tester acceptance separately.
3. **Validate the two highest-risk 2.0 flows.** Rehearse offline recovery on
   the private M4 fixture with rollback proof; finish Operations Workflow and
   Reporter restart, failure, schedule, and inbox checks. Rebuild the owned
   portable Template only after its author updates it.
4. **Keep other backlog work conditional.** Bulk agent budget limits and new
   feature scope follow stability gates and any meetings or user priorities
   that arise. Carry unresolved Mike model/chat reports into acceptance rather
   than treating them as fixed by RC85.

These are suggestions, not a locked sprint or a release-readiness claim.
