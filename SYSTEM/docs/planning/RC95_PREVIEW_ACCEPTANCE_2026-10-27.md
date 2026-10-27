# RC95 preview acceptance

Dashboard team • October 27, 2026 • Reviewers: Maximilien and Daniyar.

This source preview combines **13 Daniyar PRs**, including all eight new PRs
#320–#327, with four older PRs held for concrete reliability evidence. Review the
combined experience before we merge the integration branch and build official
RC95 images. The existing RC94 images do not contain these changes.

## Start the preview

Branch: `integration/rc95-daniyar`; [draft PR #304](https://github.com/Maximilien-ai/clawmax/pull/304).
Current code checkpoint: `1b1f20ba`. The complete local suite passed **557/557** on `de5fe817`; the subsequent two icon-only replacements passed desktop/mobile visual checks and icon tests, with no new TypeScript diagnostics. Repeat the complete gate on the eventual image candidate before cutting RC95.

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

## P5 retest after acceptance feedback

Maximilien reported P5 **failed** on `7f179387`: AI creation selected
`openai/o3-2025-04-16` despite a saved `openai/gpt-5.4-mini` new-agent default.
Do not mark that earlier run passed. Fixes `974d4018` and `d32199cc` preserve the
saved default even when discovery omits it, prevent AI suggestions from replacing
an explicit choice, and wait for default loading before generation. They also
warn about confirmed unsupported models in agent configuration and retain the
chat link to edit the model. Custom profiles and unverified runtime versions
remain conservative exceptions; this is not a guarantee for every provider model.

Retest on **`2.0.0-test-rc95-review1.1b1f20ba`**:

1. Save GPT-5.4 Mini as the new-agent default; AI-create another disposable agent.
   Confirm its saved model remains GPT-5.4 Mini and complete a real chat.
2. Open the earlier unsupported agent's configuration. Confirm the warning,
   choose GPT-5.4 Mini explicitly, Save, and retry chat. Opening the dialog alone
   must not modify the model. The warning should disappear after the saved repair.
3. Record a new result with this version; preserve the previous failed result.

A future Doctor model-repair action is tracked separately: preview the saved
default or a user-selected model and require an explicit apply action.

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
| P5 | Validate the provider keys you will actually use in Model Integration (include Anthropic if available). Apply an agent template such as CEO with an offered model and complete a real chat. An existing unsupported snapshot should remain visibly selected until you explicitly replace it; saving unrelated edits must not silently change it. Report provider/model and outcome without keys. | external-environment | Failed on 7f179387; retest requested | Pending |
| P6 | Find a useful agent/team/company template using categories, search and source/rating filters. Switch grid/list and reset filters. Accept that the results, labels and navigation make it easy to find the template you intended. | human-judgment | Pending | Pending |
| P7 | On your normal screen and a narrow window, use agent Actions near the top and bottom of the page in grid/list/table. All actions should be reachable without awkward scrolling; Escape/outside click should close the menu. Run the workspace tour and accept that Back/Finish and the final explanation are usable. | human-judgment | Pending | Pending |
| P8 | On your own machine, start this branch using the isolated dev launcher, add the key and team intended for Thursday, and run a representative chat plus workflow to completion. Stop with Ctrl-C and restart using the printed --root command. Confirm the agents, workflow result and enabled plugins remain and chat works again. Record machine/runtime and failures; do not substitute health checks for completion. | external-environment | Pending | Pending |
| P9 | Save GPT-5.4 Mini as the new-agent default, then AI-create an agent and verify its saved model and real chat. Open the earlier unsupported agent: confirm a clear model warning, explicitly select GPT-5.4 Mini, Save, and retry chat. The warning should clear after repair; merely opening config must not change the model. | external-environment | Passed model/default repair on d32199cc per Maximilien; open-panel refresh follow-up P10 | Pending |

| P10 | Keep the agent details panel open, change its model through Edit Agent Config, and Save. The open panel should immediately show the saved model without closing/reopening it. | human-judgment | Pending | Pending |
| P11 | AI-create a managed weekly workflow with your available agents. Confirm content, schedule, timezone, target agents and Owner Agent are populated appropriately; edit if needed, Create, and reopen the saved workflow. Required-field errors must be visible and take you to the field. Accept the generated choices for your intended workflow. | human-judgment | Pending (previous AI Create failed without an owner; fixed in 3224f474) | Pending |
| P12 | Organization → Create Community → describe its purpose and members → Generate draft. Review/edit the name, description and selected existing agents; Create, reload and inspect membership. Repeat for Create Group, optionally choosing that community. Accept that the AI choices and editable draft are useful, and neither creation action disappears after creating the first item. | human-judgment | Pending | Pending |

These twelve checks are also selected in **Extensions → Review** in Maximilien’s
running preview, under release `2.0.0-test-rc95`. Other machines can use this file.

Report failures as: `P# — version — runtime/model — steps — expected — actual`.
Keep RC94 results in their original release files; this is the RC95 review queue.

## Using Extensions → Review

1. Expand **Extensions** in the sidebar and open **Review**. Lifecycle and Review
   are public plugins included in a clean local preview. Other extensions depend
   on the plugins explicitly configured for that instance.
2. On a fresh workspace, open **Suggested** and choose **Start 2.0.0-test-rc95 checklist**.
   This creates your own P1–P12 checks. Select that release in **Active**; old releases
   belong in Archived. Maximilien's existing checks and notes remain intact.
3. Open each check, follow its instructions, and set the outcome to passed, failed,
   blocked or pending as appropriate. Include your name, exact preview version,
   browser/runtime/model, and useful notes/evidence. Never overwrite another
   tester's results or include credentials/private conversations.
4. Choose **Actions → Export / submit release review**. Enter your name/email and
   select Local, Cloud or On-prem. To email, set **Send to** to `max@maximilien.ai`,
   choose **Prepare email**, inspect the report, then **Send report to…**.
   This explicitly sends reviewer identity, results, notes, evidence links and
   instance details; it excludes chat transcripts and runtime logs.
5. Automatic email requires Resend configured in **Partners** on the sending
   instance. Provider acceptance and uncertain delivery are shown separately;
   submitted reports remain downloadable. If mail is unavailable, use **Export review**
   and share the Markdown file. Actual delivery to Max is still to be verified.

Please also report suggestions for making Review easier to use. No Slack message
or real email has been sent automatically as part of preparing this handoff.
Maximilien’s current `test` workspace has the recipient prefilled but no mail provider;
configure Resend or use the download fallback. His Personal workspace retains the
previous agents and acceptance results.

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

- Final committed code **de5fe817** passed **557/557** local integration,
  validation and coverage checks. Statements/lines **83.50%** (62,289/74,589),
  branches **81.03%** (20,286/25,033), functions **91.91%** (2,582/2,809).
  Log: `/private/tmp/rc95-review-submit-full-validation.log`. No live provider key
  was available; real model generation/chat and email delivery remain external acceptance.
- Focused AI generator **59/59**, channel routes **22/22**, workflow routes **23/23**,
  plugin routes **11/11**, plugin catalog **32/32**, Review checklist **96/96**,
  export **12/12**, and email consent/persistence/idempotency/recovery tests pass.
  Server TypeScript passes; client retains **291** baseline diagnostics, zero new.
- Desktop/mobile browser tests pass for AI workflow, Group and Community creation,
  failed generation/save recovery, model-panel refresh, and Review email preview,
  explicit send, failure retry, retained status/download, and missing-mail fallback.
  Email provider responses are synthetic; no real email was sent during tests.
- Explicit UI regression confirms agent-details/chat pin visibility, pinned
  outside-click persistence, and composer chevron expansion/collapse at desktop/mobile.
  Before image acceptance, repeat these checks against the packaged container UI,
  Edit Agent Config pin, outside-click persistence, Escape and focus restoration
  also pass. Repeat against the image and record exact serving digest/architecture.
  A version label or green health probe alone is insufficient. RC94 remains unchanged.
- Final icon refresh preserved **1,222** workspace/home files byte-for-byte;
  version `2.0.0-test-rc95-review1.1b1f20ba`, backup `refresh-backup-1793133999`.
  Recipient is configured locally as `max@maximilien.ai`; no provider key was copied.
- [Final code CI](https://github.com/Maximilien-ai/clawmax/actions/runs/40575647132)
  is in progress. The existing CodeQL/security gate below remains unresolved.
- An intermediate aggregate run passed 556/556 before final changes. The subsequent
  rerun was invalidated by editing its shell test file while it was executing and
  was discarded. The final 557/557 run above used fixed committed source.

- Earlier checkpoint **d32199cc**: focused default-model, runtime-catalog, agent-config
  and chat tests passed; desktop/mobile AI creation and warning/manual-selection
  browser checks passed. Server TypeScript passed and client diagnostics remain
  at 291 with zero new. Full rerun: 555/556 passed; the sole failure was an outdated source-shape assertion.
  Test-only follow-up `5c580b98` corrects it; its 39-check suite and the 13
  default-model tests pass. This earlier result is superseded by the final all-green aggregate run above.

- Previous code checkpoint **7f179387** passed **556/556** local integration,
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

## Paste-ready Slack handoff to Daniyar

Daniyar — RC95 is ready for local source review on `integration/rc95-daniyar`
([PR #304](https://github.com/Maximilien-ai/clawmax/pull/304)), code `1b1f20ba` or later.
It includes 13 of your PRs (all eight #320–#327), plus the latest acceptance fixes.

For a fresh test:

```sh
git clone --branch integration/rc95-daniyar https://github.com/Maximilien-ai/clawmax.git clawmax-test
cd clawmax-test
./SYSTEM/local-dev.sh
```

Keep the terminal running and use its printed URL. Ctrl-C stops Dashboard and its
isolated Gateway. If you already have this branch, pull it and start a new snapshot
without `--root`; that flag reuses the old snapshot and its data.

Prioritize:
- P9/P10: AI agents keep the BYOK default; repairing a model refreshes an already-open details panel.
- P11: AI workflow draft includes instructions, targets, schedule/timezone and an owner when managed; Create saves and reopening preserves the choices.
- P12: Organization → Create Community/Group → Generate draft → review/edit existing-agent members → Create → reload.
- P4/UI: pin/unpin in agent details, config and chat; outside click/Escape/X; message-box expand/collapse chevron; outline icons in Documents and group management.

**The checklist is in the app too:** expand **Extensions → Review**. Open
**Suggested → Start 2.0.0-test-rc95 checklist**, then select RC95 in **Active**.
This creates your own P1–P12 review. Record passed/failed/blocked/pending plus your
name, version, environment and useful notes/evidence. Preserve prior tester history.
Lifecycle and Review are included in clean public installs; other extensions
require their separately configured plugin sources. Please suggest improvements
to the Review interface as you use it.

When finished, **Actions → Export / submit release review**. Enter your reviewer
identity/environment and recipient **max@maximilien.ai**, then **Prepare email →
Send report to…**. Email needs Resend configured in Partners on your instance;
otherwise **Export review** downloads the Markdown report to share. The email
contains review results/notes/evidence and instance details, not chat transcripts
or runtime logs. Submission status and the report are retained. Provider acceptance
is not proof of inbox delivery; do not blindly resend an uncertain delivery.

Still held: #227 session lifecycle/migration, #228 Gateway ownership/recovery,
#229 streaming reconnect/cancel/persistence, #288 observable legacy-schedule cleanup.
We can include each after its focused lifecycle evidence passes; details are above.

557/557 engineering checks passed before the final icon-only change; focused
icon checks also pass. Real-provider testing, your acceptance, CI/security disposition
and exact packaged-image validation remain open. No RC95 image exists yet; we will
build it after local review. Report `P# — version — expected — actual — evidence`.
