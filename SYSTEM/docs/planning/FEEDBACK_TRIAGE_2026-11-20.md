# Post-SF feedback triage checkpoint — November 20, 2026

Status: **waiting on Web feedback-read repair**. Individual report review and reporter responses are not complete.

The owner requested the established process: read each new report and conversation, thank the reporter before creating issues, check open/closed duplicates and fix evidence, consolidate related scope, preserve all issue links and report before/after counts. Public issues receive sanitized technical summaries and canonical Feedback-IDs only.

## Observed baseline

GitHub issue snapshots exclude pull requests:

| Repository | Open before triage | Closed | Total |
| --- | ---: | ---: | ---: |
| Dashboard `Maximilien-ai/clawmax` | 101 | 169 | 270 |
| Web `Maximilien-ai/clawmax-ai` | 16 | 17 | 33 |

Authenticated Management insights on November 20 report **104 total feedback reports**, **30 marked new**, and **31 needing a reply**. These are different measures; none is a completed classification count. The November 17 handoff recorded 73 total reports and no outstanding needs-reply reports.

The public event is **ClawMax.ai Build Night San Francisco**, slug `clawmax-build-night-1`, scheduled November 18, 2026, 17:00–21:00 America/Los_Angeles. The authenticated event-scoped insights returns **31 reports** in its submission-time window (`2026-11-19T01:00:00Z` through exclusive `2026-11-19T21:00:00Z`). The returned end includes the service's submission window; it differs from the scheduled event end. Time-window inclusion does not prove individual event attendance.

## Read blocker and action taken

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

## Counts at this checkpoint

- Feedback-derived issues created: **0**; conversion count remains **unassessed**, not zero reports warranting issues.
- Reporter replies, notification requests and report closures: **0**.
- Engineering blockers created: **1**, Web #55; this must not be counted as converted participant feedback.
- Dashboard open/total count unchanged: **101 / 270**.
- Web open/total after #55: **17 / 34**, confirmed by a fresh GitHub read; concurrent changes remain possible before the final triage summary.

## Resume criteria

1. Web returns exact source/version, deployed API/CLI identity and a successful bounded live report-list read. Do not infer deployment from a source change.
2. Fetch all active/archive pages and conversations; reconcile reports since the last 73-report checkpoint, the 31-report SF window, needs-reply state and late arrivals.
3. Read full multi-topic scope; thank each reporter before creating feedback-derived issues. For duplicates, link the canonical issue; for verified fixes, cite source/test/release evidence without claiming a live upgrade. Do not infer user error from missing evidence.
4. Create only missing scoped issues in their owning repositories, cross-link related work, and retain every existing Management issue link. Save replies with stable request keys and record notification receipts separately from delivery.
5. Recount unique reports reviewed, reports generating new issues, number of new issues, duplicates, already-fixed/supported reports and unresolved clarification. Record final open/closed/total issue counts separately from report counts.

Private scratch reads and receipts are outside Git under `/private/tmp/clawmax-feedback-triage-20261120/`. No original report text, participant identities, screenshots or credentials are copied into this checkpoint.
