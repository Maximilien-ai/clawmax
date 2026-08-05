# Activity Export And Plugin RC Test Plan

Use this as the single combined test pass for the next 2.0.0 RC. Run it on
local development, one cloud instance, and one containerized on-prem instance.
Record the image tag, deployment type, tester identity, and timestamp in the
release Review export.

## Prerequisites

- Public image reports the expected RC version.
- Private image is pulled with a GHCR credential that has `read:packages`,
  package access, and required organization SSO authorization.
- Public image exposes Lifecycle and Review only.
- Private image exposes Evals, Guardrails, Optimize, Lifecycle, and Review.
- Start from a fresh browser profile or clear prior Activity Export state.

## Plugin and Image Checks

1. Open `/api/health` and `/api/system`; confirm HTTP 200 and the expected RC.
2. Open `/api/plugins`; confirm the public/private plugin inventory matches the
   image being tested.
3. Open each plugin on desktop and mobile. Verify list, detail, and graph views,
   zoom controls, search/filter controls, enabled/disabled state, and no
   duplicate navigation entries.
4. For private plugins, confirm the complete suggested catalogs load. A
   fixture-catalog warning or only two suggestions is a deployment failure.
5. Restart the container and confirm plugin state, workspace data, and browser
   navigation preferences remain intact.

## Consent And Isolation Checks

1. Before consent, `GET /api/activity-export/status` must report no active
   sharing and a chat/workflow must create no export event.
2. Enable only the `ClawMax.ai` reference destination and select `agent-chat`
   and `workflow`. Confirm the consent text names the destination, purpose,
   scopes, and opt-out behavior. Consent must not be preselected.
3. Confirm the header/status surface clearly says activity is being shared.
4. Submit a synthetic event containing an API key, bearer token, password, and
   private-key marker. The queued event must contain `[REDACTED]` and none of
   the original secret values.
5. Confirm an event from an unselected scope is rejected and does not enter the
   outbox.
6. Confirm a different user or workspace cannot read or append to this
   consent's events.
7. Revoke sharing. Verify new events are rejected immediately and unsent
   events are purged or clearly marked for purge according to the release
   behavior.

## Restart And Failure Checks

1. Create a consented queued event, restart the dashboard/container, and verify
   the outbox and consent state recover.
2. Disconnect the receiver or configure an unavailable destination. Chat and
   workflow execution must continue without waiting on network delivery.
3. Confirm the UI reports delayed/needs-attention state instead of claiming
   healthy delivery.
4. Restore the receiver and verify retries are bounded, ordered per session,
   and idempotent; duplicate acknowledgements must not duplicate events.

## Reference Receiver Checks

1. Verify the ClawMax.ai receiver accepts a valid authenticated batch.
2. Verify invalid versions, missing consent receipts, duplicate event IDs,
   oversized events, and oversized batches are rejected with actionable errors.
3. Verify accepted, duplicate, rejected, and purge results are visible to an
   authorized reviewer without exposing bearer credentials.
4. Confirm no event is backfilled from before consent and changing the named
   destination requires new consent.

## Digo Handoff Evidence

Export the contract version, example redacted batch, response/acknowledgement
shape, and the open decisions for Digo: identifiers, participant identity,
retention, authentication, rate limits, batch limits, acknowledgements, privacy
URL, and offline behavior. Do not describe the ClawMax.ai reference receiver as
the Digo integration.

