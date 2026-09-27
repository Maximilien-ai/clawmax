# Hackathon recap and lessons learned — September 27, 2026

Snapshot: September 27 afternoon, Pacific time. This records Dashboard evidence
and the CLI/Web handoffs available at review time, not a claim of fleet-wide
acceptance. Earlier Operations workflow/reporting work is context from preceding
days, not work newly completed today.

## What we did / completed

- Kept the urgent 1.9.x event fixes on a maintenance branch based on 1.9.9,
  separate from the 2.0 development line. Published Cognee3 and then Cognee4
  public canary images; did not change global provisioning defaults.
- Integrated the reviewed AgentForge opt-in export foundation into the legacy
  Dashboard: operator configuration, participant enrollment, explicit scoped
  consent, visible sharing state, revocation, asynchronous delivery and purge
  evidence. Configuration is not consent. Current capture covers Agent chat and
  Builder recommendations, not automatic Workflow capture.
- Added receiver/workspace binding and asynchronous revocation protections.
  Synthetic checks exercised enrollment, redaction, consent, failure, revocation,
  and purge behavior without exporting real participant conversations.
- Tested desktop/mobile sharing UI. Fixed a mobile-dialog layout audit failure
  and export suites invoked from the wrong working directory.
- User tested an existing Agent successfully after the Event 5 upgrade. This
  confirms chat, not Cognee memory-service behavior or AgentForge delivery.
- User found a separate NYU AgentForge configuration crash. The legacy wizard
  assumed every catalog partner had a provider-validation entry. Fixed missing
  state handling and removed legacy key validation for status-only partners;
  added a focused regression test, passed typecheck and production build.
- Published and deployed Cognee4 to the existing slot-5 canary. Rollout and
  health checks passed; runtime version was verified and the existing PVC
  identity preserved. Deployment settings apart from image/version were unchanged.
- Established shared dated handoffs so Dashboard, CLI and Web can coordinate
  without the user copying messages. CLI acknowledged the exact image identity.

## Release and branch state

| Track | Checkpoint | Disposition |
| --- | --- | --- |
| 2.0 development | `main`, `5ae3a265` before this recap | Main checkout clean at inspection; resume normal development here |
| 1.9 maintenance | `fix-1.9.10-cognee-policy`, `64b9b662` | Pushed and clean; retain for event support, do not bulk-merge into main |
| AgentForge review | `fix-agentforge-cognee3`, `a073ee84` | Separate review worktree; reconcile selectively with main and maintenance fixes |
| Published image source | `d3d8199ad4855b175276907065645e3c265fc03b` | Tag `v1.9.10-test-cognee4`; later documentation commits are not image changes |

Image: `ghcr.io/maximilien-ai/clawmax-dashboard:1.9.10-test-cognee4`.
Immutable digest:
`sha256:e8d5a0e715f3b3fc7bc3b8c4b4f5a162c437b54afb7eb41a0fca9a0e01bc48bb`.
Package version is `1.9.10`; runtime release is `1.9.10-test-cognee4`.
Cognee4 is a Dashboard candidate name, not a Cognee upstream version.

