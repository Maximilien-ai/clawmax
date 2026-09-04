# AgentForge Activity Export Profile

**Profile:** `agentforge.activity-export/v1`

**ClawMax schema:** `clawmax.activity-export/v1`

**Destination ID:** `agentforge`

## Purpose and consent

The disclosed purpose is:

> Provide event-scoped learning support, progress evidence, prompt coaching,
> and improvement of hackathon tutorials.

Configuring AgentForge is not consent. Before capture, the participant must
connect an AgentForge enrollment and explicitly select one or more supported
scopes. The confirmation is not preselected and names the destination, purpose,
data categories, pseudonymous identity mode, retention, privacy URL, and how to
stop sharing.

Initial retention is limited to the event window plus 30 days. Revocation stops
new capture immediately, removes undelivered events from the ClawMax outbox,
and sends a receipt-linked purge request to AgentForge. AgentForge is responsible
for deleting delivered raw evidence, normalized records, and derived Cognee
memory covered by that receipt. Audit metadata may retain the receipt ID,
timestamps, deletion status, and aggregate counts, but not deleted content.

## Supported scopes

| Scope | Shared evidence | AgentForge use |
|---|---|---|
| `agent-chat` | Participant prompt and directly paired visible assistant response; selected context only when already visible and explicitly included | support and prompt coaching |
| `workflow` | Participant-visible workflow instruction, state, result, and error metadata | progress and outcome evidence |
| `builder` | Participant-visible builder action, response, test result, and error metadata | build progress and tutorial friction |

`group-chat` and `community-chat` are rejected in this profile. Hidden prompts,
chain-of-thought, unseen agent-to-agent traffic, credentials, environment
variables, attachment contents, workspace files, local paths, and activity that
predates consent are never included.

## Participant mapping

ClawMax exchanges the participant's single-use AgentForge connection code using
server-to-server authentication. Wire identity uses:

- `workspaceId = ws_<SHA-256(local workspace identity)>`
- `userId = usr_<SHA-256(destination + workspace + authenticated user)>`
- `enrollmentId = AgentForge-issued partner-scoped identifier`

The raw local workspace path, login, email, name, AgentForge Session, and
connection code are never placed in an exported event. The same opaque IDs are
used for enrollment exchange, receipt registration, activity delivery, and
purge authorization.

## Frozen event and delivery contract

Events use the existing compact `clawmax.activity-export/v1` schema and batch
envelope. Each event includes `eventId`, `destinationId`, `consentReceiptId`,
`source`, `occurredAt`, opaque `workspaceId` and `userId`, plus optional
`sessionId`, `subjectId`, redacted `content`, and bounded metadata.

Delivery is asynchronous and at least once. `Idempotency-Key` equals `batchId`.
AgentForge returns HTTP `202` with accepted and duplicate event IDs. A batch is
retried as a whole; an authorization or schema error rejects the batch. The
sender retains failed events and exposes queue, retry, and last-error status.

The credential is server-managed and scoped to this destination. Production
deployments use separately rotatable credentials per environment or ClawMax
instance.
