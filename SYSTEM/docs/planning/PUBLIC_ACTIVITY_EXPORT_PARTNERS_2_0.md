# Public Activity Export And Partner Ingestion

> Status: design approved; implementation not started
> Release target: `2.0.0` public platform contract and ClawMax.ai reference receiver
> First external adapter: Digo, after the partner implements the agreed contract
> Last updated: July 24, 2026

## Decision Summary

ClawMax will provide a public, vendor-neutral **Activity Export** service. Digo
is the first intended external partner, but transcript capture must not be
implemented as Digo-specific code inside chat or workflow routes.

The service will:

- remain disabled by default;
- require explicit consent from each affected user, even when a workspace owner
  has configured a destination;
- name the destination and purpose before consent;
- show a persistent, unobtrusive status pill whenever activity is being
  captured for a destination;
- capture only the categories and time window covered by the consent receipt;
- redact known secrets and exclude tool internals, attachments, and files by
  default;
- append to a durable local outbox after ClawMax has persisted the source
  activity;
- deliver batches asynchronously so a slow or unavailable partner cannot slow
  agent chat or workflow execution;
- provide immediate opt-out and purge unsent data for that user by default; and
- use a versioned, authenticated, idempotent API contract that ClawMax.ai can
  implement first and Digo can implement later.

The ClawMax.ai receiver is a reference implementation and test destination. It
must be displayed as `ClawMax.ai`, not presented as Digo and not silently
repointed to Digo after a user has consented.

## Why This Is A Platform Contract

Event partners may need transcripts to confirm that participants followed a
script, understand where they deviated, and improve future activities. Other
partners may need similarly scoped activity for support, training, research, or
customer-managed compliance. The common problem is consented, accountable
export, not a special chat hook for one vendor.

ClawMax already sends explicitly shared template and Builder data to
ClawMax.ai over HTTPS with deployment-managed bearer tokens. That is useful
transport precedent, but transcript export has a higher privacy and durability
bar. Existing share calls are feature-specific and synchronous; Activity Export
requires consent receipts, redaction, a durable bounded outbox, delivery
acknowledgements, replay protection, and visible operational state.

Activity Export is a host service available to public partner integrations. It
does not imply that every partner is a plugin or that every plugin can read
conversations.

## Product Model

Four states are separate:

1. **Destination configured**: an operator has installed/configured a partner
   destination and its server-managed credential.
2. **Enrollment prepared**: an event, script, purpose, and participant mapping
   have been selected.
3. **User consented**: the authenticated user accepted a specific version of
   the disclosure for named scopes and a named destination.
4. **Delivery healthy**: the outbox worker is successfully delivering accepted
   events.

Configuring or enabling a partner is never consent on behalf of workspace
users. A shared workspace can have users who opted in and users who did not.
Only activity attributable to a currently consented user is eligible.

### Initial Capture Scopes

The first contract should support these independently selectable scopes:

| Scope | Included | Default |
|---|---|---|
| `conversation.direct` | User prompts and agent replies in direct agent chat | Offered |
| `conversation.group` | User turns and visible agent replies in group/community chat | Offered |
| `workflow.instructions` | One-off user run instructions and declared workflow inputs | Offered |
| `workflow.outputs` | Visible participant/final workflow responses and status | Offered |
| `builder.conversation` | User and assistant turns in AI Builder | Separate opt-in |

The following remain excluded unless a future contract adds a separate,
specific consent and security review:

- agent-to-agent internal messages that the user did not submit;
- hidden prompts, system prompts, chain-of-thought, or model internals;
- tool arguments, tool results, environment variables, and authorization data;
- attachment binaries, uploaded file contents, and workspace documents;
- browser activity, keystrokes, unrelated page navigation, and historical
  activity created before consent; and
- conversations belonging to another user in the same workspace.

Attachment names and content hashes may be exported only if the disclosure
names that metadata and it is needed to correlate the scripted activity.

