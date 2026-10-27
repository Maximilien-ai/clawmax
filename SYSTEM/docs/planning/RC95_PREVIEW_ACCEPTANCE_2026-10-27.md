# RC95 preview acceptance

Dashboard team • October 27, 2026 • Reviewers: Maximilien and Daniyar.

This source preview combines five of the nine remaining Daniyar PRs. Review the
combined experience before we merge the integration branch and build official
RC95 images. The existing RC94 images do not contain these changes.

## Start the preview

Branch: `integration/rc95-daniyar`; [draft PR #304](https://github.com/Maximilien-ai/clawmax/pull/304).
The tested code checkpoint is `131c2a2ebe7351860d5e8d4417d5c8e01b3b2c06`.

Maximilien's running preview: **http://localhost:5182**. It has its own initially
empty workspace. Add your provider key through Model Integration and create a
disposable agent or apply a team template. Host agents and keys are not imported. Its existing local extension sources
are explicitly attached, and the five configured product plugins are available
under Extensions. This local configuration is separate from the public checkout.

Daniyar can use a clean clone on his own machine:

```sh
git clone --branch integration/rc95-daniyar https://github.com/Maximilien-ai/clawmax.git clawmax-test
cd clawmax-test
DASHBOARD_PORT=3009 DASHBOARD_CLIENT_PORT=5182 ./SYSTEM/local-dev.sh
```

Use the Node version documented in the README. The launcher runs setup from a
committed-source snapshot, prepares the branch-tested OpenClaw runtime, and opens
the browser after readiness. Keep that terminal running. **Ctrl-C stops both
Dashboard and its dedicated Gateway.** Reuse its printed `--root` command to keep
your test data. For newer source, pull this branch and launch without `--root`.
No Podman VM is needed. Lifecycle and Review are included by default under
Extensions. To add other authorized local plugins, use the README's explicit
`--with-plugins` option; those paths and your selection persist for the dev root.

The visible version should be `2.0.0-test-rc95-review1.<snapshot SHA>`. Record that
version, browser, runtime/model and your result for each check. Each reviewer
records their own pass/fail/not-run; a missing provider is not a pass.

## Checks requiring reviewer acceptance

| ID | What to check and accept | reviewReason | Maximilien | Daniyar |
| --- | --- | --- | --- | --- |
| P1 | Ask an agent for fenced JSON, code and a text diagram. Formatting and indentation should remain readable. Copy each code block and the full message into a text editor; copied text should match what you intended to copy. Check the same controls at a narrow/mobile width. | human-judgment | Pending | Pending |
| P2 | In a conversation containing a long assistant reply, send a follow-up and try Resend. The actual provider/runtime should continue the conversation without a request-size error. Keep the reply/context size and any error in your report; do not include keys or private conversation content. | external-environment | Pending | Pending |
| P3 | Apply a team template containing required workflow inputs. Leave a required field blank: Deploy should explain what is missing and take you to that field. Fill it, leave an optional field empty, and apply. Open the created workflow and confirm the intended input values and neighboring fields were preserved. | human-judgment | Pending | Pending |
| P4 | Open Edit Agent Config using the agent's Actions menu. Tab and Shift-Tab should stay in the dialog. Escape closes it and returns focus to the Actions button. Verify pin/unpin, outside-click dismissal, scrolling, Save and Cancel still feel correct at desktop and mobile widths. | human-judgment | Pending | Pending |

These four checks are also selected in **Extensions → Review** in Maximilien’s
running preview, under release `2.0.0-test-rc95`. Other machines can use this file.

Report failures as: `P# — version — runtime/model — steps — expected — actual`.
Keep RC94 results in their original release files; this is the RC95 review queue.

## Included and held PRs

Included in this preview branch, not yet merged into main:

- [#219](https://github.com/Maximilien-ai/clawmax/pull/219): preserve chat code/JSON/diagrams and add copying; integration also protects fenced error examples from diagnostic rewriting.
- [#252](https://github.com/Maximilien-ai/clawmax/pull/252): accept bounded long chat context after authentication.
- [#258](https://github.com/Maximilien-ai/clawmax/pull/258): required workflow fields; integration fixes blank-field parsing, optionality and literal replacement values.
- [#268](https://github.com/Maximilien-ai/clawmax/pull/268): config-dialog keyboard access, integrated with the existing pin/dismissal hook and focus containment.
- [#270](https://github.com/Maximilien-ai/clawmax/pull/270): recover transient sign-in startup failures; integration bounds and cancels retries and displays a manual recovery action.

The four holds need engineering evidence before inclusion; Daniyar can help
produce fixes and reproductions, then we can update this preview and retest:

| PR | Holding inclusion | Evidence required |
| --- | --- | --- |
| [#227](https://github.com/Maximilien-ai/clawmax/pull/227) | Chat session Clear/Continue/Reset changes need lifecycle validation. | Old-store migration, reload/restart persistence, multiple tabs and active-turn behavior without losing or reviving messages. |
| [#228](https://github.com/Maximilien-ai/clawmax/pull/228) | Automatic Gateway management must respect process/service ownership. | Already-running Gateway, another installation's service, broker credentials, failure recovery and restart; never stop an unrelated service. |
| [#229](https://github.com/Maximilien-ai/clawmax/pull/229) | Streaming changes need real Gateway transport tests. | Reconnect, cancel, retry, duplicate-event handling and agreement between streamed and persisted final messages. |
| [#288](https://github.com/Maximilien-ai/clawmax/pull/288) | Legacy schedule cleanup discards failures and could leave duplicate schedules running. | Surface failed cleanup/surviving schedules, retain per-workflow failure isolation, and prove one scheduler across restart. |

## Engineering evidence and release gates

- Code checkpoint above passed **552/552** local integration/validation checks
  with coverage on October 27: statements/lines **83.47%** (61,690/73,900),
  branches **80.91%** (19,918/24,615), functions **91.99%** (2,550/2,772).
  Native isolated Gateway; no host service or Podman operations. Live model chat
  was skipped because the isolated test environment had no provider key; P1/P2
  remain independent acceptance.
- Server TypeScript passed. Client TypeScript retains **291 existing diagnostics**,
  with zero new diagnostics against main after ignoring line-number shifts.
- Automated browser checks passed at desktop/mobile widths for chat copying,
  required-field navigation, config focus/dismissal and auth startup/error/retry.
  Synthetic fixtures establish UI behavior, not real provider execution.
- README/setup/start/update prerequisites and the clean-source test helper are
  included. The earlier cold-source Podman test completed setup and authenticated
  readiness from main `5873b3dd`; it did not establish application-data restart
  persistence. Its test VM is stopped and Podman has been returned to on-prem.
- [Candidate CI](https://github.com/Maximilien-ai/clawmax/actions/runs/40472292193)
  was still running at this checkpoint. [CodeQL analyses](https://github.com/Maximilien-ai/clawmax/actions/runs/40472286118)
  completed, but the aggregate gate fails on the existing High CSRF
  [alert #705](https://github.com/Maximilien-ai/clawmax/security/code-scanning/705),
  also open on main since October 1. Existing origin-admission tests pass;
  this is not a security clearance or an alert dismissal. Dashboard owns its
  disposition before RC95 release, along with CI completion and reviewer acceptance.
- Launcher follow-up `aff1d421` adds explicit, persistent external-plugin opt-in;
  all nine launcher tests pass. The running app keeps the tested code checkpoint
  and its existing workspace while loading the explicitly selected local plugins.
- No RC95 release tag, image build, deployment or stable promotion has been made.
