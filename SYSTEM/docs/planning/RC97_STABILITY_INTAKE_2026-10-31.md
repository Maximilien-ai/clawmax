# RC97 stability intake — October 31, 2026

Status: investigation and admission plan, not release readiness or completed fixes.
Branch: `integration/rc97-stability`, starting at `b2259a39` on the full RC96
integration line. RC96 remains immutable at `e548c64d`. Main contains RC96
product integration through PR #344 (`61a7d851`). No new PR was merged during
this intake. User reports event, customer and personal RC96 testing; this is
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

Located the Web-owned customer feedback UI at `/admin/customer-feedback` and its
authenticated `/api/admin/customer-feedback` endpoint in the Web source. Actual
submitted feedback has **not been accessed or triaged** in this intake. Await an
authenticated session or a redacted export; do not read deployment secrets to
bypass access. User intends to collect event feedback as well.

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