## Consent And User Experience

### Consent Receipt

Consent uses a versioned receipt with at least:

```json
{
  "receiptId": "consent_01...",
  "version": "activity-export-consent/v1",
  "userId": "opaque-authenticated-user-id",
  "workspaceId": "opaque-workspace-id",
  "destination": {
    "id": "digo",
    "displayName": "Digo"
  },
  "enrollment": {
    "eventId": "partner-event-id",
    "scriptId": "optional-script-id",
    "participantId": "partner-pseudonymous-participant-id"
  },
  "purpose": "Event script participation and improvement",
  "scopes": [
    "conversation.direct",
    "workflow.instructions",
    "workflow.outputs"
  ],
  "consentedAt": "2026-07-24T18:00:00.000Z",
  "expiresAt": "2026-07-25T02:00:00.000Z",
  "privacyUrl": "https://partner.example/privacy"
}
```

The confirmation cannot use a preselected consent checkbox. It must identify:

- the receiving company;
- the event and purpose;
- the content categories that will be sent;
- whether name/email or a pseudonymous participant id will be sent;
- the capture start and expiration;
- the partner privacy and retention policy; and
- how to stop capture and what happens to queued/already delivered data.

The default identity is a partner-scoped pseudonymous id. Sharing a user's name
or email is an additional disclosed field, not an incidental session attribute.

### Persistent Indicator

While consent is active, the normal dashboard header shows a compact pill:

- `Sharing with Digo` when capture and delivery are healthy;
- `Digo sharing delayed` when events are queued because the destination is
  unavailable; or
- `Digo sharing needs attention` when authorization or configuration failed.

The pill appears on desktop and mobile and remains visible outside chat. Opening
it shows the destination, event, scopes, start/expiry, last successful delivery,
queued count, privacy link, and `Stop sharing` action. A short first-use notice
may also appear beside the chat/workflow surface, but it must not repeatedly
interrupt the user.

Stopping sharing:

1. revokes the local consent immediately;
2. prevents any new eligible event from entering the outbox;
3. purges unsent events for that receipt by default; and
4. explains that already delivered data is controlled by the destination,
   with a deletion-request action if the partner contract supports one.

## Canonical Event Contract

Each visible turn or workflow activity is a separate ordered event. Keeping user
and agent turns separate preserves timing and partial failures without replacing
the user's transcript with a reconstructed blob.

```json
{
  "schemaVersion": "clawmax.activity-export/v1",
  "eventId": "evt_01...",
  "eventType": "conversation.turn",
  "occurredAt": "2026-07-24T18:03:12.442Z",
  "recordedAt": "2026-07-24T18:03:12.451Z",
  "sequence": 12,
  "source": "agent-chat",
  "workspace": {
    "id": "opaque-workspace-id",
    "instanceId": "opaque-instance-id",
    "deploymentKind": "cloud"
  },
  "enrollment": {
    "partner": "digo",
    "eventId": "event-2026-agents",
    "scriptId": "create-support-agent",
    "participantId": "participant_opaque"
  },
  "conversation": {
    "id": "conversation_opaque",
    "turnId": "turn_opaque",
    "parentTurnId": "optional-parent-turn"
  },
  "actor": {
    "type": "user",
    "pseudonymousId": "actor_partner_scoped",
    "agentId": null
  },
  "content": {
    "format": "text/markdown",
    "text": "Create an agent that helps triage support email.",
    "sha256": "content-hash",
    "truncated": false,
    "redactions": []
  },
  "execution": {
    "status": "completed",
    "model": null,
    "provider": null,
    "inputTokens": null,
    "outputTokens": null,
    "durationMs": null
  },
  "consent": {
    "receiptId": "consent_01...",
    "version": "activity-export-consent/v1"
  }
}
```

Supported initial `source` values are `agent-chat`, `group-chat`,
`community-chat`, `workflow`, and `builder`. User and agent events use
`conversation.turn`; workflow lifecycle can additionally use
`workflow.started`, `workflow.completed`, or `workflow.failed`.

