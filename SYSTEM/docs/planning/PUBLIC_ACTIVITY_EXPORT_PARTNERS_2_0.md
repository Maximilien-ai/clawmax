# Public Activity Export And Partner Ingestion

> Status: public capture, per-destination consent/revoke UI, redaction, durable outbox, batch delivery, and adapters implemented; ClawMax.ai receiver pilot pending
> Release target: `2.0.0` public platform contract and ClawMax.ai reference receiver
> Audience: partner backend teams and contributors implementing a ClawMax partner integration
> Last updated: August 12, 2026

## Decision Summary

ClawMax will provide a public, vendor-neutral **Activity Export** service. Any
partner can implement the receiver and contribute a small adapter; transcript
capture must not be implemented as partner-specific code inside chat or
workflow routes.

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

Capture consent and destination consent are separate gates. A user may enable
generic capture and independently consent to multiple configured destinations
(for example, ClawMax.ai and Digo); each destination has its own receipt,
queue fan-out, status, and revoke action.

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

### Purge API

When a user revokes consent, ClawMax calls the partner's authenticated purge
endpoint if delivered-data deletion is supported:

```http
POST /v1/clawmax/activity-events:purge
Authorization: Bearer <server-managed-ingestion-token>
Content-Type: application/json
X-ClawMax-Schema-Version: clawmax.activity-export/v1
Idempotency-Key: purge_01...
```

```json
{
  "purgeId": "purge_01...",
  "destinationId": "acme-events",
  "workspaceId": "opaque-workspace-id",
  "receiptId": "consent_01...",
  "requestedAt": "2026-08-07T18:03:20.000Z"
}
```

Return `202 Accepted` with the stable `purgeId` and a status that can be
polled or audited. A partner that cannot delete delivered data must say so in
its consent disclosure and document its deletion-request process. Local
unsent events are purged immediately regardless.

### Authentication

The reference receiver can start with the same deployment-managed bearer-token
pattern used by current ClawMax.ai template/Builder sharing, but uses a distinct,
least-privilege token:

- `CLAWMAX_ACTIVITY_EXPORT_ENDPOINT`
- `CLAWMAX_ACTIVITY_EXPORT_TOKEN`

The token is server-managed, encrypted or supplied by infrastructure, never
returned to the browser, never injected into an agent, and never included in
logs, support bundles, or exported events.

For Digo, use a distinct destination credential and endpoint. OAuth 2 client
credentials or a scoped, rotating ingestion token is preferred once Digo
defines its identity system. Normal UI must use an allowlisted HTTPS destination;
an arbitrary webhook URL is not a supported end-user feature.

## Partner Implementation Quickstart

This is the minimum contract for any partner. A partner may implement the
receiver first and contribute the ClawMax adapter afterward; neither step
requires Digo-specific behavior.

Start with the repository's [Partner Contribution Guide](../../../PARTNERS/README.md)
for catalog conventions and shipped examples. The
[`PARTNERS/digo`](../../../PARTNERS/digo/) definition is the current public
catalog example, but its metadata alone is not the Activity Export adapter.

### 1. Implement the receiver

Provide an HTTPS endpoint that accepts the batch request above and:

1. authenticates the server-managed credential and rejects missing, expired, or
   incorrectly scoped credentials with `401` or `403`;
2. validates `schemaVersion`, `destinationId`, required event fields, consent
   scope, maximum batch bytes, and maximum event bytes;
3. treats `batchId` and `eventId` as idempotency keys and returns duplicates as
   accepted rather than creating a second record;
4. returns the documented acknowledgement shape, including per-event permanent
   rejections; and
5. provides an authenticated purge endpoint for revoked consent when the
   partner stores delivered activity.

The receiver must not require browser CORS, cookies, or a user-facing API key.
It must not log bearer tokens or raw event bodies. Publish the endpoint URL,
credential scope/rotation process, size and rate limits, retention/deletion
policy, privacy URL, and exact consent purpose before requesting integration.

### 2. Provide partner metadata

Submit these values to the ClawMax integration owner:

| Field | Required | Meaning |
|---|---:|---|
| `destinationId` | yes | Stable lowercase identifier, e.g. `acme-events` |
| display name and logo | yes | User-facing partner identity |
| ingestion endpoint | yes | HTTPS batch URL; no arbitrary user URL |
| credential owner and rotation | yes | Deployment secret name and expiry process |
| supported scopes | yes | Subset of the canonical scopes above |
| privacy URL and purpose | yes | Shown before consent |
| retention and purge behavior | yes | What revoke/delete guarantees |
| enrollment fields | optional | Event, script, participant, or campaign ids |
| reviewer authorization | optional | How partner operators access delivered data |

### 3. Add the ClawMax partner integration

The partner integration is a small public adapter/metadata change in the
ClawMax repository. It must:

- add a partner catalog entry with display name, logo, scopes, privacy URL, and
  setup instructions;
- store endpoint credentials only through deployment-managed secrets (never in
  browser storage, workspace files, prompts, or agent-visible keys);
- use the host Activity Export adapter and consent APIs rather than modifying
  chat, workflow, group, or Builder routes;
- keep destination configuration separate from user consent, with two explicit
  gates in the UI;
- show the standard healthy, delayed, needs-attention, and revoked states; and
- add unit, route, redaction, consent, retry, purge, mobile, and receiver
  conformance tests.

Partners should open a PR against `Maximilien-ai/clawmax` containing the catalog
entry, adapter configuration, tests, privacy/copy review, and a link to their
receiver conformance results. Do not include production credentials or private
partner server code in that PR. Private implementation code belongs in the
partner's own repository.

A catalog-only PR is welcome when labeled as such. Until the destination is
wired through server consent, asynchronous delivery, client consent/status UI,
and conformance tests, its copy must say that activity sharing is planned and
must not present endpoint or credential fields as a working export setup.

### 4. Pass the conformance checklist

Run the shared fixtures against the partner receiver and attach results for:
valid batch, duplicate batch/event, malformed event, unsupported scope, `401/403`,
`413`, `429` with `Retry-After`, `5xx`, timeout, partial rejection, purge after
revoke, and a redaction sentinel containing a fake API key and password. Then
test one cloud and one on-prem deployment with consenting synthetic activity.

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

A partner definition should collect:

- partner event or enrollment id;
- optional script id;
- participant enrollment method or invite code;
- ingestion credential, stored server-side;
- supported capture scopes;
- consent disclosure version and privacy URL;
- event start/end or consent expiration; and
- connection verification status.

The connection can be tested before user consent without sending transcript
content. `Enable <Partner>` means the destination is available for enrollment;
it does not begin capture. The user-facing action should be `Share activity
with <Partner>`, followed by the consent review. A partner may provide a
branded label such as `Share activity with Digo`, but the generic two-gate
behavior is unchanged.

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

- Complete: consent receipts, scope evaluation, redaction, durable outbox,
  worker, destination adapters, status API, header indicator/popover, partner
  controls, per-destination revocation, and local failure/security tests.

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
