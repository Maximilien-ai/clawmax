# SF feedback triage — November 20, 2026

Status: **new-report triage complete**, with one report awaiting clarification and the linked engineering work still open. This is intake/communication completion, not implementation, release, deployment or user-acceptance evidence.

## Scope and verified totals

The prior audit had 73 reports. A fresh authenticated all-archive read returned **104 distinct reports across five pages**, with attachment metadata and no image bytes. All **31 new reports** are in the SF event submission window. Their full text and conversation histories were reviewed; none had a prior response. Older reports were included in the link/attention reconciliation, and all 73 retained their prior ownership, issue links and open/closed state.

| Measure | Before this triage | After |
| --- | ---: | ---: |
| Dashboard open / total issues | 101 / 270 | 114 / 283 |
| Web open / total issues | 16 / 33 | 18 / 36 |
| Feedback inventory since prior audit | 73 | 104 |
| Feedback open / closed immediately before this pass | 83 / 21 | 75 / 29 |
| New reports needing a Management reply | 31 | 0 |

Issue counts exclude pull requests. Web totals include the separately created and now closed engineering blocker #55 as well as the two new feedback issues. At resume, Web was 17 open / 34 total; closing #55 and adding #56/#57 yielded 18 / 36. No Dashboard product issue was closed in this intake pass.

## Dispositions