- [Both architecture builds and registry smoke passed](https://github.com/Maximilien-ai/clawmax/actions/runs/36336575531).
- [Source CI passed](https://github.com/Maximilien-ai/clawmax/actions/runs/36336362225).
- [Earlier Cognee3 CI failed](https://github.com/Maximilien-ai/clawmax/actions/runs/36333354581): runner cwd and mobile audit; corrected in Cognee4.
- The attempted combined/private image could not pass the legacy host
  compatibility gate. Do not present this public image as a validated combined
  release. Nothing here promotes 1.9.10 to stable or completes 2.0/RC88.

## What went well

Small immutable canaries, a preserved rollback image, focused commits and
digest-pinned deployment contained the event risk. Existing Agent chat survived
the upgrade. Cross-team image/package identity was explicit. Consent boundary
tests caught asynchronous state hazards before live participant export.
Shared-file coordination now separates image readiness from deployment authority.

## What went badly / lessons learned

1. **We missed the user's entry path.** The sharing-dialog fixture did not cover
   Partners → enable → edit configuration → save → reopen. Add a real wizard
   browser regression at desktop/mobile widths with persistence and failure cases;
   the current focused source regression does not replace it.
2. **A green image is not a working integration.** Track build, source CI,
   rollout, configuration UI, receiver delivery, and user acceptance separately.
   Never describe all of them as simply “green.”
3. **Legacy backports need compatibility tests.** Catalog entries cannot assume
   hard-coded provider state; current private extensions cannot be assumed
   compatible with an older host. Test both boundaries before release.
4. **Test the actual runner.** Individual suites passing did not catch their
   wrong invocation directory in the full harness. Include a runner-path check.
5. **Be precise about versions and scope.** Package, runtime release, digest,
   branch, and slot are different identifiers. “Event 5” was ambiguous against
   a five-instance event. Resolve exact inventory before mutation.
6. **Don't use shared dependency symlinks for install work.** A maintenance
   install affected the main checkout's dependency directory during preparation.
   Main dependencies were restored from its unchanged lockfile; use independent
   installs per worktree and verify paths before dependency operations.
7. **Close the deployment loop.** Publishing an image or handing it off is not
   deployment. Report exact live image, preservation evidence and pending human
   acceptance, and retain dated responses instead of relying on conversation.

## Not completed / owners and next required evidence

| Pending work | Owner | Completion evidence |
| --- | --- | --- |
| AgentForge configuration acceptance on Cognee4 | User + Dashboard | Hard-refresh; Edit/Save/Reopen persists fields without crash |
| Real AgentForge enrollment, consent, delivery and revocation | Partner + Dashboard | Synthetic end-to-end receiver evidence; no unintended export |
| Cognee partner service behavior | Dashboard + operator | Configured-service verification, not just ordinary chat |
| Protected fleet updater | CLI | Integrated claim/check/renew, authority fencing, durable completion, preservation tests and published verified worker pins |
| Event update admission | Web | Reviewed migrations, baseline reconciliation, verified update-only executor, staging and acceptance controls |
| Remaining Event 5x2 slots | CLI + Web + user | Verify/skip 5; canary 2; explicit acceptance; 3 → 4 → 1 sequentially |
| Reconcile AgentForge into 2.0 | Dashboard | Review both branches, selectively port changes and rerun 2.0 contracts/browser/full suite |
| Release-document drift | Dashboard | Reconcile stale RC85-era status/index/backlog with verified evidence, without declaring RC88 shipped |

CLI's latest available checkpoint (`20260927T202836Z`) reports tested source
preparation but **no runnable admitted update worker and no live fleet update**.
Slots 1–4 remain 1.9.9; slot 5 is Cognee4. Their reported local validation is
1,469 discovered tests and 82.34% statements/lines; publication/admission is a
separate gate. Unrelated events, deadline changes and global defaults are excluded.
No automatic rollback should be inferred safe without data compatibility and
current authority.

## Next-day direction

1. Close the canary's exact partner configuration and receiver acceptance gaps.
2. Let CLI/Web finish the protected updater, then roll the remaining test slots
   one at a time with explicit canary acceptance. Keep event support on maintenance.
3. Return regular development to main, already checked out in the primary repo.
   Keep both temporary worktrees/branches until changes are reviewed and integrated;
   do not reset, delete, or merge the maintenance branch wholesale.
4. Port generic, tested fixes deliberately to 2.0; run complete validation before
   claiming an RC88 image or a new combined release. Revisit prior Operations
   workflow/brief/email acceptance as a separate track, not a hackathon completion.
5. Refresh release documentation and capture final event outcomes in a dated
   follow-up, including failures and user-visible acceptance results.

## Local coordination

Shared directory: `/Users/maximilien/Desktop/ClawMax/handoffs`.
Convention: `YYYYMMDDTHHMMSSZ_FROM-to-TO_issue.md`.
Each file states sender, recipient, time, priority, topic, status, related evidence,
requested action and acceptance. Keep secrets and raw participant data out.

Image handoff: `20260927T202200Z_Dashboard-to-CLI_event5x2-cognee4-image.md`.
Latest inspected CLI implementation reply:
`20260927T202836Z_CLI-to-Web_event5x2-cognee4-checkpoint.md`.
Read newer replies before acting; a file is coordination, not execution authority.
