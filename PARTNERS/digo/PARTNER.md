# Digo Partner

Digo is an opt-in Activity Export destination for event programs that use
ClawMax agents and workflows. The integration is separate from the generic
ClawMax.ai Activity Export preview: configuring Digo does not grant consent.

Operators configure the Digo HTTPS ingestion URL and server-managed API key in
Keys & Secrets. A user must then explicitly consent to the Digo destination,
purpose, scopes, identity fields, and retention policy before any activity is
queued or delivered.

The Digo receiver must implement the versioned Activity Export batch contract
defined in `SYSTEM/docs/planning/PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md`.
