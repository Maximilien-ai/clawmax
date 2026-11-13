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
   **merged** as `4e4c11ef` after final head `5880bb7d` passed required focused
   CI, artifact transport, both synthetic platform exports and CodeQL. No release
   image is published.

Strict branch protection requires a fresh main base and one approving review.
Refresh the next PR after each merge; this order does not waive that requirement.
Use existing PRs, without force pushes or blanket merges.

## Prepared update evidence

| PR | Tested source | Hosted action checks | Normal CI |
| --- | --- | --- | --- |
| #294 | `02395f29` | [Passed v4 → v8 round trip](https://github.com/Maximilien-ai/clawmax/actions/runs/43391500989) | [Passed before merge](https://github.com/Maximilien-ai/clawmax/actions/runs/43391500968) |
| #297 | `c33bfc5f` | [Passed v7 → v8 round trip](https://github.com/Maximilien-ai/clawmax/actions/runs/43399644873) | [Passed before merge](https://github.com/Maximilien-ai/clawmax/actions/runs/43399644860) |
| #295 | `5880bb7d` | [Passed transport and both exports](https://github.com/Maximilien-ai/clawmax/actions/runs/43401590469) | [Passed before merge](https://github.com/Maximilien-ai/clawmax/actions/runs/43401590660) |

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

## Next dependency checkpoint

| PR | Scope | Required evidence before merge |
| --- | --- | --- |
| #384 | Node 24.22 Docker base | Align CI Node pin; build/runtime and version contracts |
| #296 | Cognee OpenClaw plugin | Compatibility with pinned OpenClaw 2026.9.7 and packaging |
| #298 | 18 minor/patch packages | Lockfile, dependency audit, types/build and affected tests |
| #300 | Archiver types major | Merged `2337cd96` after [full required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43403233466) and CodeQL passed on `93ad6e1a` |
| #301 | c8 major | Merged `513349eb` after [required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43461950201) and CodeQL passed on `c9388b21` |
| #299 | concurrently major | Merged `4dffd39c` after [required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43445911233) and CodeQL passed on `7b479c73` |
| #303 | dotenv major + live-test repair | Prepared dotenv 18.0.8; six provider parser cases and 12 lifecycle oracle cases pass; final local integration/validation/coverage and current-head CI pending |
| #302 | react-markdown major | Markdown rendering/security, chat/docs and responsive views |

#300 is complete. Its Archiver runtime remains v8, now matched by the v8 types.

Completed #299 was refreshed onto `2337cd96` in isolated
`/private/tmp/clawmax-dependency-299`. Installed concurrently **10.0.6** was tested
with Node **24.19.0** (upstream requires Node >=22); production lock entries are
unchanged. The repository uses the CLI with explicit comma-separated names and
colors, not the removed API options. [Upstream release notes](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.0).

Twelve local launcher tests pass, including three new real `npm run dev` fixture
cases: both named commands succeed, a failing child cannot report success, and
owned npm/concurrently/worker descendants stop while an unrelated process remains.
The new suite is registered as its own check in `SYSTEM/test.sh`. Lint, server
types, production build, shell syntax and the existing dependency-audit policy pass.
No live provider calls or full local Dashboard-suite rerun was required for these
focused checks; required current-head CI still selects full validation for this
dependency/shared-helper diff. Normal duration is approximately 43 minutes.

#299 merged as `4dffd39c` after its required CI and CodeQL passed.

Next #301 is refreshed onto that main in isolated `/private/tmp/clawmax-dependency-301`.
Its c8 v12 lockfile retains the merged types/launcher updates and leaves production
lock entries unchanged. Node 24.19.0 satisfies the stricter yargs requirement;
the project's declared Node >=22.19.0 range remains compatible.
[Upstream c8 release notes](https://github.com/bcoe/c8/releases/tag/v12.0.0).

[Five coverage contracts](../../coverage-tool.test.mjs) pass against both installed
c8 11.0.0 and 12.0.0: Bash/nested Node collection, text/JSON/HTML reporters,
unexecuted-file inclusion, preserved failure exit code 7, failing branch thresholds
and TypeScript source maps. The suite is registered as a distinct required test.
Lint, server types, production build, test-runner syntax and the unchanged audit
policy pass. Required CI still runs the full runner with the new collector; no
extra local live-provider run or release readiness is claimed.

No manual product acceptance is needed. #301 merged as `513349eb` after required
CI and CodeQL passed. The remaining five updates are #303, #302, #384, #298
and #296; order can change with compatibility findings.

## #303 and intermittent live chat test repair

The existing dotenv PR retains separate dependency, parser-test and lifecycle-test
commits. It is refreshed onto merged #301 without force pushes. Installed dotenv
**18.0.8** passes the actual Vite build with a synthetic ignored `.env`, Dashboard
env/precedence tests, and six provider-key parsing cases (three added for BOM/export/
CRLF/quoted bytes, namespace/interpolation boundaries and nonmutation). No operator
credentials are copied into the worktree.

The owner's main-source run failed only `Live chat Clear/History/Continue context`:
the agent answered with a session-ID suffix instead of `UNKNOWN`. The old question
asked broadly for an opaque code. Its original random code has the distinct format
`CTX` plus 16 uppercase hexadecimal characters, so the reported answer does not by
itself demonstrate retained old context. The unfixed local reproduction also
passed this live check; final full-suite results remain separate evidence.

[The repaired live probe](../../test-chat-lifecycle.cjs) names a conversation-only
assignment and asks the same value-free question in fresh and continued sessions.
It still requires exactly `UNKNOWN` for fresh and the original random value after
Continue. It additionally verifies a different fresh native session, absence of
the old code from the fresh transcript, exact original-ended archive selection,
exact restored transcript and original native-session restoration. It never
accepts arbitrary text merely because it differs from the old code.

[Twelve HTTP regression cases](../../test-chat-lifecycle.test.cjs) pass, including
the reported session-ID answer, real context leakage, reused session, repopulated
history, wrong restoration, runtime errors and workspace-mutation refusal. This
is a distinct registered suite in `SYSTEM/test.sh`; its scripted replies test the
oracle and do not substitute for the real provider lifecycle check. Full final
local integration/validation/coverage is expected **12–15 minutes**; hosted full
CI is approximately **43 minutes**. Neither pending result is reported as green.

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