Identifiers sent to a destination must be opaque and destination-scoped. The
receiver must not infer filesystem paths, internal authentication tokens, or
cross-partner identity from them.

## Batch Ingestion API

The proposed portable endpoint is:

```http
POST /v1/clawmax/activity-events:batch
Authorization: Bearer <server-managed-ingestion-token>
Content-Type: application/json
Idempotency-Key: batch_01...
X-ClawMax-Schema-Version: clawmax.activity-export/v1
```

```json
{
  "batchId": "batch_01...",
  "destinationId": "clawmax-ai",
  "sentAt": "2026-07-24T18:03:20.000Z",
  "events": []
}
```

Successful ingestion returns `202 Accepted`:

```json
{
  "batchId": "batch_01...",
  "acceptedEventIds": ["evt_01..."],
  "duplicateEventIds": [],
  "rejected": [
    {
      "eventId": "evt_02...",
      "code": "invalid_event",
      "message": "source is not supported"
    }
  ]
}
```

Response behavior:

- `200` or `202`: acknowledge accepted and duplicate ids; retry only transient
  per-event rejections.
- `401` or `403`: pause the destination and show `needs attention`; do not retry
  continuously.
- `409`: treat a recognized idempotency conflict as already accepted.
- `413`: split the batch and retry within the configured event size limit.
- `429`: honor `Retry-After`.
- `5xx` or network timeout: exponential backoff with jitter.
- permanent `4xx` event rejection: move only the rejected event to dead letter
  and retain a sanitized operator-visible reason.

Every `eventId` is globally unique and every `batchId` is stable across retries.
This gives at-least-once transport and effectively-once ingestion when the
receiver enforces event and batch idempotency.

### Authentication

The reference receiver can start with the same deployment-managed bearer-token
pattern used by current ClawMax.ai template/Builder sharing, but uses a distinct,
least-privilege token:

- `ACTIVITY_EXPORT_CLAWMAX_AI_URL`
- `ACTIVITY_EXPORT_CLAWMAX_AI_TOKEN`

The token is server-managed, encrypted or supplied by infrastructure, never
returned to the browser, never injected into an agent, and never included in
logs, support bundles, or exported events.

For Digo, use a distinct destination credential and endpoint. OAuth 2 client
credentials or a scoped, rotating ingestion token is preferred once Digo
defines its identity system. Normal UI must use an allowlisted HTTPS destination;
an arbitrary webhook URL is not a supported end-user feature.

## Capture And Delivery Architecture

```text
chat / channel / workflow / builder
              |
              v
persist normal ClawMax activity successfully
              |
              v
publish canonical activity event
              |
       consent + scope gate
              |
       redact and size-bound
              |
              v
durable local outbox  ---> status API ---> header pill/details
              |
     asynchronous worker
              |
     destination adapter
       /              \
ClawMax.ai           Digo
reference API       same contract
```

The host should expose one `publishActivityEvent` seam. Direct chat, channels,
workflows, and Builder publish canonical visible activity only after their
normal persistence succeeds. Destination-specific code belongs in adapters,
not those routes.

The existing Opik trace calls are not the Activity Export implementation. Opik
may eventually observe canonical host events, but it has different semantics
and does not provide the consent, durable delivery, or deletion contract needed
here.

### Durable Outbox

Use a transaction-safe local store under ClawMax system state, outside normal
workspace exports. SQLite is the preferred first implementation after verifying
the packaged Node/runtime dependency; the contract must not depend on a
particular database.

The synchronous request path performs only a bounded local append. A worker:

- wakes every 5-15 seconds or when 50 events/256 KB are ready;
- batches by destination while preserving sequence within each conversation;
- applies exponential backoff with jitter;
- survives dashboard/container restart;
- supports dead-letter inspection without exposing raw credentials;
- enforces per-event and per-batch size limits; and
- keeps queue retention and capacity bounded.

