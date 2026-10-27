# RC95 preview acceptance

Dashboard team • October 27, 2026 • Reviewers: Maximilien and Daniyar.

This source preview combines **13 Daniyar PRs**, including all eight new PRs
#320–#327, with four older PRs held for concrete reliability evidence. Review the
combined experience before we merge the integration branch and build official
RC95 images. The existing RC94 images do not contain these changes.

## Start the preview

Branch: `integration/rc95-daniyar`; [draft PR #304](https://github.com/Maximilien-ai/clawmax/pull/304).
The tested code checkpoint is `7f179387379add6ec412a6168f13aa5e88ee177b`.

Maximilien's running preview: **http://localhost:5182**. It retains its existing isolated workspace and plugin selection after the source refresh. Add your provider key through Model Integration and create a
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

## Quick acceptance list

Use the detailed P-number checks below when needed. Record your own result in
Extensions → Review or send `P# — pass/fail/not-run — version — notes`.

1. **P1–P2: Chat.** Send real messages, copy code/JSON, and follow up after a long reply.
2. **P3/P6: Templates and workflows.** Find the intended template, supply required inputs, and confirm the created workflow content.
3. **P4/P7: Controls.** Try config pin/keyboard behavior, agent Actions menus, and finishing the tour on a small screen.
4. **P5: Models.** Validate your provider key, create an agent from a template, and complete a real chat with its selected model.
5. **P8: Your event rehearsal.** Run your representative team/workflow on your own machine, restart the isolated dev session, and confirm its data/plugins remain.

These are preview acceptance checks. Burst-deployment readiness still requires the
exact public/combined images, architecture smoke checks, security-gate disposition,
and an on-prem/cloud rehearsal; a local preview pass does not establish those.

## Checks requiring reviewer acceptance

| ID | What to check and accept | reviewReason | Maximilien | Daniyar |
| --- | --- | --- | --- | --- |
| P1 | Ask an agent for fenced JSON, code and a text diagram. Formatting and indentation should remain readable. Copy each code block and the full message into a text editor; copied text should match what you intended to copy. Check the same controls at a narrow/mobile width. | human-judgment | Pending | Pending |
| P2 | In a conversation containing a long assistant reply, send a follow-up and try Resend. The actual provider/runtime should continue the conversation without a request-size error. Keep the reply/context size and any error in your report; do not include keys or private conversation content. | external-environment | Pending | Pending |
| P3 | Apply a team template containing required workflow inputs. Leave a required field blank: Deploy should explain what is missing and take you to that field. Fill it, leave an optional field empty, and apply. Open the created workflow and confirm the intended input values and neighboring fields were preserved. | human-judgment | Pending | Pending |
| P4 | Open Edit Agent Config using the agent's Actions menu. Tab and Shift-Tab should stay in the dialog. Escape closes it and returns focus to the Actions button. Verify pin/unpin, outside-click dismissal, scrolling, Save and Cancel still feel correct at desktop and mobile widths. | human-judgment | Pending | Pending |

| P5 | Validate the provider keys you will actually use in Model Integration (include Anthropic if available). Apply an agent template such as CEO with an offered model and complete a real chat. An existing unsupported snapshot should remain visibly selected until you explicitly replace it; saving unrelated edits must not silently change it. Report provider/model and outcome without keys. | external-environment | Pending | Pending |
| P6 | Find a useful agent/team/company template using categories, search and source/rating filters. Switch grid/list and reset filters. Accept that the results, labels and navigation make it easy to find the template you intended. | human-judgment | Pending | Pending |
| P7 | On your normal screen and a narrow window, use agent Actions near the top and bottom of the page in grid/list/table. All actions should be reachable without awkward scrolling; Escape/outside click should close the menu. Run the workspace tour and accept that Back/Finish and the final explanation are usable. | human-judgment | Pending | Pending |
| P8 | On your own machine, start this branch using the isolated dev launcher, add the key and team intended for Thursday, and run a representative chat plus workflow to completion. Stop with Ctrl-C and restart using the printed --root command. Confirm the agents, workflow result and enabled plugins remain and chat works again. Record machine/runtime and failures; do not substitute health checks for completion. | external-environment | Pending | Pending |

These eight checks are also selected in **Extensions → Review** in Maximilien’s
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

- [#320](https://github.com/Maximilien-ai/clawmax/pull/320): launcher origin precedence and actionable BYOK cross-origin errors; explicit origin boundaries remain enforced.
- [#321](https://github.com/Maximilien-ai/clawmax/pull/321): wait for API startup before mounting; integration adds bounded hung-request/body handling, cancellation and retry-screen checks.
- [#322](https://github.com/Maximilien-ai/clawmax/pull/322): structured Gateway status and clearer chat diagnostics; integration redacts status credentials and preserves isolated-launcher bypass. No host service was manipulated in validation.
- [#323](https://github.com/Maximilien-ai/clawmax/pull/323): reject confirmed unsupported OpenAI snapshots; integration restricts the inference to OpenClaw 2026.9.7 and leaves custom, unreadable/JSON5/include configurations and other versions unverified/selectable. This does not prove every offered model runnable; P5 supplies real-provider evidence.
- [#324](https://github.com/Maximilien-ai/clawmax/pull/324): correct Anthropic model-list query and distinguish request bugs from invalid credentials.
- [#325](https://github.com/Maximilien-ai/clawmax/pull/325): category filtering consistently covers agent and organization templates.
- [#326](https://github.com/Maximilien-ai/clawmax/pull/326): viewport-bounded Actions menus; integration updates the old source assertion and preserves config focus restoration.
- [#327](https://github.com/Maximilien-ai/clawmax/pull/327): keep the final tour step and Finish button reachable.

The originals remain open until the integration lands on main. Inclusion here is
not a claim that their GitHub PRs have already merged to main.

The four holds need engineering evidence before inclusion; Daniyar can help
produce fixes and reproductions, then we can update this preview and retest:

| PR | Holding inclusion | Evidence required |
| --- | --- | --- |
| [#227](https://github.com/Maximilien-ai/clawmax/pull/227) | Chat session Clear/Continue/Reset changes need lifecycle validation. | Old-store migration, reload/restart persistence, multiple tabs and active-turn behavior without losing or reviving messages. |
| [#228](https://github.com/Maximilien-ai/clawmax/pull/228) | Automatic Gateway management must respect process/service ownership. | Already-running Gateway, another installation's service, broker credentials, failure recovery and restart; never stop an unrelated service. |
| [#229](https://github.com/Maximilien-ai/clawmax/pull/229) | Streaming changes need real Gateway transport tests. | Reconnect, cancel, retry, duplicate-event handling and agreement between streamed and persisted final messages. |
| [#288](https://github.com/Maximilien-ai/clawmax/pull/288) | Legacy schedule cleanup discards failures and could leave duplicate schedules running. | Surface failed cleanup/surviving schedules, retain per-workflow failure isolation, and prove one scheduler across restart. |

## Engineering evidence and release gates

- Current code checkpoint **7f179387** passed **556/556** local integration,
  validation and coverage checks on October 27. Statements/lines **83.48%**
  (62,100/74,385), branches **81.04%** (20,161/24,876), functions **91.91%**
  (2,571/2,797). Log: `/private/tmp/rc95-review2-full-validation.log`.
  Live provider chat was skipped (`no-api-key`); it remains P1/P2/P5/P8 acceptance.
- Server TypeScript passed. Client TypeScript retains **291 existing diagnostics**,
  with zero new diagnostics against main after ignoring line-number shifts.
- Browser checks passed for chat/copy, workflow inputs, config focus, auth recovery,
  model selection, template filters, readiness failure/retry, nine menu/view/viewport
  combinations, and seven tour viewport/zoom cases. API fixtures are synthetic.
- Local preview source refresh preserved 1,138 workspace/home files byte-for-byte
  before restart. The refreshed API and visible version match, all five configured
  plugins open successfully, and their selection survives a browser reload. The backup is under
  the dev root's `refresh-backup-1793119643`; it is local and may contain private settings.
- [Code-checkpoint CI](https://github.com/Maximilien-ai/clawmax/actions/runs/40542535439)
  was still running when local validation finished. [CodeQL analyses](https://github.com/Maximilien-ai/clawmax/actions/runs/40542525760)
  completed, but the aggregate gate fails on the existing High CSRF
  [alert #705](https://github.com/Maximilien-ai/clawmax/security/code-scanning/705),
  also open on main. Origin-admission tests pass; this is not an alert dismissal
  or a security clearance. Dashboard owns disposition before release.
- README/setup/start/update prerequisites and the clean-source test helper are
  included. The earlier cold-source Podman test completed setup and authenticated
  readiness from main `5873b3dd`; it did not establish application-data restart
  persistence. Podman remains available to the on-prem team and was not touched.
- The earlier preview checkpoint `131c2a2e` passed 552/552 checks (statements/lines
  83.47%, branches 80.91%, functions 91.99%). Its P1–P4 records remain intact;
  no prior reviewer outcome was overwritten by this refresh.
- No RC95 release tag, image build, deployment or stable promotion has been made.

## Short handoff to Daniyar

> RC95 preview is ready for source testing on `integration/rc95-daniyar` (PR #304),
> code checkpoint `7f179387`. It includes all eight new PRs #320–#327 plus the five
> earlier fixes. Clone that branch and run `./SYSTEM/local-dev.sh`; keep the
> terminal open, use the printed URL, and Ctrl-C stops it. Use the Quick acceptance
> list above and report P-number, version, pass/fail/not-run and brief notes.
> Four older PRs remain held: #227 session persistence, #228 Gateway ownership,
> #229 streaming recovery, #288 scheduler cleanup failures. Their evidence needed
> for inclusion is listed above. This is a local preview; deployment images follow
> acceptance and release gates.
