# NYU - AgentForge

AgentForge is the onboarding, learning-support, Prompt evidence, and progress layer for NYU personal-agent hackathons. Participants complete registration, privacy consent, the dynamic survey, foundational tutorials, and progress review in AgentForge, then continue to ClawMax to build and run their personal agents.

The initial Activity Export profile is frozen in
[`ACTIVITY_EXPORT_PROFILE.md`](ACTIVITY_EXPORT_PROFILE.md). The integration is
disabled until an operator configures the AgentForge API and a participant
launches ClawMax from AgentForge, completes the automatic enrollment handoff,
and explicitly consents.

## Activity Export role

AgentForge is planned as an optional, explicitly selected Activity Export
destination. Selecting the Partner card makes AgentForge visible to the
workspace; it does not configure the destination or authorize activity sharing.

Activity may be delivered only when:

- the participant has an active AgentForge consent receipt;
- the exported source is included in that receipt's scopes;
- ClawMax can map the participant and workspace to the AgentForge enrollment; and
- the server-side AgentForge endpoint and Partner credential are configured.

Eligible launch evidence is limited to the independently selected `agent-chat`,
`workflow`, and `builder` scopes. Group and community conversations are not
supported in the initial profile. ClawMax redacts eligible activity before its
durable outbox. AgentForge validates, normalizes, stores, and links accepted
evidence before it is used for progress support, Prompt coaching, Organizer
analysis, or Cognee memory.

## Privacy and revocation

AgentForge owns the participant-facing privacy notice, purpose disclosure, scope selection, retention disclosure, and withdrawal experience. ClawMax enforces the resulting receipt during capture and delivery.

Revocation stops new capture synchronously and removes undelivered events associated with the revoked receipt. Deletion of evidence already delivered to AgentForge follows AgentForge's receipt-linked purge process, including derived Cognee memory where applicable.

Partner API keys are deployment secrets. They must remain server-managed and must never be shown to participants, embedded in browser configuration, committed to Git, or included in exported activity.

## Current integration boundary

The Partner definition includes operator configuration metadata. Enrollment,
receipt synchronization, asynchronous delivery, status, retry, revocation, and
receiver conformance remain required before the destination can be described as
production-ready.
