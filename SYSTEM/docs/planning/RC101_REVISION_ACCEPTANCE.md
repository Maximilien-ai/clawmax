# RC101 follow-up acceptance

The original release accounts for four accepted and closed issues out of the 93 high and medium issues at triage. This revision has 13 implementation changes counted by issue and seven confirmations of existing fixes. Owner acceptance is pending for all 20. The published RC101 image predates this revision.

| Checkpoint | Issues added | Cumulative if accepted |
| --- | --- | --- |
| Documents, agent Status, skill export, search | #352, #353, #368, #371, #373, #366 | 10/93 (10.8%) |
| Organization, Builder, Workflows | #363, #364, #372, #358 | 14/93 (15.1%) |
| PDF, session expiry, pricing and menu | #369, #426, #356, #253, #310 | 19/93 (20.4%) |
| Builder scrolling and result-panel toggle | #259, #261 | 21/93 (22.6%) |
| Scheduler isolation, workflow editor persistence and agent chat model selection | #247, #255, #336 | 24/93 (25.8%) |

## One owner walkthrough

Use the [local revision preview](http://localhost:5190). Product source is `b9dd43bc`.

- [ ] **Documents** — Quickly switch between two Markdown files. Open Edit and verify the selected file's text. A mixed-case .MD file should open and save. A binary file should explain why preview is unavailable. Export Markdown containing entities and nested checkboxes as PDF. Each checkbox should sit beside its label and prose should read like the preview. Code examples retain literal entities.
- [ ] **Agents, search and skills** — Open a detail card's menu, choose Status and confirm the panel opens for that agent. On a short screen, Escape should return focus to the menu button. Arrow down through global search results and confirm the highlight stays visible. Export a skill successfully. Engineering tested failed export and retry.
- [ ] **Organization** — Filter to a nested team whose parent does not match. Open the matching team and its document. Confirm the result opens the correct item.
- [ ] **Builder and Workflows** — Before the first recommendation, scroll to Suggested requests. Request a recommendation, then hide and show its result panel. Check the conversation and prompt remain usable. Reload Workflows with a known running or failed workflow and check the first displayed status. Engineering exercises the unavailable recommendation service separately.
- [ ] **Accept engineering evidence** — Anonymous and expired-session responses, model-specific pricing, and failure cases above are covered by focused checks. These need no credential changes by the owner.

After sign-off, record accepted issue IDs, the merged SHA and reporter dispositions. For a regression, reopen the original issue with the source or image digest, workspace state, failing step and observed result. Preserve the original acceptance record. Track source CI, image publication and mirror digests separately.

On November 23, Chrome exercised Suggested requests with wheel input, focus and Space, then clicked the single result-panel toggle in both states and checked transcript height. Viewports were 390×844, 820×1180, 1024×560/640, 1280×720 and 1440×760/900. Both added issues concern behavior already present in the tested product source.

For the 25% milestone, open **RC101 Quarter Manual Review** in the Workflows editor. Expect a manual schedule, a run limit of four, a Report output and a test-kickoff input. Engineering verified persistence via local HTTP, rejection of invalid cron and time zones, scheduler isolation and disabled ticks. Model discovery and default-model suites passed for the existing chat-model filtering behavior. No provider key change is needed.

## November 24 owner walkthrough

Confirmed Documents, global search, skill export, Builder and Workflow Edit. Agent Status remains open after the gateway rejected the status handshake. Organization needs a recheck for group collapse and nested-team output navigation. Workflow Edit tabs are a follow-up design suggestion.

Owner confirmed Agent Status and the Organization changes. Three follow-up checks remain on the local preview.

- [x] Open Test Lead → Status. Live Logs should populate with gateway log lines.
- [x] In Organization, expand Communities and toggle Test Team twice. Its workflows should open and close with its members.
- [ ] Edit RC101 Quarter Manual Review. Confirm the Basics, Schedule & limits, and Inputs & outputs tabs show the saved workflow, the four-run limit and the Report handoff. Save Changes is reachable from each tab.

The owner confirmed the original tab layout. For the revised editor, check that Basics contains name, description and instructions, Execution contains mode and managed owner, and Participants contains targeting.