Initial performance target: consent lookup, redaction, and local append add less
than 5 ms at p95 to an eligible persisted turn. Network delivery is never
awaited by agent chat, group chat, Builder, or workflow execution.

If the queue is full, ClawMax continues normal agent operation, stops accepting
new export events for that destination, records a loss counter, and changes the
pill to `needs attention`. It must not silently discard activity while still
claiming healthy sharing.

## Redaction And Data Protection

Raw prompts and responses can contain credentials or personal information.
Before an event reaches the durable outbox:

- redact exact values held in server-managed partner/provider stores and the
  secret broker;
- redact authorization headers, bearer tokens, common API-key formats, private
  keys, password fields, and connection strings;
- reject or truncate content above documented limits and retain a hash plus
  truncation marker;
- omit tool inputs/results, environment details, local paths, attachment
  contents, and workspace file contents;
- avoid routine logging of event bodies; and
- exclude the outbox and consent secrets from workspace/template exports and
  support bundles.

Redaction is defense in depth, not permission to collect broadly. Scope gating
must happen before content is written to the outbox.

Partners must publish retention, deletion, access-control, incident-response,
and data-residency terms before production enablement. ClawMax should retain
undelivered content only for a short documented window, initially no more than
24 hours unless an operator deliberately configures less.

## ClawMax.ai Reference Receiver

ClawMax.ai will implement the proposed batch API first so the complete flow can
be tested before Digo has an endpoint.

The reference receiver should:

- provision a dedicated ingestion token bound to one customer/instance and
  allowed event enrollment;
- validate the schema, batch size, event size, destination id, and consent
  receipt fields;
- enforce unique `batchId` and `eventId`;
- retain a raw-ingestion quarantine separate from any reviewer UI;
- expose accepted, duplicate, rejected, and deletion-request results;
- provide event/script/participant filtering for authorized reviewers;
- never reuse transcript content for model training or unrelated analytics
  without a separate user consent; and
- provide a purge path used by automated tests and event-retention operations.

The existing ClawMax.ai template and Builder endpoints can share authentication
infrastructure, but Activity Export must have its own route, token scope, data
store, retention policy, and audit log.

## Partner Configuration

A Digo partner definition should eventually collect:

- Digo event id;
- optional script id;
- participant enrollment method or invite code;
- ingestion credential, stored server-side;
- supported capture scopes;
- consent disclosure version and privacy URL;
- event start/end or consent expiration; and
- connection verification status.

The connection can be tested before user consent without sending transcript
content. `Enable Digo` means the destination is available for enrollment; it
does not begin capture. The user-facing action should be `Share activity with
Digo`, followed by the consent review.

## Failure And Revocation Rules

- Disabled destination or missing consent: create no export event.
- Expired/revoked consent: create no export event.
- Workspace admin disables destination: stop capture for all receipts and purge
  unsent events.
- User opts out: stop that user's capture synchronously and purge that receipt's
  unsent events.
- Destination offline: queue within limits and show delayed state.
- Invalid destination auth: pause, show needs-attention state, and preserve
  bounded queued data until expiry or operator purge.
- Dashboard restart: resume queued delivery without duplicating accepted events.
- Partner rejects one event: dead-letter that event without blocking unrelated
  conversations.
- Redaction failure or unknown content type: fail closed for export while normal
  ClawMax activity continues.

## Automated Validation

### Consent And Isolation

- A fresh installation captures and sends nothing.
- Configuring/enabling a destination without user consent captures nothing.
- Consent is bound to destination, workspace, user, event, scopes, version, and
  expiry.
- One user's consent never exports another user's turns in a shared workspace.
- Revocation stops capture before the next eligible turn and purges unsent data.
- Switching the destination from ClawMax.ai to Digo requires new consent.
- Historical messages are not backfilled.

### Capture Contract

- Direct, group, community, workflow, and optional Builder events use stable
  ids, ordering, actor types, and consent references.
