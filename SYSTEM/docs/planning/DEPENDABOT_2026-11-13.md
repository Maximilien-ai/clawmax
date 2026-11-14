# Dependency maintenance — November 13

Continuation: [November 14 checkpoint](DEPENDABOT_2026-11-14.md). #302 is now
merged as `2979a628`; the remaining queue is #384, #298 and #296. Detailed pending
states below are retained as the November 13 evidence snapshot.

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
| #303 | dotenv major + live-test repair | Merged `cbd1ee68` after 577/577 local checks, [required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43524334234) and CodeQL passed on `c83876fb` |
| #302 | react-markdown major | Prepared `318a25e5` on merged #303: eight rendering tests and eight browser cases pass on both versions; server types/build/lint/audit pass, frontend baseline unchanged; final CI pending |

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
CI and CodeQL passed. #303 subsequently merged as `cbd1ee68`. The remaining four
updates are #302, #384, #298 and #296; order can change with compatibility findings.

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
CI is approximately **43 minutes**. Final source `c83876fb` passed **577/577**
local integration/validation/coverage checks, including the real provider lifecycle
and group/community isolation. [Required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43524334234)
and CodeQL passed before merge `cbd1ee68`. The primary checkout is synced to that
merged main and its installed dotenv matches the lockfile.

## #302 Markdown renderer compatibility

The existing PR upgrades react-markdown **9.1.0 → 10.1.0**. It retains current
dotenv/c8/launcher/types updates and is refreshed onto merged #303 without force
pushes. [Upstream v10 removes the component-level `className` prop](https://github.com/remarkjs/react-markdown/releases/tag/10.0.0);
the inspected production call sites already use wrappers or component mappings.
No product layout or renderer configuration changes are needed.

[Eight rendering regression tests](../../dashboard/client/src/lib/markdownRendering.test.tsx)
pass on both versions: production document GFM/frontmatter handling, raw HTML
escaping, unsafe URL/image rejection, preserved safe links, explicit workspace-file
URLs, workflow image suppression, partial code fences and incomplete/empty input.
This is a separate registered system-suite check. Existing code-copy and document
viewer tests also pass. Server TypeScript, lint, production build and the unchanged
dependency audit policy pass. Strict frontend TypeScript reports **290 existing
diagnostics on both versions, with zero added or removed lines**; it is not green.
The policy command exits 0. The recorded `npm audit --json` exits 1 for **14 lower
severity advisories (4 Low, 10 Moderate), zero High/Critical**, across a reported
591-dependency inventory (336 production, 256 development, 32 optional; npm's
categories overlap). Evidence: `/private/tmp/clawmax-302-audit{.log,.json}`.
Dashboard owns lower-severity follow-up before stable 2.0; this dependency
checkpoint is not a complete security audit and does not change the audit policy.

[Browser regression](../../dashboard/scripts/markdown-rendering-browser.test.mjs)
mounts production AgentChatPanel and MarkdownDocumentViewer with synthetic content,
intercepts local APIs and blocks external destinations. Eight cases on each version
cover light/dark at 1440/390px, formatted tables/tasks, safe links, real code-copy
bytes, workspace-document navigation, source/preview switching and absence of
page-wide horizontal overflow. Fixtures explicitly use standards mode and are
removed afterward. Screenshots/logs: `/private/tmp/clawmax-302-browser/` and
`/private/tmp/clawmax-302-browser-{baseline,candidate}.log`.

No independent human acceptance is required. Final current-head required CI and
CodeQL remain merge gates; full hosted CI normally takes **33–43 minutes**. The
577/577 live-provider result belongs to merged #303, whose server source is
unchanged by this renderer update; it is not a new full-local #302 result.

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
