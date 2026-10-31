# RC97 feedback triage — October 31, 2026

Read through the authenticated ClawMax.ai CLI 1.6.8, contract
`clawmax.ai/v1alpha1`: 41 records, complete bounded pagination, no attachments.
No private participant identities, raw prompts or customer files are reproduced.
Reports are submitted evidence, not independently verified fixes.

## Outcome

- 28 reports already had Dashboard issues; reused them without duplicates.
- Opened Dashboard #380–#383 for four actionable reports requiring reproduction.
- Opened Web #29 for mobile registration, #31 for prompting training and #32
  for historical Client console search; Web #30 tracks audited CLI responses.
- 33 accepted investigations, two deferred Web/training improvements, three
  clarification replies approved by the user, and three positive acknowledgments.
- Prepared one response per feedback ID with a decision, existing-feature hints
  where useful, and issue links. Posting is pending the Web team's response CLI;
  no customer response or email has been sent. Do not infer delivery from drafts.

Accepted means investigate and validate, not guarantee every item ships in RC97.
For finding files, recommend existing Cmd+K / Ctrl+K or the top Search control in
Dashboard. Search is not a fix for a broken file link or missing permissions.
Treat display-name editing as an existing-feature/discoverability investigation
before introducing another control. Do not claim a shortcut exists in Web's
Client console merely because Dashboard implements it.

## Implementation order

1. Security: PR #349; review old-record remediation separately. Also assess #348
   (utility-model usage not represented in Dashboard) before trusting budget coverage.
2. Data preservation: #351, #352, #355, #367, #375 and recoverable template apply.
3. Budget/count correctness: #350, #354, #361, #362, #376–#378; preserve unknown
   and stale states instead of reporting zero or resetting saved configuration.
4. Crashes and false-success controls: #364, #370–#374, #358.
5. Document access/export and navigation: #353, #365, #366, #368, #369, #379,
   #381, #382; then provisioning/rename usability #380, #383.
6. Logs and explanatory states: #356, #357, #359, #360, #363.

#352 and #379 were found in the issue inventory without a matching feedback
record in this batch; include them in investigation, without inventing a feedback
submission or response. Existing provider-pair/WhatsApp work and PR review gates
remain in the main RC97 intake plan. Web items are owned and released by Web.

## Per-item disposition

Authenticated source: https://www.clawmax.ai/admin/customer-feedback . Locate by
immutable feedback ID; the current source does not establish a per-record deep link.

