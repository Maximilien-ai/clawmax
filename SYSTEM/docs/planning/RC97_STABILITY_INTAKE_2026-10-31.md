# RC97 stability intake — October 31, 2026

Status: investigation and admission plan, not release readiness or completed fixes.
Branch: `integration/rc97-stability`, starting at `b2259a39` on the full RC96
integration line. RC96 remains immutable at `e548c64d`. Main contains RC96
product integration through PR #344 (`61a7d851`). At initial intake no new PR was merged; subsequent RC97 branch integration
is recorded below. Main and the immutable RC96 tag remain unchanged. User reports event, customer and personal RC96 testing; this is
valuable acceptance evidence, not a blanket pass for every feature.

## Priority and acceptance

1. **Workflow secret persistence (#349).** Review and independently rerun its
   synthetic-canary tests before admission. Verify success/failure/cancellation,
   concurrent credentials, history, Docs, export and runtime delivery. Separately
   review legacy cleanup: no automatic destructive migration, no secret values
   in reports, symlink boundaries and active-run races. Cleanup does not establish
   that earlier exports or backups are clean. Dashboard owns code; instance owners
   own remediation of deployed data and any necessary credential rotation.
2. **Workspace agent counts.** Reproduce the reported zero count against the
   actual workspace roster. The current counter independently scans AGENTS and
   requires an IDENTITY.md Name field; investigate divergence from native/managed
   roster and stale client refresh. Define active/archived scope consistently.
   Test creation, deletion, template apply, workspace switching, restart, partial
   provisioning and unreadable sources. Unknown/unavailable must not become a
   trustworthy zero. Human check: dropdown matches the intended workspace roster.
3. **Workspace budget enforcement.** Reproduce with a small synthetic limit and
   controlled metering. Trace persistence, workspace identity, freshness and all
   admission paths: chat, groups, manual/scheduled workflows, AI generation and
   template-triggered execution. Test parallel dispatch, workspace isolation,
   changed limits, restart and missing/stale usage. Explicitly define treatment
   of already-running calls and estimated costs; do not promise a provider-side
   hard spending cap. Human/external check: saved settings persist and new work
   is blocked with an understandable reason at the configured limit.
4. **Recoverable template apply.** Connect to the existing P0 split-state and
   persisted-redaction-sentinel backlog. Preflight missing agent references before
   mutations where possible. Show each missing reference and explicit choices:
   map to an existing agent, create from an available definition, or correct the
   template. Do not invent agents or silently skip required references.
   After partial failure offer **Fix and retry** and **Cancel and undo this apply**.
   Persist a per-apply resource journal before mutations; resume without duplicate
   resources after retries/restarts. Undo only resources created by that apply,
   preserve pre-existing agents and later edits, reconcile native registrations,
   and show incomplete cleanup with a retry path. Preview exact consequences
   before undo. Test failure at every phase, concurrent changes, cancellation,
   repeated retries, restart, and cleanup failure. Human check: repair a missing
   agent reference and finish; separately cancel a partial apply without losing
   pre-existing work. Desktop and mobile actions must remain reachable.
5. **Previously requested RC97 work.** Retain tested provider primary/backup
   pairs (OpenAI: gpt-5.4-mini / gpt-5.4), explicit-choice preservation, and
   interrupted WhatsApp pairing recovery with ordered Dashboard/phone steps.
   Detailed requirements remain in [BACKLOG](../BACKLOG.md). Real-provider and
   real-phone evidence remain external gates, not inferred from mocks.

## Daniyar PR inventory

GitHub snapshot October 31: 11 open PRs. CI shown here is author-branch evidence,
not a fresh combined RC97 validation. Required approval is not bypassed.

| PR | Proposed disposition | Current gate |
| --- | --- | --- |
| [349](https://github.com/Maximilien-ai/clawmax/pull/349) | First security candidate | CI passes, mergeable, review required; independent cleanup/security validation pending |
| [346](https://github.com/Maximilien-ai/clawmax/pull/346) | Auto-default model fix candidate | CI passes, mergeable, review required; validate saved choices and no-current-model state |
| [347](https://github.com/Maximilien-ai/clawmax/pull/347) | Members keyboard fix candidate | CI passes, mergeable, review required; desktop/mobile focus and persistence checks |
| [339](https://github.com/Maximilien-ai/clawmax/pull/339) | Reconcile overlap with RC96 tables | Conflicts; compare residual behavior before merge or supersede |
| [340](https://github.com/Maximilien-ai/clawmax/pull/340) | Reconcile member-card overlap | Conflicts; keyboard follow-up is #347 |
| [341](https://github.com/Maximilien-ai/clawmax/pull/341) | Reconcile Details edit overlap | Mergeable, no checks reported; do not assume unique needed code |
| [343](https://github.com/Maximilien-ai/clawmax/pull/343) | Reconcile chat-label overlap | Conflicts; RC96 already stopped advertising streaming |
| [227](https://github.com/Maximilien-ai/clawmax/pull/227) | Evaluate session lifecycle separately | CI passes, review required; migration, Clear/Reset/Continue and restart evidence |
| [228](https://github.com/Maximilien-ai/clawmax/pull/228) | Hold pending ownership/recovery proof | Conflicts, no checks reported; must not interfere with existing Gateways |
| [229](https://github.com/Maximilien-ai/clawmax/pull/229) | Hold pending lifecycle integration | Conflicts; reconnect, cancellation, final-message persistence and dependency validation |
| [288](https://github.com/Maximilien-ai/clawmax/pull/288) | Evaluate scheduler migration separately | CI passes, mergeability unknown, review required; no duplicate schedules and observable legacy cleanup |

Do not merge dependency-major upgrades or new runtimes just to empty the queue.
Every admitted change needs focused tests and a committed checkpoint, followed by
the full RC97 integration/validation/coverage gate. No images requested in intake.

## Feedback intake

Authenticated CLI intake is now complete: 41 records were read through ClawMax.ai
CLI 1.6.8. See the [per-item triage](RC97_FEEDBACK_TRIAGE_2026-10-31.md) for decisions,
existing/new issue links and priorities. All 41 replies are now saved and verified
through CLI 1.6.9; notification requests are pending Web delivery. No raw participant
content is included in this public plan.

For each report record a safe reference, affected version/environment, sanitized
reproduction, expected/actual behavior, severity, owner, duplicate links, proposed
RC97 disposition, regression evidence and acceptance outcome. Keep participant
identities, raw prompts, attachments and secrets out of this public repository.
Route Web/CLI deployment issues to their owners rather than presenting them as
Dashboard fixes. Nothing is marked fixed merely because a related PR exists.

The active human Review queue should include only checks requiring judgment or
an external environment, with the required reviewReason. Preserve RC96 results
in their own release history; do not copy old unfinished engineering checks into
the RC97 tester queue.

## RC97 implementation checkpoint — October 31

Branch integrations (not main merges or release readiness):

- `0b243b12`: #377, failed budget loads cannot overwrite budget during metadata edits.
- `38ed9075`: #376/#378, zero preserved and failed creation-budget writes visibly
  retry against the already-created workspace. Adoption preserves existing budgets.
- `4f329f48`: #350 discovery parity: shared identity parsing accepts the same
  canonical and plain Name fields as Agents. New mixed-format count regression
  failed before and passed after. Confirm the affected cloud instance separately.
- `e6bbfec0`: Daniyar #349, workflow-secret persistence and response/export protections.
- `097ad505`: the eight secret-isolation scenarios are now part of SYSTEM/test.sh.
- `654ed41f`: Daniyar #346, automatic model selection avoids deprecated fallbacks.
- `ede1459b`: Daniyar #347, Manage Members focus, Escape and keyboard navigation.

Verified locally: desktop/mobile budget creation/edit/error/retry, overwrite and
adoption; workspace manager 10 tests plus registration and doc-entry suites;
secret canaries 8 scenarios, workflow routes 24 tests and export tests; model
selection 21 client + 11 server + 10 lifecycle tests and five browser scenarios;
member dialogs four browser scenarios covering group/community and desktop/mobile.
Server TypeScript passes. Client remains at the same 291 pre-existing diagnostics
(after normalizing line numbers), with none added. Full release tests, installed
runtime acceptance and image validation have NOT run for this checkpoint.

#349/#346/#347 remain open on GitHub with required review; their ancestry is
integrated only on this candidate branch. Eight other Daniyar PRs remain to reconcile
or validate: #227/#228/#229/#288 and overlapping #339/#340/#341/#343. Do not assume
those eight contain eight missing features. Existing-data secret cleanup remains
an explicit offline operator action; it has not been run against real workspaces,
and does not establish that old exports/backups are free of sensitive values.

Next priorities: #351/#352/#355 document preservation, #367/#375 workflow
configuration preservation, budget/metering coverage, template apply recovery,
and the previously planned provider-pair and WhatsApp work. Keep release admission
bounded by evidence; these integrations alone do not make RC97 ready to cut.
