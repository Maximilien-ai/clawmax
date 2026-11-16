# Review

Review is a public ClawMax plugin for release-specific acceptance work that
requires independent human judgment or an external environment.

Each release keeps its own checklist, outcomes, notes, evidence, owner, and
verifier history. Superseded releases remain archived rather than being copied
forward as unfinished tester work. Engineering-owned unit, integration,
browser, source-contract, CI, version, health, architecture, and catalog checks
belong in automated release evidence instead of the active reviewer queue.

Review can generate documents and notifications through explicit host
capabilities. It does not gain unrestricted workspace, credential, or plugin
access, and disabling it preserves its saved workspace state.

## Run and return a release review

Open **Extensions → Review → Suggested**, then **Start [release] checklist**.
The RC95 catalog includes P1–P12. Each workspace starts with its own pending
results; earlier releases remain historical. In Active, select the release,
record outcomes and notes, and preserve other reviewers' evidence.

Use **Actions → Export / submit release review** to enter reviewer identity and
environment. Export downloads Markdown. Email submission requires Resend in
Partners: enter a recipient, prepare and inspect the report, then explicitly send.
Email includes results, notes, evidence links, reviewer and instance details;
it excludes chat transcripts and runtime logs. Redaction runs before the email
report is stored. Nothing is emailed simply by checking a result.

Delivery is asynchronous. The retained report shows queued/sending/provider
acceptance or an unconfirmed result. Provider acceptance is not an inbox-delivery
receipt. Interrupted or uncertain sends are never automatically resent; check the
receiving mailbox before preparing another email. Downloads remain available.

An operator can set `CLAWMAX_REVIEW_RECIPIENT`, or put a `recipient` email in the
workspace's `SYSTEM/review-settings.json`, to prefill the destination. This does
not configure a mail provider or consent to sending. Each submission still shows
its destination and requires an explicit Send action. Mail credentials stay in
the existing Partners configuration; do not put them in review notes or reports.
