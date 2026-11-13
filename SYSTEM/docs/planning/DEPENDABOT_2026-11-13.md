# Dependency maintenance — November 13

#227 is owner-accepted and merged as `9ad021b08d24d2b5c0cdbc719f28fe5587976274`;
#223 is closed. Its final CI passed; the exact product/test source passed 574/574
local integration/validation/coverage checks. [Acceptance receipt](https://github.com/Maximilien-ai/clawmax/pull/227#issuecomment-6847518580).
The [chat checklist](RC98_CHAT_ACCEPTANCE_2026-11-12.md) retains the engineering
evidence and limitations. Stable remains v1.9.9; RC98 has not been cut.

## First batch and merge order

1. [#294 — download-artifact v8](https://github.com/Maximilien-ai/clawmax/pull/294):
   **merged** as `2f62920a` after required CI, transport and CodeQL checks passed.
2. [#297 — upload-artifact v7 and scoped CI](https://github.com/Maximilien-ai/clawmax/pull/297):
   **merged** as `5ebca2ad`. All producers retain named zipped evidence. The
   [impact-based CI policy](../CI_TEST_SCOPE.md) keeps the required test/audit and
   selects full Dashboard validation for application/dependency/runtime/shared or
   unknown changes. Final selector, artifact and CodeQL checks passed; the required
   focused job took **33 seconds**, with Dashboard tests correctly skipped.
3. [#295 — build-push-action v7](https://github.com/Maximilien-ai/clawmax/pull/295):
   refreshed after both merges as `9fca78d7`; local selector/image contracts pass.
   Current-head hosted checks remain the merge gate. Synthetic amd64/arm64 local
   exports passed on earlier source; no release image is published.

Strict branch protection requires a fresh main base and one approving review.
Refresh the next PR after each merge; this order does not waive that requirement.
Use existing PRs, without force pushes or blanket merges.

## Prepared update evidence

| PR | Tested source | Hosted action checks | Normal CI |
| --- | --- | --- | --- |
| #294 | `02395f29` | [Passed v4 → v8 round trip](https://github.com/Maximilien-ai/clawmax/actions/runs/43391500989) | [Passed before merge](https://github.com/Maximilien-ai/clawmax/actions/runs/43391500968) |
| #297 | `c33bfc5f` | [Passed v7 → v8 round trip](https://github.com/Maximilien-ai/clawmax/actions/runs/43399644873) | [Passed before merge](https://github.com/Maximilien-ai/clawmax/actions/runs/43399644860) |
| #295 | `9fca78d7` plus documentation checkpoint | Local refreshed contracts pass; prior hosted exports passed | [Current-head checks](https://github.com/Maximilien-ai/clawmax/pull/295/checks) required before merge |

The #295 scratch context contains synthetic JSON only and exports local files;
it verifies action execution for both platforms without exercising production
packaging, registry pushes or runtime readiness. Those remain separate RC gates.
The small hosted jobs are expected under five minutes; the build job has a
ten-minute timeout. Documentation-only checkpoints require their own normal CI.

Local checks on both updated sources pass the same 7 mirror/evidence tests,
promotion/packaging contracts, 8 lifecycle assertions and all 8 workflow YAML
parses. All three v7 upload steps accept the official metadata inputs and preserve
zip mode. All three v7 build steps use supported inputs and hosted runners; no
removed summary environment settings are used. New inline shell syntax passes.
Application source is unchanged from merged main; no additional application
full-suite or external-provider claim is made for these CI updates.

## #294 evidence and compatibility

- Local: **7 image/mirror tests**, promotion contract, OpenClaw Docker packaging
  contract and **8 lifecycle smoke assertions** pass. All **8 workflow YAML files**
  parse; new inline shell syntax and read-only permissions pass. Server TypeScript
  passes. The full application suite is not rerun for this workflow-only change;
  the prior 574-check result belongs to the identified chat source.
- The original full CI passed before #294 merged. The application lane typically
  takes **43 minutes**; focused automation normally takes **2–5 minutes**. The artifact
  round trip is expected under **5 minutes**. Check near half the expected duration
  and completion plus one minute. Current [PR checks](https://github.com/Maximilien-ai/clawmax/pull/294/checks)
  are authoritative; do not merge from local evidence alone.
- [Download v8 release notes](https://github.com/actions/download-artifact/releases/tag/v8.0.0)
  retain zipped artifacts and make digest mismatch fail by default. No mismatch
  override or credential/publishing permissions are added.
- [Upload v7 documentation](https://github.com/actions/upload-artifact/blob/v7/README.md)
  defaults to zipped upload; direct single-file upload is opt-in and ignores the
  artifact name. Keep the existing named, zipped evidence contract when upgrading.
- [Build v7 release notes](https://github.com/docker/build-push-action/releases/tag/v7.0.0)
  require Node 24-capable runners and remove deprecated summary environment names;
  inspect actual usage before reporting #295 compatible.

## Remaining dependency queue

| PR | Scope | Required evidence before merge |
| --- | --- | --- |
| #384 | Node 24.22 Docker base | Align CI Node pin; build/runtime and version contracts |
| #296 | Cognee OpenClaw plugin | Compatibility with pinned OpenClaw 2026.9.7 and packaging |
| #298 | 18 minor/patch packages | Lockfile, dependency audit, types/build and affected tests |
| #300 | Archiver types major | Prepared `52c0374f`: lint, server types, build, audit and five ZIP/archive suites pass; refresh after #295 and require current CI |
| #301 | c8 major | Coverage runner, output and failure propagation |
| #299 | concurrently major | Local start/stop and child-process cleanup |
| #303 | dotenv major | Env precedence, credential parsing and cold-start isolation |
| #302 | react-markdown major | Markdown rendering/security, chat/docs and responsive views |

The #300 source is prepared in isolated `/private/tmp/clawmax-dependency-300`;
its update changes only the dev types and lockfile, retaining Archiver runtime v8.
The other seven remain pending; ordering may change with compatibility findings.
Dashboard owns validation before merge and RC98 inclusion.

## Feedback, triage and release gates

No new human acceptance tasks are introduced. Initial type/area/reported-impact
priority classification is complete for all **107 issues open at audit start**;
all original labels are preserved. #273 is closed with schema/live-PR evidence,
leaving **106 open, zero unlabelled**, verified after applying the labels.
[Complete issue table and limits](ISSUE_TRIAGE_2026-11-13.md).

The 54 open intake-linked issues retain `feedback`; the earlier 63-total provenance
map is unchanged. The last feedback audit found 73 reports, 52 open and 21 closed,
with links on every open report. These remain dated snapshots, not a new live
intake audit or complete topic resolution. Verify current-source closure criteria
and each separate feedback topic before resolving reports and notifying reporters.

Retain the chat record's RC98 gates: current CI/security dispositions, frontend
typing baseline, mobile Workflow navigation and late budget-read cancellation
regressions, active documentation cleanup, owning-team installed/provider evidence,
final-source full suite, exact version identity and matching public/private
amd64/arm64 image/smoke/persistence/source-boundary validation. Dependency bumps
alone do not establish release readiness or a complete security audit.
