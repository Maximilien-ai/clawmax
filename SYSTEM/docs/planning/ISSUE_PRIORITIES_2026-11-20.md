# Issue priorities — November 20, 2026

Three priority levels apply across the **114 open Dashboard issues and 18 open Web issues**. This reprioritizes the queue without creating product issues, closing work, changing customer feedback dispositions or claiming current-source reproduction/deployment.

## Labels and scheduling

| Label | Meaning |
| --- | --- |
| `high-priority` | **Now:** must-have reliability, security/persistence, truthful execution and repeated core usability failures. A safe mitigation or evidence-backed closure can satisfy a ticket; priority does not prove its title still reproduces. |
| `medium-priority` | **Next:** important but less disruptive bugs, bounded improvements, advisory-quality work and current-source/closure follow-ups. |
| `low-priority` | **Future:** nice-to-haves, larger capabilities, architecture work and post-stability major migrations. This is deferred scope, not a promise for a named release. |
| `triaged` | Scope, responsible team and priority are classified. Reproduction, implementation, tests and user acceptance can remain. |
| `needs-triage` | Scope, owner or the actual remaining request is unclear. Any assigned priority is provisional; clarify before adding it to an execution batch. |

Use exactly one priority and one triage state. Preserve type, area, feedback, security and decision labels. New issues default to `needs-triage` unless classification is already complete at filing; after reading the report, checking duplicates and classifying scope/owner/priority, use `triaged`. Opening or reopening a ticket alone does not prove it was assessed. This is the intake rule; this change adds no GitHub automation or project board.

Repeated feedback comes first **within its tier**, with distinct reporters breaking ties. Security exposure, destructive operations, lost state and false execution success can interrupt that order even with one report. A large new feature stays Future even if it is popular. Closed canonical issues are not reopened just because several reports link to them.

Counts are distinct reports linked in the authenticated 104-report Management audit; reporter counts are deduplicated privately. Some links describe related or multi-topic scope. They are evidence of interest/impact, not independent reproductions, votes or the total affected user population. Zero linked reports does not mean zero affected users. No private identity, raw report or screenshot appears here.

## Verified queue totals

| Repository | High / Now | Medium / Next | Low / Future | Triaged | Needs triage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 35 | 58 | 21 | 114 | 0 |
| Web | 3 | 11 | 4 | 14 | 4 |
| **Combined** | **38** | **69** | **25** | **128** | **4** |

Forty-one tickets received priority/state updates and rationale comments: 23 Dashboard and 18 Web. Other Dashboard classifications are retained. Four Web intake/historical requests remain explicitly untriaged rather than being declared ready. The counts include their provisional priorities. A fresh live audit at approximately 23:37 UTC confirmed these counts across all 132 open issues.

## Tomorrow: a small connected batch

The high queue spans several work sessions. For **Saturday, November 21**, start with one representative agent/workflow path and retain focused commits for each concern:

1. [#438](https://github.com/Maximilien-ai/clawmax/issues/438): an empty result or missing required deliverable must not be shown as success.
2. [#437](https://github.com/Maximilien-ai/clawmax/issues/437): verify the selected model against the actual runtime before execution; preserve a clear failure if it is unavailable.
3. [#439](https://github.com/Maximilien-ai/clawmax/issues/439): keep delegated sessions within enabled runtime/model permissions.

Use [#395](https://github.com/Maximilien-ai/clawmax/issues/395) as the related **six-report** visibility requirement: show actual existing readiness, assignments, progress and blockers. A successful first batch produces the declared artifact or a truthful persisted error on the same representative path. This does not require a new orchestration engine.

Then address [#396](https://github.com/Maximilien-ai/clawmax/issues/396) (**six reports**) for the first useful task, and [#381](https://github.com/Maximilien-ai/clawmax/issues/381) (**four reports**) for finding its output. Reuse existing actions and document navigation rather than add another surface. This is a soft sequence; an independently reproduced safety/data-loss failure takes precedence.

## Repeated feedback at the front of Now

| Issue | Reports / reporters | Bounded immediate scope |
| --- | ---: | --- |
| [#395](https://github.com/Maximilien-ai/clawmax/issues/395) | 6 / 5 | Explain existing delegation, assignments, progress and blockers; connect to truthful execution. |
| [#396](https://github.com/Maximilien-ai/clawmax/issues/396) | 6 / 4 | Make one first useful action obvious after setup. |
| [#381](https://github.com/Maximilien-ai/clawmax/issues/381) | 4 / 2 | Find actual agent/workflow deliverables through existing navigation. |
| [#416](https://github.com/Maximilien-ai/clawmax/issues/416) | 3 / 3 | Clarify existing handoff/tool-readiness requirements and recovery. |
| [#388](https://github.com/Maximilien-ai/clawmax/issues/388) | 3 / 3 | Explain manual Run versus conversation continuation and context. |
| [#413](https://github.com/Maximilien-ai/clawmax/issues/413) | 3 / 3 | Complete bounded readability/resize behavior on existing panels. |
| [Web #57](https://github.com/Maximilien-ai/clawmax-ai/issues/57) | 3 / 2 | Investigate privacy findings/recovery that block feedback, preserving fail-closed checks. |

Repeated file-opening/zero-byte downloads (#382/#353), the Structure-view crash (#364), rename/save behavior (#383), hidden agent counts (#350), misleading manual-workflow guidance (#357) and role boundaries (#394) are also High. Their complete criteria remain in their existing issues.

High safety/persistence work retains the same priority: #281/#285 authorization/path boundaries, #352/#216/#420 preserved state/history, #249/#245/#247 cancellation/deletion/scheduling, and high runtime/availability failures. These are interrupt conditions when reproduced, not items to defer behind cosmetic demand. Investigation starts by checking current source/image and preserved state; historical titles alone are not a fresh vulnerability or fleet observation.

## Next and Future boundaries

At the front of **Next**, prioritize repeated but less blocking requests: Web #56 feedback defaults/context, #409 tool evidence, #389 recommendation relevance, #414 advisory/multilingual scoring quality, #380 provisioning navigation, #397 repository setup guidance, and #407 a feedback entry point. Continue with single-report refresh, Builder keyboard/guidance, naming/editing and document/PDF polish from the full queue.

Several older High labels are narrowed without discarding their requirements:

- #214 is an umbrella; its concrete safety/history/startup child issues retain their own High priorities.
- #419 keeps offline replay disabled until its consent-bound design is verified. Medium does not authorize enabling it or dropping its fail-closed mitigation; absent guards or reproduced leakage immediately change the priority.
- #253/#362 concern price/meter display correctness; no actual billing transaction defect is established. #348 explicitly reports that main turns use the configured model; utility visibility/metering remains work.
- #336 needs current filtering verification while #437 owns current model admission. #193 refers to RC64/older OpenClaw; verify the current packaged readiness path before reimplementing a historical fix. Actual current image boot failures remain High release gates.
- #436 remains required before stable promotion; use supported fixes or explicit evidence-backed mitigations, without forcing incompatible majors.

Keep **Future** focused: #448 shared-workspace collaboration; #442 safe generated-HTML rendering; #412 image-prompt intake; #399 richer template-step editing; #398 durable-reference migration; #391 custom nodes; #406/#408/#410/#411 extension/runtime features; and #433/#418 larger dependency migrations. Planning umbrella #160 is Low, while concrete remaining authorization/privacy/packaging gates keep their own mandatory priorities. No safety criterion is moved to a later version by relabeling a planning umbrella.

## Needs triage

| Issue | Provisional priority | Missing classification |
| --- | --- | --- |
| [Web #37](https://github.com/Maximilien-ai/clawmax-ai/issues/37) | Medium | Which app/page has overlapping zoom panels; establish the implementation owner. |
| [Web #38](https://github.com/Maximilien-ai/clawmax-ai/issues/38) | Medium | Which app/account invitation path is intended; distinguish existing support from #448’s larger future proposal. |
| [Web #39](https://github.com/Maximilien-ai/clawmax-ai/issues/39) | Medium | Which app has the logout/sidebar ambiguity; route to the actual owner. |
| [Web #22](https://github.com/Maximilien-ai/clawmax-ai/issues/22) | Low | Separate the historical time-bound request from any unfinished reusable-control work; do not infer current access or reuse past authorization. |

Web #30 is classified Medium for acceptance/closure verification: audited responses, link saving and notifications were used live in the SF pass. Its full acceptance still belongs to Web; this queue does not request a duplicate implementation.

## Complete ordered inventory

All open tickets have one priority and one triage state. Sort the tables by priority, linked report count and distinct reporters; dependency and safety considerations can change execution order. Rows with `needs-triage` are excluded from ready-to-start work.

### Dashboard

| Issue | Topic | Priority | Reports / reporters | Triage |
| --- | --- | --- | ---: | --- |
| [#395](https://github.com/Maximilien-ai/clawmax/issues/395) | Expose delegation, ownership and review evidence in multi-agent work | High | 6 / 5 | `triaged` |
| [#396](https://github.com/Maximilien-ai/clawmax/issues/396) | Make the first useful workspace action obvious | High | 6 / 4 | `triaged` |
| [#381](https://github.com/Maximilien-ai/clawmax/issues/381) | fix: make agent and workflow documents easier to find | High | 4 / 2 | `triaged` |
| [#388](https://github.com/Maximilien-ai/clawmax/issues/388) | Clarify workflow-run conversations and continuation | High | 3 / 3 | `triaged` |
| [#413](https://github.com/Maximilien-ai/clawmax/issues/413) | Provide bounded resize or expand controls for Builder panels and sidebars | High | 3 / 3 | `triaged` |
| [#416](https://github.com/Maximilien-ai/clawmax/issues/416) | Review multi-agent workflow handoff and tool-readiness guidance | High | 3 / 3 | `triaged` |
| [#350](https://github.com/Maximilien-ai/clawmax/issues/350) | bug: Workspace selector reports 0 agents while the same workspace has 3 active agents (RC96) | High | 2 / 2 | `triaged` |
| [#353](https://github.com/Maximilien-ai/clawmax/issues/353) | bug: Unsupported file previews become empty Markdown and download as zero-byte files | High | 2 / 2 | `triaged` |
| [#357](https://github.com/Maximilien-ai/clawmax/issues/357) | bug: Enabled manual-only workflows are told to enable scheduling and wait for a scheduled run | High | 2 / 2 | `triaged` |
| [#364](https://github.com/Maximilien-ai/clawmax/issues/364) | bug: Organization Structure view crashes with openOrganizationDoc is not defined | High | 2 / 2 | `triaged` |
| [#382](https://github.com/Maximilien-ai/clawmax/issues/382) | fix: investigate file links that do not open in multi-agent chat | High | 2 / 2 | `triaged` |
| [#383](https://github.com/Maximilien-ai/clawmax/issues/383) | fix: make agent display-name editing discoverable from chat | High | 2 / 2 | `triaged` |
| [#394](https://github.com/Maximilien-ai/clawmax/issues/394) | Preserve agent identities and role boundaries in group execution | High | 2 / 1 | `triaged` |
| [#338](https://github.com/Maximilien-ai/clawmax/issues/338) | AI-generated managed workflows describe a handoff, but all participants run in parallel on the same instructions | High | 1 / 1 | `triaged` |
| [#361](https://github.com/Maximilien-ai/clawmax/issues/361) | bug: Activity request failures are presented as zero spending and no activity | High | 1 / 1 | `triaged` |
| [#372](https://github.com/Maximilien-ai/clawmax/issues/372) | Builder: local fallback fails with orgTemplates is not defined after HTML response | High | 1 / 1 | `triaged` |
| [#374](https://github.com/Maximilien-ai/clawmax/issues/374) | Workflows: bulk Resume reports success when updates return HTTP errors | High | 1 / 1 | `triaged` |
| [#402](https://github.com/Maximilien-ai/clawmax/issues/402) | Investigate workspace export failures and preserve useful error evidence | High | 1 / 1 | `triaged` |
| [#437](https://github.com/Maximilien-ai/clawmax/issues/437) | fix: validate runtime model support before execution | High | 1 / 1 | `triaged` |
| [#438](https://github.com/Maximilien-ai/clawmax/issues/438) | fix: fail workflow runs with empty results or missing required outputs | High | 1 / 1 | `triaged` |
| [#439](https://github.com/Maximilien-ai/clawmax/issues/439) | fix: keep delegated sessions within enabled runtime capabilities | High | 1 / 1 | `triaged` |
| [#440](https://github.com/Maximilien-ai/clawmax/issues/440) | fix: investigate 502 failures while changing agent models | High | 1 / 1 | `triaged` |
| [#187](https://github.com/Maximilien-ai/clawmax/issues/187) | fix: bound Dashboard resource growth during Podman soaks | High | 0 / 0 | `triaged` |
| [#216](https://github.com/Maximilien-ai/clawmax/issues/216) | Agent chat history drops long replies after a reload | High | 0 / 0 | `triaged` |
| [#224](https://github.com/Maximilien-ai/clawmax/issues/224) | Chat turns wait up to 2 minutes when no OpenClaw Gateway runs, and start.sh restarts the Gateway on every launch | High | 0 / 0 | `triaged` |
| [#237](https://github.com/Maximilien-ai/clawmax/issues/237) | On-prem 1.9.9 hides plain-provisioned agents and crashes the Agents page (#181, #182); agents created before an upgrade stay hidden | High | 0 / 0 | `triaged` |
| [#245](https://github.com/Maximilien-ai/clawmax/issues/245) | Agents: bulk delete skips the deletion lock, turn quiesce and Gateway unregistration | High | 0 / 0 | `triaged` |
| [#247](https://github.com/Maximilien-ai/clawmax/issues/247) | Workflows: one invalid time zone stops scheduler sync for all workflows, and disabled workflows keep firing | High | 0 / 0 | `triaged` |
| [#249](https://github.com/Maximilien-ai/clawmax/issues/249) | Workflows: Stop marks a run cancelled but Claude Code / Droid steps keep running | High | 0 / 0 | `triaged` |
| [#281](https://github.com/Maximilien-ai/clawmax/issues/281) | Security: template, skill, agent, plugin and workflow-output names can escape their folders | High | 0 / 0 | `triaged` |
| [#285](https://github.com/Maximilien-ai/clawmax/issues/285) | Security: with authentication bypassed, the Vite dev server exposes the API to the local network | High | 0 / 0 | `triaged` |
| [#312](https://github.com/Maximilien-ai/clawmax/issues/312) | Creating a Claude Code or Droid agent writes an invalid modelPolicy.allow entry and blocks all later agent creation | High | 0 / 0 | `triaged` |
| [#313](https://github.com/Maximilien-ai/clawmax/issues/313) | Factory Droid 0.247.0 rejects the --disabled-tools identifiers ClawMax passes, so every Droid turn fails | High | 0 / 0 | `triaged` |
| [#352](https://github.com/Maximilien-ai/clawmax/issues/352) | bug: Switching documents during loading can overwrite the selected file with content from another file | High | 0 / 0 | `triaged` |
| [#420](https://github.com/Maximilien-ai/clawmax/issues/420) | bug: recover legacy native chats after identity or model changes | High | 0 / 0 | `triaged` |
| [#380](https://github.com/Maximilien-ai/clawmax/issues/380) | fix: let users leave agent provisioning while tracking its outcome | Medium | 2 / 2 | `triaged` |
| [#389](https://github.com/Maximilien-ai/clawmax/issues/389) | Improve Builder recommendation relevance and refinement | Medium | 2 / 2 | `triaged` |
| [#407](https://github.com/Maximilien-ai/clawmax/issues/407) | Add a discoverable runtime feedback entry point with reviewed screenshots | Medium | 2 / 2 | `triaged` |
| [#409](https://github.com/Maximilien-ai/clawmax/issues/409) | Show agent tool access and actual tool-use evidence | Medium | 2 / 2 | `triaged` |
| [#414](https://github.com/Maximilien-ai/clawmax/issues/414) | Evaluate Spanish Expand with AI quality and advisory readiness scoring | Medium | 2 / 2 | `triaged` |
| [#397](https://github.com/Maximilien-ai/clawmax/issues/397) | Clarify workspace GitHub authentication and repository execution setup | Medium | 2 / 1 | `triaged` |
| [#214](https://github.com/Maximilien-ai/clawmax/issues/214) | Agent Chat reliability: history, streaming, rendering, and Gateway startup issues | Medium | 1 / 1 | `triaged` |
| [#225](https://github.com/Maximilien-ai/clawmax/issues/225) | Agent chat replies appear only when the turn has finished | Medium | 1 / 1 | `triaged` |
| [#354](https://github.com/Maximilien-ai/clawmax/issues/354) | bug: Every workflow card and list row displays the whole workspace cost | Medium | 1 / 1 | `triaged` |
| [#356](https://github.com/Maximilien-ai/clawmax/issues/356) | bug: First-time anonymous visitors receive a false session-expired warning | Medium | 1 / 1 | `triaged` |
| [#358](https://github.com/Maximilien-ai/clawmax/issues/358) | bug: Active workflows show Ready with Pause disabled until the first polling refresh | Medium | 1 / 1 | `triaged` |
| [#359](https://github.com/Maximilien-ai/clawmax/issues/359) | bug: Logs replaces original event timestamps with receipt time and treats timestamps as agents | Medium | 1 / 1 | `triaged` |
| [#360](https://github.com/Maximilien-ai/clawmax/issues/360) | bug: Pause and Resume triplicate existing log history and downloaded logs | Medium | 1 / 1 | `triaged` |
| [#362](https://github.com/Maximilien-ai/clawmax/issues/362) | bug: Metering aggregate totals undercount their own agent and daily breakdowns | Medium | 1 / 1 | `triaged` |
| [#363](https://github.com/Maximilien-ai/clawmax/issues/363) | bug: Organization search hides matching subteams when their parent does not match | Medium | 1 / 1 | `triaged` |
| [#365](https://github.com/Maximilien-ai/clawmax/issues/365) | bug: Markdown workspace links open Builder and relative images fail to load | Medium | 1 / 1 | `triaged` |
| [#366](https://github.com/Maximilien-ai/clawmax/issues/366) | bug: Keyboard selection in global search moves offscreen without scrolling | Medium | 1 / 1 | `triaged` |
| [#368](https://github.com/Maximilien-ai/clawmax/issues/368) | Documents: uppercase .MD uploads succeed but cannot be opened | Medium | 1 / 1 | `triaged` |
| [#369](https://github.com/Maximilien-ai/clawmax/issues/369) | Documents: PDF export leaves literal HTML entities in rendered prose | Medium | 1 / 1 | `triaged` |
| [#370](https://github.com/Maximilien-ai/clawmax/issues/370) | Workflows: List view Select all throws and selects no rows | Medium | 1 / 1 | `triaged` |
| [#371](https://github.com/Maximilien-ai/clawmax/issues/371) | Agents: Status action in Detail view fails with undefined callback | Medium | 1 / 1 | `triaged` |
| [#373](https://github.com/Maximilien-ai/clawmax/issues/373) | Skills: failed export is silent because its error handler throws | Medium | 1 / 1 | `triaged` |
| [#387](https://github.com/Maximilien-ai/clawmax/issues/387) | Make parallel workflow branches discoverable and verifiable | Medium | 1 / 1 | `triaged` |
| [#390](https://github.com/Maximilien-ai/clawmax/issues/390) | Distinguish human and agent authors in busy conversations | Medium | 1 / 1 | `triaged` |
| [#392](https://github.com/Maximilien-ai/clawmax/issues/392) | Investigate disruptive automatic dashboard refreshes | Medium | 1 / 1 | `triaged` |
| [#393](https://github.com/Maximilien-ai/clawmax/issues/393) | Investigate an unresponsive Add dependency action | Medium | 1 / 1 | `triaged` |
| [#400](https://github.com/Maximilien-ai/clawmax/issues/400) | Show group membership during generated-template review | Medium | 1 / 1 | `triaged` |
| [#401](https://github.com/Maximilien-ai/clawmax/issues/401) | Allow editing AI-generated templates before confirmation | Medium | 1 / 1 | `triaged` |
| [#403](https://github.com/Maximilien-ai/clawmax/issues/403) | Fix workflow-generator layout when opened from Builder | Medium | 1 / 1 | `triaged` |
| [#441](https://github.com/Maximilien-ai/clawmax/issues/441) | fix: refresh agent collections after creation settles | Medium | 1 / 1 | `triaged` |
| [#443](https://github.com/Maximilien-ai/clawmax/issues/443) | feat: clarify workflow run-input retention and saved defaults | Medium | 1 / 1 | `triaged` |
| [#444](https://github.com/Maximilien-ai/clawmax/issues/444) | fix: make team leader editing discoverable and persistent | Medium | 1 / 1 | `triaged` |
| [#445](https://github.com/Maximilien-ai/clawmax/issues/445) | fix: explain optional CLI runtime availability during setup | Medium | 1 / 1 | `triaged` |
| [#446](https://github.com/Maximilien-ai/clawmax/issues/446) | fix: explain readiness changes after Improve with AI | Medium | 1 / 1 | `triaged` |
| [#447](https://github.com/Maximilien-ai/clawmax/issues/447) | fix: clarify Builder keyboard submission and prompt transitions | Medium | 1 / 1 | `triaged` |
| [#449](https://github.com/Maximilien-ai/clawmax/issues/449) | fix: adapt Builder guidance to empty workspaces and user intent | Medium | 1 / 1 | `triaged` |
| [#162](https://github.com/Maximilien-ai/clawmax/issues/162) | docs: update a refine dev setup and instructions | Medium | 0 / 0 | `triaged` |
| [#163](https://github.com/Maximilien-ai/clawmax/issues/163) | docs: create plugin dev user’s guide | Medium | 0 / 0 | `triaged` |
| [#190](https://github.com/Maximilien-ai/clawmax/issues/190) | bug: can't pair with Whatsapp | Medium | 0 / 0 | `triaged` |
| [#193](https://github.com/Maximilien-ai/clawmax/issues/193) | bug: RC64 entrypoint fails its own gateway readiness probe (config get prints __OPENCLAW_REDACTED__) | Medium | 0 / 0 | `triaged` |
| [#195](https://github.com/Maximilien-ai/clawmax/issues/195) | Improve Error Recovery and Navigation | Medium | 0 / 0 | `triaged` |
| [#200](https://github.com/Maximilien-ai/clawmax/issues/200) | bug: Builder starter-prompt suggestions intermittently 500 on a real (non-OpenAI-terse) BYOK model | Medium | 0 / 0 | `triaged` |
| [#253](https://github.com/Maximilien-ai/clawmax/issues/253) | Metering: price lookup takes the first substring match, so gpt-4o-mini is priced as gpt-4o | Medium | 0 / 0 | `triaged` |
| [#255](https://github.com/Maximilien-ai/clawmax/issues/255) | Workflow editor: manual workflows show a cron error, and run limit / handoff settings are not saved | Medium | 0 / 0 | `triaged` |
| [#259](https://github.com/Maximilien-ai/clawmax/issues/259) | Builder: suggested requests and other content below the prompt cannot be scrolled to at desktop widths | Medium | 0 / 0 | `triaged` |
| [#261](https://github.com/Maximilien-ai/clawmax/issues/261) | Builder: the result pane has three show/hide controls, and the hide control is clipped or covered at desktop widths | Medium | 0 / 0 | `triaged` |
| [#265](https://github.com/Maximilien-ai/clawmax/issues/265) | Agent chat: Forward To menu does not close on Escape, outside click or pointer leave, and has no keyboard navigation | Medium | 0 / 0 | `triaged` |
| [#271](https://github.com/Maximilien-ai/clawmax/issues/271) | Top bar: controls overlap the sidebar or are cut off between 320 and 1280 px | Medium | 0 / 0 | `triaged` |
| [#310](https://github.com/Maximilien-ai/clawmax/issues/310) | Agents: three-dot actions menu runs off the viewport and cannot scroll, hiding Delete | Medium | 0 / 0 | `triaged` |
| [#314](https://github.com/Maximilien-ai/clawmax/issues/314) | Workflows AI Editor: Save & Generate drafts pick managed mode without an owner, can miss selected agents, and lose the prompt on Cancel | Medium | 0 / 0 | `triaged` |
| [#315](https://github.com/Maximilien-ai/clawmax/issues/315) | Aborted or failed agent creation leaves an empty AGENTS/<id> folder | Medium | 0 / 0 | `triaged` |
| [#331](https://github.com/Maximilien-ai/clawmax/issues/331) | Add Agent wizard fails to initialize BYOK default model and misreports AI readiness | Medium | 0 / 0 | `triaged` |
| [#336](https://github.com/Maximilien-ai/clawmax/issues/336) | New agents can default to openai/chatgpt-image-latest: OpenAI discovery offers image and speech models as chat models | Medium | 0 / 0 | `triaged` |
| [#348](https://github.com/Maximilien-ai/clawmax/issues/348) | Gateway Activity recaps run on OpenClaw's default utility model (gpt-5.6-luna) with the agent's OpenAI key; ClawMax neither shows nor meters them | Medium | 0 / 0 | `triaged` |
| [#379](https://github.com/Maximilien-ai/clawmax/issues/379) | PDF export silently replaces Japanese, Chinese and Korean text with missing glyphs | Medium | 0 / 0 | `triaged` |
| [#419](https://github.com/Maximilien-ai/clawmax/issues/419) | Bind optional-memory offline replay to destination and user consent | Medium | 0 / 0 | `triaged` |
| [#426](https://github.com/Maximilien-ai/clawmax/issues/426) | bug: PDF task lists repeat markers and detach item labels | Medium | 0 / 0 | `triaged` |
| [#436](https://github.com/Maximilien-ai/clawmax/issues/436) | chore: resolve remaining Moderate dependency advisories before stable 2.0 | Medium | 0 / 0 | `triaged` |
| [#317](https://github.com/Maximilien-ai/clawmax/issues/317) | local-dev.sh: a --root restart regenerates .env, and CLI runtimes show as installed but cannot sign in | Low | 1 / 1 | `triaged` |
| [#391](https://github.com/Maximilien-ai/clawmax/issues/391) | Assess custom deterministic workflow nodes | Low | 1 / 1 | `triaged` |
| [#398](https://github.com/Maximilien-ai/clawmax/issues/398) | Assess durable agent references in workflow and agent definitions | Low | 1 / 1 | `triaged` |
| [#399](https://github.com/Maximilien-ai/clawmax/issues/399) | Allow reviewing and adding workflow steps to AI-generated templates | Low | 1 / 1 | `triaged` |
| [#405](https://github.com/Maximilien-ai/clawmax/issues/405) | Investigate duplicated agent-name presentation | Low | 1 / 1 | `triaged` |
| [#406](https://github.com/Maximilien-ai/clawmax/issues/406) | Assess an MCP management interface for ClawMax resources | Low | 1 / 1 | `triaged` |
| [#408](https://github.com/Maximilien-ai/clawmax/issues/408) | Assess authenticated external triggers for agent runs | Low | 1 / 1 | `triaged` |
| [#410](https://github.com/Maximilien-ai/clawmax/issues/410) | Assess discovery and installation of reusable agent packages | Low | 1 / 1 | `triaged` |
| [#411](https://github.com/Maximilien-ai/clawmax/issues/411) | Assess user-provided agent runtime harness support | Low | 1 / 1 | `triaged` |
| [#412](https://github.com/Maximilien-ai/clawmax/issues/412) | Support reviewed image pasting into agent prompts | Low | 1 / 1 | `triaged` |
| [#415](https://github.com/Maximilien-ai/clawmax/issues/415) | Assess a UX agent or team template for the public catalog | Low | 1 / 1 | `triaged` |
| [#442](https://github.com/Maximilien-ai/clawmax/issues/442) | feat: assess safe previews for generated HTML artifacts | Low | 1 / 1 | `triaged` |
| [#448](https://github.com/Maximilien-ai/clawmax/issues/448) | feat: assess shared-workspace workflow collaboration | Low | 1 / 1 | `triaged` |
| [#111](https://github.com/Maximilien-ai/clawmax/issues/111) | docs: add / update videos demos | Low | 0 / 0 | `triaged` |
| [#160](https://github.com/Maximilien-ai/clawmax/issues/160) | docs: create v2.0.0 wish list | Low | 0 / 0 | `triaged` |
| [#263](https://github.com/Maximilien-ai/clawmax/issues/263) | Templates: template card headers misalign the icon, title and apply button | Low | 0 / 0 | `triaged` |
| [#316](https://github.com/Maximilien-ai/clawmax/issues/316) | Workflow editor does not explain run-limit semantics (manual runs exempt, failed runs counted) | Low | 0 / 0 | `triaged` |
| [#318](https://github.com/Maximilien-ai/clawmax/issues/318) | Workflow run panel still shows a participant as running right after Stop run | Low | 0 / 0 | `triaged` |
| [#319](https://github.com/Maximilien-ai/clawmax/issues/319) | Doctor reports missing Creature/Vibe/Emoji on wizard-created agents, and its fix does not add them | Low | 0 / 0 | `triaged` |
| [#418](https://github.com/Maximilien-ai/clawmax/issues/418) | Review a compatible OpenTelemetry API, SDK and exporter upgrade | Low | 0 / 0 | `triaged` |
| [#433](https://github.com/Maximilien-ai/clawmax/issues/433) | Track supported Dashboard major migrations after the 2.0 stability batch | Low | 0 / 0 | `triaged` |
### Web

| Issue | Topic | Priority | Reports / reporters | Triage |
| --- | --- | --- | ---: | --- |
| [Web #57](https://github.com/Maximilien-ai/clawmax-ai/issues/57) | fix: investigate screenshot privacy false positives and recovery | High | 3 / 2 | `triaged` |
| [Web #41](https://github.com/Maximilien-ai/clawmax-ai/issues/41) | Investigate an instance request that stayed degraded and unavailable | High | 1 / 1 | `triaged` |
| [Web #13](https://github.com/Maximilien-ai/clawmax-ai/issues/13) | Cloud instance list is stale and hides active deployments | High | 0 / 0 | `triaged` |
| [Web #38](https://github.com/Maximilien-ai/clawmax-ai/issues/38) | Feedback intake: clarify teammate invitation discoverability | Medium | 2 / 2 | `needs-triage` |
| [Web #56](https://github.com/Maximilien-ai/clawmax-ai/issues/56) | fix: use neutral feedback defaults and explain context fields | Medium | 2 / 1 | `triaged` |
| [Web #29](https://github.com/Maximilien-ai/clawmax-ai/issues/29) | fix: investigate mobile registration discoverability | Medium | 1 / 1 | `triaged` |
| [Web #31](https://github.com/Maximilien-ai/clawmax-ai/issues/31) | docs: improve event guidance for creating and instructing agents | Medium | 1 / 1 | `triaged` |
| [Web #37](https://github.com/Maximilien-ai/clawmax-ai/issues/37) | Feedback intake: identify the app and reproduce zoom-panel overlap | Medium | 1 / 1 | `needs-triage` |
| [Web #39](https://github.com/Maximilien-ai/clawmax-ai/issues/39) | Feedback intake: distinguish logout from sidebar expansion | Medium | 1 / 1 | `needs-triage` |
| [Web #40](https://github.com/Maximilien-ai/clawmax-ai/issues/40) | Investigate confusing mobile website navigation | Medium | 1 / 1 | `triaged` |
| [Web #7](https://github.com/Maximilien-ai/clawmax-ai/issues/7) | chore: enable emails security@clawmax.ai and info@clawmax.ai | Medium | 0 / 0 | `triaged` |
| [Web #10](https://github.com/Maximilien-ai/clawmax-ai/issues/10) | Cloud instance cards show stale version and missing infra metadata | Medium | 0 / 0 | `triaged` |
| [Web #19](https://github.com/Maximilien-ai/clawmax-ai/issues/19) | Prepare maintenance status page for ClawMax dashboard banner | Medium | 0 / 0 | `triaged` |
| [Web #30](https://github.com/Maximilien-ai/clawmax-ai/issues/30) | feat: add audited Management feedback responses to CLI and skill | Medium | 0 / 0 | `triaged` |
| [Web #32](https://github.com/Maximilien-ai/clawmax-ai/issues/32) | feat: assess Client console navigation search and shortcuts | Low | 1 / 1 | `triaged` |
| [Web #3](https://github.com/Maximilien-ai/clawmax-ai/issues/3) | feat: add on-prem agent status and live log surfaces | Low | 0 / 0 | `triaged` |
| [Web #6](https://github.com/Maximilien-ai/clawmax-ai/issues/6) | feat: own fleet orchestration on web/control-plane side | Low | 0 / 0 | `triaged` |
| [Web #22](https://github.com/Maximilien-ai/clawmax-ai/issues/22) | Review historical access-extension request and remaining reusable controls | Low | 0 / 0 | `needs-triage` |

## Evidence and limits

The priority pass uses the live open GitHub catalogs and the verified 104-report link inventory from [SF feedback triage](FEEDBACK_TRIAGE_2026-11-20.md). The apply step compared pre-edit labels, preserved unrelated labels and recorded rationale on every changed ticket. The fresh post-edit audit passed: unchanged open membership, exactly one matching priority and triage state on all 132 issues, and every unrelated label preserved. All 41 changed tickets have saved edit and rationale-comment receipts. Documentation checks verified the 132-row inventory, totals and whitespace. Private IDs and command receipts remain outside Git.

This changes labels and documentation only. It does not change code, fleet state, user feedback lifecycle or notification delivery. Dashboard owns its public issues; Web/CLI own their implementations and deployment decisions. Before a later implementation/RC, follow the existing focused tests, responsive checks and complete release gates.
