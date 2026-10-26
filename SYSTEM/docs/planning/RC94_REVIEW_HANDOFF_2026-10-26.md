# RC94 review handoff — October 26, 2026

From: Dashboard team / Maximilien. Reviewers: Daniyar (`zsz13`) and Maximilien.
Status: **local-dev acceptance first**. Official RC94 and deployment images are
reserved until both reviewers validate the candidate. No production rollout is
authorized by this handoff.

## Candidate and how to test

Public source: `1729992e9555002a8d34e91b644ecf9d153b27bb`, branch
`integration/rc94-daniyar`, [integration PR #291](https://github.com/Maximilien-ai/clawmax/pull/291).
Eighteen of Daniyar's 27 PRs are combined here; **zero have landed on main and
nine remain held**. Review the combined behavior, not each PR in isolation.

Get started in a clean development checkout with Node/npm and your configured
OpenClaw/provider runtime:

```sh
git fetch origin integration/rc94-daniyar
git switch --detach 1729992e9555002a8d34e91b644ecf9d153b27bb
DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/start.sh --follow
```

Open **http://localhost:5174**, select a disposable workspace, and run A1–A12
below. Maximilien can use the same URL in his existing checkout.
Record the source SHA or image digest, displayed version, OS/architecture,
browser, runtime, and model. Keep API keys and participant conversations out of
reports. Do not test deletion against valuable agents. A missing runtime is
`not run`, rather than a pass.

## What is included

| Area | Included changes |
| --- | --- |
| Agent/workflow reliability | [#246](https://github.com/Maximilien-ai/clawmax/pull/246): bulk delete uses single-delete safeguards. [#248](https://github.com/Maximilien-ai/clawmax/pull/248): timezone validation and per-workflow scheduler sync isolation. [#250](https://github.com/Maximilien-ai/clawmax/pull/250): Stop terminates Claude Code/Droid workflow steps. [#256](https://github.com/Maximilien-ai/clawmax/pull/256): manual workflow saves and handoff settings. |
| Model pricing | [#254](https://github.com/Maximilien-ai/clawmax/pull/254): use the most specific pricing entry. |
| Layout and interaction | [#260](https://github.com/Maximilien-ai/clawmax/pull/260): Builder scrolling. [#262](https://github.com/Maximilien-ai/clawmax/pull/262): single result-pane toggle. [#264](https://github.com/Maximilien-ai/clawmax/pull/264): template card alignment. [#266](https://github.com/Maximilien-ai/clawmax/pull/266): Forward-menu dismissal. [#272](https://github.com/Maximilien-ai/clawmax/pull/272): responsive top bar. |
| Input and filesystem boundaries | [#276](https://github.com/Maximilien-ai/clawmax/pull/276): reject JavaScript front matter. [#278](https://github.com/Maximilien-ai/clawmax/pull/278): workflow/execution IDs. [#280](https://github.com/Maximilien-ai/clawmax/pull/280): agent/archive IDs. [#282](https://github.com/Maximilien-ai/clawmax/pull/282): path-segment names. [#284](https://github.com/Maximilien-ai/clawmax/pull/284): protect workspace `.git`. [#286](https://github.com/Maximilien-ai/clawmax/pull/286): unauthenticated development client stays on loopback. [#290](https://github.com/Maximilien-ai/clawmax/pull/290): provider-key handling and model-cache isolation. These changes are not complete security clearance. |
| Dependency maintenance | [#274](https://github.com/Maximilien-ai/clawmax/pull/274): Dependabot configuration; additional dependency updates remove the reproduced High production advisory. |

Additional acceptance-feedback improvements: remembered pin beside X on agent
details/config/chat, searchable group add/remove with persistence, card group
count scrolls the existing details body to Groups while keeping the frame fixed,
and model suggestions start collapsed in Edit Agent Config and AI creation.

## What each person should validate

The full criteria and preserved results are in
[RC94 local acceptance](RC94_LOCAL_ACCEPTANCE_2026-10-24.md).
These checks require human judgment or a real external runtime. Engineering
owns automated tests, image identity, architecture, and security review.

| Check | reviewReason | Daniyar | Maximilien |
| --- | --- | --- | --- |
| A1: details/config pin, outside click, Escape/X, remembered preference | human-judgment | Independently test | Passed October 25 |
| A2: pinned modal/right-side chat; nested History/Forward dismissal | human-judgment | Independently test | Passed October 25 |
| A3: two real chat turns; reopen/restart; history and another reply | external-environment | Test | Test |
| A4: save manual workflow settings; run; actual Stop for installed Claude/Droid | external-environment | Test available runtimes | Test available runtimes |
| A5: valid timezone and next tick; invalid timezone refused without breaking other workflows | external-environment | Test | Test |
| A6: bulk-delete disposable agents, including an active turn; verify after restart | external-environment | Test | Test |
| A7: real BYOK discovery/chat and isolation between credentials | external-environment | Test | Test |
| A8: desktop/mobile Builder, long content/cards/top bar, Forward interactions | human-judgment | Test | Test |
| A9: searchable group add/remove; reload; preserve other memberships | external-environment | Independently test | Passed October 25 |
| A10: Edit Agent Config suggestions collapsed; expanding never changes model | human-judgment | Independently test | Passed October 25 |
| A11: AI-created agent suggestions collapsed; controls remain available on expand | human-judgment | Independently test | Passed October 25 |
| A12: card group count opens the same details panel at Groups; header/footer/page remain fixed | human-judgment | Test | Retest corrected jump |

For each result, return:

```text
Reviewer:
Source SHA or image digest:
Displayed version / OS / architecture / browser:
Runtime and model (no keys):
A1–A12: pass / fail / not run, with a brief note for each
Failures: steps, expected result, actual result, redacted screenshot if useful
```

Maximilien still has **A3, A4, A5, A6, A7, A8, and A12** to accept. Daniyar
should independently test all twelve. A5 does not claim to fix duplicate
Gateway cron execution; #288 is excluded.

## Nine PRs still held

These PRs are excluded from this candidate. Requested fixes/evidence should be
added to their own PRs; Dashboard will review and retest before integration.
PR update dates were checked October 26; none changed after the recorded review.

| PR | What holds it | What Daniyar should provide |
| --- | --- | --- |
| [#219 — preserve chat code/JSON/diagrams and Copy](https://github.com/Maximilien-ai/clawmax/pull/219) | The communication-error summarizer can still mistake fenced code containing runtime-error phrases for an actual error. | Preserve that code and add a regression containing error-like phrases inside a fence. |
| [#227 — consistent chat state across polls/Clear/Reset/Continue](https://github.com/Maximilien-ai/clawmax/pull/227) | State and migration behavior needs real lifecycle evidence. | Multi-tab Clear/Continue, active-turn handling, restart persistence, and old-store migration results. |
| [#228 — Dashboard-managed loopback Gateway](https://github.com/Maximilien-ai/clawmax/pull/228) | Gateway startup/shutdown ownership and interaction with existing services are not established. | Passing CI and acceptance for startup/stop ownership, an already-running service, secret-broker behavior, and restart. |
| [#229 — live Gateway chat streaming](https://github.com/Maximilien-ai/clawmax/pull/229) | The real Gateway streaming lifecycle needs validation. | Reconnect, cancellation, retry, duplicate-event, and final-response consistency results against a real Gateway. |
| [#252 — long prior replies in chat sends](https://github.com/Maximilien-ai/clawmax/pull/252) | Request-size and authentication boundaries lack HTTP-level regression coverage. | Tests for long allowed bodies, oversized-body rejection, and authentication before parsing. |
| [#258 — required workflow inputs before Deploy](https://github.com/Maximilien-ai/clawmax/pull/258) | The required-field regex skips a completely blank `- **Event name:**` line. | Fix blank and whitespace-only values and demonstrate both with regressions. |
| [#268 — keyboard-accessible Edit Agent Config](https://github.com/Maximilien-ai/clawmax/pull/268) | Focus containment and keyboard behavior lack regression coverage. | Focus containment and keyboard tests, including dismissal and focus restoration. |
| [#270 — retry sign-in while API starts](https://github.com/Maximilien-ai/clawmax/pull/270) | Persistent 502–504 responses can retry indefinitely without an actionable error. | A bounded failure/recovery state and cancellation regressions. |
| [#288 — Dashboard as sole scheduled-workflow runner](https://github.com/Maximilien-ai/clawmax/pull/288) | Workflow deletion discards legacy-cron cleanup failures, potentially leaving a schedule behind. | Surface surviving schedules/cleanup failures and retain #248's per-workflow sync isolation; regression and runtime evidence. |

## Engineering evidence and promotion boundary

Candidate CI passed:
https://github.com/Maximilien-ai/clawmax/actions/runs/40173948664.
October 26 full local integration/validation/coverage: **547/547 passed, zero
failed** on the exact source above. Statements/lines 83.18% (60981/73311),
branches 80.65% (19566/24259), functions 91.81% (2512/2736). Cached run estimate
10–20 minutes; observed about 11 minutes. The command and previous results are
preserved in the linked acceptance file. Deployment-image creation is deferred
until local acceptance; no image pair is reported ready.
Saved browser regressions passed on October 26 for panel pinning/dismissal,
group membership/direct scrolling, and AI-creation disclosures at desktop and
mobile widths. The local browser and `/api/system` version were verified.

The dependency audit passes with zero High/Critical advisories. This is separate
from the unresolved PR CodeQL gate: **20 findings (2 critical, 18 high)**,
plus the separately tracked six RC93 findings. Dashboard owns disposition before
merge/promotion; Daniyar's help tracing the affected changes is requested.
Full client TypeScript retains 291 baseline diagnostics, with no new diagnostics
in the recorded comparison. No security gate or required approval was bypassed.

After both reviewers return results, fix and retest any failures, disposition
security findings, and obtain the required PR approval. Only then select the
official RC94 source, rerun the required release checks, and build matching
public/combined images for on-prem and cloud validation. Verify both architectures,
registry smoke tests, packaged identity, plugin discovery, restart persistence,
and the public/private boundary before deployment handoff. Building an image
does not establish an on-prem or cloud deployment.

## Archived image-build attempt

Before the local-dev-first clarification, review tag
`v2.0.0-test-rc94-review1` was created at the exact source above, and
[public image run 40335104423](https://github.com/Maximilien-ai/clawmax/actions/runs/40335104423)
was started. Cancellation was requested following Maximilien's clarification;
the prerelease was returned to draft. No combined image was dispatched. This
attempt is not official RC94 or deployment evidence; do not use any partial
architecture tags it might have produced.