- **17 reports generated 15 distinct issues:** 13 Dashboard issues [#437](https://github.com/Maximilien-ai/clawmax/issues/437)–[#449](https://github.com/Maximilien-ai/clawmax/issues/449), plus Web [#56](https://github.com/Maximilien-ai/clawmax-ai/issues/56) and [#57](https://github.com/Maximilien-ai/clawmax-ai/issues/57).
- **9 reports were linked to existing work.** Four exact duplicates were closed with canonical issue links; five broader/partly overlapping reports remain open. No shared root cause is inferred merely from similar wording.
- **3 positive reports** were thanked and closed without manufacturing engineering issues.
- **1 existing-capability request** was answered with Workspaces Integrations guidance and its existing issue context, then closed as `already_supported`. It was not labelled user error.
- **1 screenshot-only report** remains open with a `needs_info` response asking for the failing action/error text; it intentionally has no speculative issue.

One multi-topic report generated two new issues while retaining four existing links. Three privacy-rejection reports share Web #57; two feedback-form reports share Web #56. Related work is cross-linked in both directions. Eight report closures are separate from fixing their canonical engineering work.

## Communication and verification

All **31 thank-you replies were saved before the first new feedback-derived issue was created**. Sanitized provenance comments were then added to **23 existing issues** before the missing issues were opened. Seventeen complete follow-ups added the new issue links, giving **48 saved replies** plus eight separate closure-audit messages.

Notification requests were made for one substantive reply per report: **31 requests grouped into six recipient digests**. Fresh conversation receipts at approximately **23:02 UTC** still reported all 31 as pending. Requested/queued is not provider acceptance or inbox delivery; no sent email is claimed here.

The final audit independently reread all feedback pages, the 31 conversations and both GitHub issue catalogs. It verified:

- Exact totals and unique IDs, with no late report arrivals during this pass and no image bytes in the list.
- Complete persisted issue-link sets for every multi-topic report; every newly actionable report has links.
- Zero new/unanswered/unread-reply attention flags, including the older inventory.
- The original 73 reports' triage team, issue links and lifecycle state remained unchanged.
- New issue bodies contain the canonical full Feedback-IDs and unique triage keys; saved thank-you timestamps precede issue creation.
- New issues remain open, the eight intended report closures persisted, and the read blocker #55 is closed.

No new event defect was dismissed as already fixed or as user error. The reported Structure-view error remains present in the inspected source and reuses #364. Earlier dated-model and score-over-100 fixes are related history, not proof that unsupported Sol selections or a score decrease after Improve with AI are fixed. Non-secret run-input persistence and Enter/Shift+Enter are explained as current behavior while their usability requests remain tracked.

## New engineering issues

| Issue | Scope |
| --- | --- |
| [#437](https://github.com/Maximilien-ai/clawmax/issues/437) | validate runtime model support before execution |
| [#438](https://github.com/Maximilien-ai/clawmax/issues/438) | fail workflow runs with empty results or missing required outputs |
| [#439](https://github.com/Maximilien-ai/clawmax/issues/439) | keep delegated sessions within enabled runtime capabilities |
| [#440](https://github.com/Maximilien-ai/clawmax/issues/440) | investigate 502 failures while changing agent models |
| [#441](https://github.com/Maximilien-ai/clawmax/issues/441) | refresh agent collections after creation settles |
| [#442](https://github.com/Maximilien-ai/clawmax/issues/442) | assess safe previews for generated HTML artifacts |
| [#443](https://github.com/Maximilien-ai/clawmax/issues/443) | clarify workflow run-input retention and saved defaults |
| [#444](https://github.com/Maximilien-ai/clawmax/issues/444) | make team leader editing discoverable and persistent |
| [#445](https://github.com/Maximilien-ai/clawmax/issues/445) | explain optional CLI runtime availability during setup |
| [#446](https://github.com/Maximilien-ai/clawmax/issues/446) | explain readiness changes after Improve with AI |
| [#447](https://github.com/Maximilien-ai/clawmax/issues/447) | clarify Builder keyboard submission and prompt transitions |
| [#448](https://github.com/Maximilien-ai/clawmax/issues/448) | assess shared-workspace workflow collaboration |
| [#449](https://github.com/Maximilien-ai/clawmax/issues/449) | adapt Builder guidance to empty workspaces and user intent |
| [Web #56](https://github.com/Maximilien-ai/clawmax-ai/issues/56) | use neutral feedback defaults and explain context fields |
| [Web #57](https://github.com/Maximilien-ai/clawmax-ai/issues/57) | investigate screenshot privacy false positives and recovery |

The HTML-preview and shared-collaboration proposals are decision work after the stability batch, not promised release scope. Runtime/model and workflow-result failures have high reported-impact priority. Individual issues retain their reproduction, persistence, failure and responsive acceptance requirements.

## Report-to-issue ledger

Only sanitized topic summaries and display references appear here. Full canonical Feedback-IDs are retained in GitHub provenance and private Management. Original descriptions, names, screenshots and credentials are not published.

| Reference | Sanitized topic | Disposition and tracking |
| --- | --- | --- |
| FB-ed332cef | 502 errors when changing agent models | New issues; report open — [#440](https://github.com/Maximilien-ai/clawmax/issues/440) |
| FB-29b097ce | unresponsive agent renaming | Existing work; report open — [#383](https://github.com/Maximilien-ai/clawmax/issues/383) |
| FB-14be576f | workflow download speed and ease | Positive acknowledgment; closed |
| FB-b733fa01 | follow-up requests restarting every agent | Existing work; report open — [#388](https://github.com/Maximilien-ai/clawmax/issues/388), [#338](https://github.com/Maximilien-ai/clawmax/issues/338) |
| FB-cecaa341 | a page for configuring provider APIs | Existing capability explained; closed — [#77](https://github.com/Maximilien-ai/clawmax/issues/77) |
| FB-23802f12 | a clear view of each agent’s work status | Existing work; report open — [#395](https://github.com/Maximilien-ai/clawmax/issues/395), [#409](https://github.com/Maximilien-ai/clawmax/issues/409) |
| FB-8014d973 | files that do not open and rejected screenshots | New issues; report open — [#382](https://github.com/Maximilien-ai/clawmax/issues/382), [#353](https://github.com/Maximilien-ai/clawmax/issues/353), [Web #57](https://github.com/Maximilien-ai/clawmax-ai/issues/57) |
| FB-aea16cc2 | empty workflow successes, delegation, Structure view, team-lead editing and simpler onboarding | New issues; report open — [#364](https://github.com/Maximilien-ai/clawmax/issues/364), [#395](https://github.com/Maximilien-ai/clawmax/issues/395), [#416](https://github.com/Maximilien-ai/clawmax/issues/416), [#396](https://github.com/Maximilien-ai/clawmax/issues/396), [#438](https://github.com/Maximilien-ai/clawmax/issues/438), [#444](https://github.com/Maximilien-ai/clawmax/issues/444) |
| FB-99b1ac38 | an interface that feels too complicated | Existing work; report open — [#396](https://github.com/Maximilien-ai/clawmax/issues/396) |
| FB-e1a3d4dc | the page not refreshing after agent creation | New issues; report open — [#350](https://github.com/Maximilien-ai/clawmax/issues/350), [#380](https://github.com/Maximilien-ai/clawmax/issues/380), [#441](https://github.com/Maximilien-ai/clawmax/issues/441) |
| FB-35c91db4 | previewing generated HTML inside ClawMax | New issues; report open — [#381](https://github.com/Maximilien-ai/clawmax/issues/381), [#442](https://github.com/Maximilien-ai/clawmax/issues/442) |
| FB-e19d52c6 | workflow input persistence after a run | New issues; report open — [#443](https://github.com/Maximilien-ai/clawmax/issues/443) |
| FB-7b4b78df | finding the generated-file editor directly | Existing work; duplicate closed — [#381](https://github.com/Maximilien-ai/clawmax/issues/381) |
| FB-4b5fcd10 | contradictory Bug/Delighted feedback defaults | New issues; report open — [Web #56](https://github.com/Maximilien-ai/clawmax-ai/issues/56) |
| FB-07af8e63 | when to start a workflow versus chat with agents | Existing work; report open — [#388](https://github.com/Maximilien-ai/clawmax/issues/388), [#357](https://github.com/Maximilien-ai/clawmax/issues/357), [#396](https://github.com/Maximilien-ai/clawmax/issues/396) |
| FB-da5e5380 | child sessions selecting an unavailable Codex harness | New issues; report open — [#395](https://github.com/Maximilien-ai/clawmax/issues/395), [#416](https://github.com/Maximilien-ai/clawmax/issues/416), [#439](https://github.com/Maximilien-ai/clawmax/issues/439) |
| FB-8c4933c8 | a screenshot-only bug report | Needs action/error text; open, no speculative issue |
| FB-7799dd5e | Sol model selections unsupported by the instance | New issues; report open — [#437](https://github.com/Maximilien-ai/clawmax/issues/437) |
| FB-08ad9118 | automatic creation helping beginners | Positive acknowledgment; closed |
| FB-66423e67 | finding generated HTML artifacts | Existing work; duplicate closed — [#381](https://github.com/Maximilien-ai/clawmax/issues/381) |
| FB-8adf9598 | streaming agent responses | Existing work; duplicate closed — [#225](https://github.com/Maximilien-ai/clawmax/issues/225), [#214](https://github.com/Maximilien-ai/clawmax/issues/214) |
| FB-ef399c10 | a disputed screenshot privacy finding | New issues; report open — [Web #57](https://github.com/Maximilien-ai/clawmax-ai/issues/57) |
| FB-59e8b15a | what to do after agents are created and screenshot rejection | New issues; report open — [#396](https://github.com/Maximilien-ai/clawmax/issues/396), [Web #57](https://github.com/Maximilien-ai/clawmax-ai/issues/57) |
| FB-3e4a9f33 | unexplained missing Droid and Claude Code utilities | New issues; report open — [#317](https://github.com/Maximilien-ai/clawmax/issues/317), [#445](https://github.com/Maximilien-ai/clawmax/issues/445) |
| FB-7666ba11 | the Builder-to-Template-Wizard transition | Positive acknowledgment; closed |
| FB-d5b0fb2e | a chat area that is too small relative to the prompt | Existing work; duplicate closed — [#413](https://github.com/Maximilien-ai/clawmax/issues/413) |
| FB-045191c0 | a lower readiness score after Improve with AI | New issues; report open — [#414](https://github.com/Maximilien-ai/clawmax/issues/414), [#243](https://github.com/Maximilien-ai/clawmax/issues/243), [#446](https://github.com/Maximilien-ai/clawmax/issues/446) |
| FB-dff47273 | unclear feedback rating and technical deployment fields | New issues; report open — [Web #56](https://github.com/Maximilien-ai/clawmax-ai/issues/56) |
| FB-45f06b9f | Enter submitting unexpectedly and leaving the original draft visible | New issues; report open — [#447](https://github.com/Maximilien-ai/clawmax/issues/447) |
| FB-b5eeb83d | shared workspaces, collaborative workflows, per-user agents, scoped connections and version history | New issues; report open — [Web #38](https://github.com/Maximilien-ai/clawmax-ai/issues/38), [#395](https://github.com/Maximilien-ai/clawmax/issues/395), [#448](https://github.com/Maximilien-ai/clawmax/issues/448) |
| FB-7e5f0906 | @agent and /question guidance before agents exist | New issues; report open — [#396](https://github.com/Maximilien-ai/clawmax/issues/396), [#389](https://github.com/Maximilien-ai/clawmax/issues/389), [#449](https://github.com/Maximilien-ai/clawmax/issues/449) |

## Ownership and remaining work

Dashboard owns the 13 public-runtime issues. Web owns #56/#57 and its bundled Management CLI/API. Shared-workspace collaboration #448 needs Web account/membership coordination and a phased authorization design; existing invitation support is not assumed to implement concurrent editing. Reporter replies and complete links stay in central Management.

Web fixed and deployed the earlier read blocker in `1ea5f9755016d871334b063b1612c53682c4da59`. Dashboard independently matched CLI 1.7.2 and binary SHA-256 `5c1efc7a0bad740271a90873e7bf553fc52846e49a0f47292ff6cede73fbd32c`, verified all-page reads and closed [Web #55](https://github.com/Maximilien-ai/clawmax-ai/issues/55). Dashboard does not claim Web's implementation/deployment as its own work.

Next work is linked issue reproduction/implementation, the one reporter clarification, and asynchronous notification delivery. Do not carry these engineering checks into the human Review queue or mark a whole multi-topic report resolved after only one topic ships.

Private receipts and temporary read snapshots remain outside Git under `/private/tmp/clawmax-feedback-triage-20261120/`. The data-free verification summary records 104 reports, 75 open / 29 closed, 31 reviewed reports, 17 converting reports, 15 issues, 48 saved replies and the final GitHub counts. No application code changed in this triage; relevant checks are the persisted-state/chronology/link audit and documentation link/diff checks.

## Earlier blocked checkpoint (preserved history)

<details>
<summary>Before Web restored bounded feedback reads</summary>

### Post-SF feedback triage checkpoint — November 20, 2026

Status: **waiting on Web feedback-read repair**. Individual report review and reporter responses are not complete.

The owner requested the established process: read each new report and conversation, thank the reporter before creating issues, check open/closed duplicates and fix evidence, consolidate related scope, preserve all issue links and report before/after counts. Public issues receive sanitized technical summaries and canonical Feedback-IDs only.

### Observed baseline

GitHub issue snapshots exclude pull requests:

| Repository | Open before triage | Closed | Total |
| --- | ---: | ---: | ---: |
| Dashboard `Maximilien-ai/clawmax` | 101 | 169 | 270 |
| Web `Maximilien-ai/clawmax-ai` | 16 | 17 | 33 |

Authenticated Management insights on November 20 report **104 total feedback reports**, **30 marked new**, and **31 needing a reply**. These are different measures; none is a completed classification count. The November 17 handoff recorded 73 total reports and no outstanding needs-reply reports.

The public event is **ClawMax.ai Build Night San Francisco**, slug `clawmax-build-night-1`, scheduled November 18, 2026, 17:00–21:00 America/Los_Angeles. The authenticated event-scoped insights returns **31 reports** in its submission-time window (`2026-11-19T01:00:00Z` through exclusive `2026-11-19T21:00:00Z`). The returned end includes the service's submission window; it differs from the scheduled event end. Time-window inclusion does not prove individual event attendance.

### Read blocker and action taken

Management authentication succeeds with the repository-built CLI **1.7.2**. The following reads each fail with `decode ClawMax.ai response: unexpected end of JSON input`:

```sh
cli/bin/clawmax-ai management feedback list --all --archive all --json
cli/bin/clawmax-ai management feedback list --page 1 --page-size 10 --archive all --json
cli/bin/clawmax-ai management feedback list --page-size 1 --archive active --json
```

Web source inspected: `df48a045c83d4f7e49ef193630b0e5c7a9009c3f`. Its API returns all formatted feedback with inline image attachments. The CLI's HTTP reader stops at 4 MiB; pagination and attachment minimization happen after decoding. A smaller CLI page cannot bound the transport. Aggregate insights succeeds separately.

Created [Web #55: bound Management feedback reads before CLI decoding](https://github.com/Maximilien-ai/clawmax-ai/issues/55), after checking the Web catalog for an existing equivalent. Historical [Web #42](https://github.com/Maximilien-ai/clawmax-ai/issues/42) concerns authentication/backoff and does not cover this failure. #55 requests server-side pagination, privacy-minimized list transport, accurate all-page exhaustion, oversized-response tests and live API/CLI verification. Dashboard has not changed Web implementation or deployment.

Delivered shared handoff `20261120T204020Z_Dashboard-to-Web_feedback-bounded-read.md`, registered as **DASHBOARD-WEB-03 / feedback-bounded-read** in the active `handoffs 2` directory. Web owns the next repair/verification step; Dashboard owns resumed reporter-by-reporter triage.

The shared board validation command ran and exited 1 on existing convention violations in other handoffs; it reported no violation for this new handoff. This is not a clean-board validation claim.

### Counts at this checkpoint

- Feedback-derived issues created: **0**; conversion count remains **unassessed**, not zero reports warranting issues.
- Reporter replies, notification requests and report closures: **0**.
- Engineering blockers created: **1**, Web #55; this must not be counted as converted participant feedback.
- Dashboard open/total count unchanged: **101 / 270**.
- Web open/total after #55: **17 / 34**, confirmed by a fresh GitHub read; concurrent changes remain possible before the final triage summary.

### Resume criteria

1. Web returns exact source/version, deployed API/CLI identity and a successful bounded live report-list read. Do not infer deployment from a source change.
2. Fetch all active/archive pages and conversations; reconcile reports since the last 73-report checkpoint, the 31-report SF window, needs-reply state and late arrivals.
3. Read full multi-topic scope; thank each reporter before creating feedback-derived issues. For duplicates, link the canonical issue; for verified fixes, cite source/test/release evidence without claiming a live upgrade. Do not infer user error from missing evidence.
4. Create only missing scoped issues in their owning repositories, cross-link related work, and retain every existing Management issue link. Save replies with stable request keys and record notification receipts separately from delivery.
5. Recount unique reports reviewed, reports generating new issues, number of new issues, duplicates, already-fixed/supported reports and unresolved clarification. Record final open/closed/total issue counts separately from report counts.

Private scratch reads and receipts are outside Git under `/private/tmp/clawmax-feedback-triage-20261120/`. No original report text, participant identities, screenshots or credentials are copied into this checkpoint.

</details>
