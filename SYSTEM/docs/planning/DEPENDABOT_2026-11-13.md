# Dependency maintenance — November 13

#227 is owner-accepted and merged as `9ad021b08d24d2b5c0cdbc719f28fe5587976274`;
#223 is closed. Its final CI passed; the exact product/test source passed 574/574
local integration/validation/coverage checks. [Acceptance receipt](https://github.com/Maximilien-ai/clawmax/pull/227#issuecomment-6847518580).
The [chat checklist](RC98_CHAT_ACCEPTANCE_2026-11-12.md) retains the engineering
evidence and limitations. Stable remains v1.9.9; RC98 has not been cut.

## First batch and merge order

1. [#294 — download-artifact v8](https://github.com/Maximilien-ai/clawmax/pull/294):
   refreshed from merged main `9ad021b0` without rewriting remote history.
   Product CI change `52bca56a` adds a real hosted v4-upload/v8-download round trip
   that verifies extraction layout and identical bytes, using only synthetic
   evidence and read permissions. The normal required test and artifact job must
   both pass before merge. No human product acceptance is needed.
2. [#297 — upload-artifact v7](https://github.com/Maximilien-ai/clawmax/pull/297):
   refresh after #294 merges, upgrade the round-trip producer too, and preserve
   zipped evidence naming/layout. Pending implementation/validation.
3. [#295 — build-push-action v7](https://github.com/Maximilien-ai/clawmax/pull/295):
   refresh after preceding merges; verify runner/runtime and build inputs. Pending
   implementation/validation. No published-image or multiarchitecture claim yet.

Strict branch protection requires a fresh main base and one approving review.
Refresh the next PR after each merge; this order does not waive that requirement.
Use existing PRs, without force pushes or blanket merges.

## #294 evidence and compatibility

- Local: **7 image/mirror tests**, promotion contract, OpenClaw Docker packaging
  contract and **8 lifecycle smoke assertions** pass. All **8 workflow YAML files**
  parse; new inline shell syntax and read-only permissions pass. Server TypeScript
  passes. The full application suite is not rerun for this workflow-only change;
  the prior 574-check result belongs to the identified chat source.
- Hosted CI is pending. Normal CI typically takes **43 minutes**; the artifact
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
| #300 | Archiver types major | Archive/ZIP route and type compatibility |
| #301 | c8 major | Coverage runner, output and failure propagation |
| #299 | concurrently major | Local start/stop and child-process cleanup |
| #303 | dotenv major | Env precedence, credential parsing and cold-start isolation |
| #302 | react-markdown major | Markdown rendering/security, chat/docs and responsive views |

All eight remain pending; their ordering may change with compatibility findings.
Dashboard owns validation before merge and RC98 inclusion.

## Feedback, triage and release gates

No new human acceptance tasks are introduced. Continue all-open-issue type/area/
priority triage (108-issue snapshot, initially 103 unlabelled), then reconcile any
remaining feedback topics with their issue states and notify reporters accurately.
`feedback` already labels 63 confirmed intake-linked issues; the last audit found
73 reports, 52 open and 21 closed, with links on every open report. These are dated
snapshots, not a claim of a new live intake audit or complete topic resolution.

Retain the chat record's RC98 gates: current CI/security dispositions, frontend
typing baseline, mobile Workflow navigation and late budget-read cancellation
regressions, active documentation cleanup, owning-team installed/provider evidence,
final-source full suite, exact version identity and matching public/private
amd64/arm64 image/smoke/persistence/source-boundary validation. Dependency bumps
alone do not establish release readiness or a complete security audit.