| Feedback ID | Sanitized summary | Decision | Tracking |
| --- | --- | --- | --- |
| `b43e5f84-e15c-4a23-b6d2-19e2357ad86a` | Workspace creation reports success when saving the selected budget fails | accepted | [#378](https://github.com/Maximilien-ai/clawmax/issues/378) |
| `ccb1f18a-36be-46fd-ac96-0b18ce62b4d0` | Workspace rename overwrites budget defaults after a failed settings load | accepted | [#377](https://github.com/Maximilien-ai/clawmax/issues/377) |
| `c97a69a7-ae8f-490e-9d68-aec9612544b2` | Workspace creation silently changes a zero budget to $10 | accepted | [#376](https://github.com/Maximilien-ai/clawmax/issues/376) |
| `9aa64d78-f04a-4bdc-90d2-110134ec50c6` | Agent provisioning blocks navigation | accepted | [#380](https://github.com/Maximilien-ai/clawmax/issues/380) |
| `784341ae-8be9-49e4-a622-29da17f34db3` | Mobile registration discovery | accepted | [#29](https://github.com/Maximilien-ai/clawmax-ai/issues/29) |
| `a9649a5a-66ef-47ba-a6e5-f67d6e09ac3d` | Workflow editor: an unchanged save silently deletes additional output definitions | accepted | [#375](https://github.com/Maximilien-ai/clawmax/issues/375) |
| `b6974caf-8018-4e1c-a424-6f58075f9042` | Workflows: bulk Resume reports success when updates return HTTP errors | accepted | [#374](https://github.com/Maximilien-ai/clawmax/issues/374) |
| `52b4a878-466b-4e07-ab48-7909682f7c29` | Skills: failed export is silent because its error handler throws | accepted | [#373](https://github.com/Maximilien-ai/clawmax/issues/373) |
| `e53bad2a-30e9-4b4a-ad24-20641a762ca6` | Builder: local fallback fails with orgTemplates is not defined after HTML response | accepted | [#372](https://github.com/Maximilien-ai/clawmax/issues/372) |
| `c3a21579-d962-4ee6-8326-f495f117da90` | Agents: Status action in Detail view fails with undefined callback | accepted | [#371](https://github.com/Maximilien-ai/clawmax/issues/371) |
| `3640cced-6998-4424-9e1e-c10b6fa83501` | Workflows: List view Select all throws and selects no rows | accepted | [#370](https://github.com/Maximilien-ai/clawmax/issues/370) |
| `87c0089c-4763-4abb-9ea9-c4f8ed3f7b33` | Documents: PDF export leaves literal HTML entities in rendered prose | accepted | [#369](https://github.com/Maximilien-ai/clawmax/issues/369) |
| `2b989c75-dcc6-43d3-b5dc-2ab2e2ca7406` | Documents: uppercase .MD uploads succeed but cannot be opened | accepted | [#368](https://github.com/Maximilien-ai/clawmax/issues/368) |
| `a06abc9f-a665-4d03-aff3-75db96869892` | bug: Workflow Markdown export and import silently lose dependencies and workflow type | accepted | [#367](https://github.com/Maximilien-ai/clawmax/issues/367) |
| `300b6d22-70b1-41ae-9dea-734d0d69694a` | bug: Keyboard selection in global search moves offscreen without scrolling | accepted | [#366](https://github.com/Maximilien-ai/clawmax/issues/366) |
| `1051cc79-15f4-4397-abfe-7ca8acd92ec9` | bug: Markdown workspace links open Builder and relative images fail to load | accepted | [#365](https://github.com/Maximilien-ai/clawmax/issues/365) |
| `3ab07c6c-8b0a-4e8f-b40e-62bbd1d407fa` | bug: First-time anonymous visitors receive a false session-expired warning | accepted | [#356](https://github.com/Maximilien-ai/clawmax/issues/356) |
| `d7ffdd5c-e01c-4e2c-9992-eb8893426516` | bug: Enabled manual-only workflows are told to enable scheduling and wait for a scheduled run | accepted | [#357](https://github.com/Maximilien-ai/clawmax/issues/357) |
| `59ee61aa-549d-4804-9f68-36f919b33bdb` | bug: Workspace selector reports 0 agents while the same workspace has 3 active agents (RC96) | accepted | [#350](https://github.com/Maximilien-ai/clawmax/issues/350) |
| `064b7a33-411f-47b0-bdad-ab2ed8b554ff` | bug: Activity request failures are presented as zero spending and no activity | accepted | [#361](https://github.com/Maximilien-ai/clawmax/issues/361) |
| `e06f1d60-7397-4fad-a252-05ff9c4fbfbc` | bug: Organization search hides matching subteams when their parent does not match | accepted | [#363](https://github.com/Maximilien-ai/clawmax/issues/363) |
| `df083e5e-43f1-48ab-8df5-91579f38e2c2` | bug: Logs replaces original event timestamps with receipt time and treats timestamps as agents | accepted | [#359](https://github.com/Maximilien-ai/clawmax/issues/359) |
| `4f7002d7-343a-4ee1-900e-d2681d446841` | bug: Pause and Resume triplicate existing log history and downloaded logs | accepted | [#360](https://github.com/Maximilien-ai/clawmax/issues/360) |
| `1bdd4967-aa08-4fcd-8abe-fdc670dbb489` | bug: Active workflows show Ready with Pause disabled until the first polling refresh | accepted | [#358](https://github.com/Maximilien-ai/clawmax/issues/358) |
| `224d7f2f-d2b0-4fcb-a210-4b43028b6bdc` | bug: Every workflow card and list row displays the whole workspace cost | accepted | [#354](https://github.com/Maximilien-ai/clawmax/issues/354) |
| `762eb911-685f-4b0a-8e55-048952ea0013` | bug: Metering aggregate totals undercount their own agent and daily breakdowns | accepted | [#362](https://github.com/Maximilien-ai/clawmax/issues/362) |
| `daa87d3a-e1ff-45b5-8ed1-d6f1563c0bff` | bug: Unsupported file previews become empty Markdown and download as zero-byte files | accepted | [#353](https://github.com/Maximilien-ai/clawmax/issues/353) |
| `4f713580-97b7-406c-8acc-60d6594df325` | bug: Documents silently discards unsaved edits when another file is selected | accepted | [#355](https://github.com/Maximilien-ai/clawmax/issues/355) |
| `07250751-0985-4571-bd29-157a1f0f7b29` | bug: Create New Document silently overwrites an existing file at the same path | accepted | [#351](https://github.com/Maximilien-ai/clawmax/issues/351) |
| `f39d0971-b936-4e16-9cdb-221d148a9957` | Positive usability feedback | no-change | Acknowledgment only |
| `34316c35-5685-4108-b0b0-11a13c6b6827` | Document discovery guidance | accepted | [#381](https://github.com/Maximilien-ai/clawmax/issues/381) |
| `0d8599ad-5f3a-49b8-b65c-cdcc104edff6` | Agent prompting guidance | deferred | [#31](https://github.com/Maximilien-ai/clawmax-ai/issues/31) |
| `cc15f9f7-9de9-49fb-bbe0-ea49219e6a36` | Multi-agent chat file links | accepted | [#382](https://github.com/Maximilien-ai/clawmax/issues/382) |
| `1754f019-747e-4e45-a93b-4760b16b9c2b` | bug: Organization Structure view crashes with openOrganizationDoc is not defined | accepted | [#364](https://github.com/Maximilien-ai/clawmax/issues/364) |
| `c4bf374a-4330-49a8-82a0-365b7832026e` | Four-agent workflow report needs failing step | needs-information | No issue until clarification |
| `67ccd721-8882-4812-8ab0-ae8383c3555f` | Agent display-name editing discovery | accepted | [#383](https://github.com/Maximilien-ai/clawmax/issues/383) |
| `05ff6aa5-5484-4dc6-b3e9-f096cac338d4` | Unspecified mobile navigation difficulty | needs-information | No issue until clarification |
| `dada5813-4ddd-498b-a910-aecb06860526` | Historical Client search and feedback categories | deferred | [#32](https://github.com/Maximilien-ai/clawmax-ai/issues/32) |
| `e99d1e11-5c95-4e5c-bc45-1e4fcb614781` | Historical deployment readiness report | needs-information | No issue until clarification |
| `0ddb103b-4fb9-4749-8c75-2a15cb451ebc` | Positive feedback | no-change | Acknowledgment only |
| `2905fb7f-099c-41eb-b73f-92c509e6a1c8` | Positive feedback | no-change | Acknowledgment only |

## Response acceptance

Before posting, verify a version-matched, server-allowlisted Management response
command, exact feedback ID, expected revision/idempotent request and saved receipt.
Re-read each record to confirm the saved decision and links. No automatic email:
notification is a separate explicit operation. Reconcile newly posted team replies
before writing so stale drafts do not overwrite another response. Preserve original
feedback and all response history. Ambiguous cases ask for the failing step/error,
mobile screen/device, or whether the historical deployment problem persists.