- Only selected scopes publish.
- User and agent turns preserve conversation order across retries and restart.
- Internal agent messages, system prompts, tool details, attachments, and files
  remain absent by default.
- Known secret sentinels are absent from the event, outbox, logs, support
  bundles, and receiver.
- Oversized content is bounded and marked, not silently presented as complete.

### Delivery

- The request path never calls the remote receiver.
- Batching respects count and byte limits.
- Restart persistence, retry/backoff, `Retry-After`, idempotency, duplicate
  acknowledgement, batch splitting, dead letter, and purge are covered.
- `401/403`, `413`, `429`, `5xx`, timeout, malformed response, and partial
  rejection produce the correct visible state.
- A full or locked outbox does not block chat/workflows and cannot claim healthy
  sharing.
- Tokens never reach client APIs or routine logs.

### Product And Accessibility

- Consent is not preselected and clearly names destination, purpose, scopes,
  identity, retention link, and expiration.
- The status pill and details remain visible and usable on desktop and mobile.
- Stop sharing is reachable in one interaction from the details panel.
- Healthy, delayed, and needs-attention states do not rely only on color.
- Partner configuration and user consent remain visibly distinct.

### End-To-End Pilot

1. Run a local fake receiver contract suite.
2. Connect a test instance to the ClawMax.ai reference receiver.
3. Complete a scripted agent-creation and workflow exercise.
4. Verify reviewer ordering, participant/script correlation, redaction, and
   opt-out.
5. Interrupt delivery, restart the container, and verify idempotent recovery.
6. Repeat on cloud and containerized on-prem.
7. Give the same contract fixtures to Digo and require conformance before a
   production Digo destination is advertised.

## Delivery Phases

### Phase 0: Contract And Policy

- Agree on event schema, scopes, purpose text, identity mapping, retention,
  deletion, authentication, sizes, rate limits, and reviewer authorization.
- Complete privacy/security review and partner data-processing terms.
- Publish JSON Schema and receiver conformance fixtures.

### Phase 1: Generic Host And Fake Receiver

- Add consent receipts, scope evaluation, redaction, durable outbox, worker,
  destination adapter interface, status API, and header indicator.
- Add a local fake receiver and all failure/security tests.

### Phase 2: ClawMax.ai Reference Integration

- Implement the dedicated receiver, scoped token provisioning, reviewer access,
  deletion/purge, and contract telemetry.
- Pilot with synthetic transcripts, then explicitly consenting internal users.

### Phase 3: Digo Adapter

- Digo implements the same conformance contract or confirms compatible endpoint
  mappings.
- Add the public Digo partner definition, event enrollment, disclosures, and
  branded status state.
- Pilot one bounded event before general availability.

## Decisions Required From Digo

Before the Digo adapter can move beyond a fixture:

1. What are the canonical event, script, and participant identifiers?
2. Does Digo require identifiable name/email, or is a pseudonymous participant
   id sufficient?
3. Which activity scopes are necessary: direct chat, group chat, workflows,
   Builder, or only a subset?
4. Is full text required, or would structured script-step evidence reduce
   collection?
5. What are retention, user deletion, data residency, reviewer authorization,
   and breach-notification policies?
6. Which authentication mechanism, token rotation, rate limits, batch limits,
   and per-event acknowledgements will Digo support?
7. What privacy URL and exact consent purpose should ClawMax display?
8. Must the integration support intermittent/offline event connectivity?

## Non-Goals

- Workspace-owner surveillance without individual user consent.
- Generic keylogging, click tracking, page analytics, or device monitoring.
- Exporting all workspace or agent activity merely because a partner is
  enabled.
- Exposing a general conversation-read capability to plugins.
- Arbitrary end-user webhooks.
- Blocking agent execution until a partner acknowledges a transcript.
- Backfilling activity created before consent.
- Treating ClawMax.ai consent as permission to send the same data to Digo.

