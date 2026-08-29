# Partner Contribution Guide

ClawMax partner integrations are public host metadata and, when needed, small
host adapters. Partner-owned services and private implementation details stay
in the partner's repository.

## Start From A Shipped Example

Choose the closest existing integration instead of inventing a new contract:

- [`github/`](github/) shows catalog metadata, server-side readiness checks,
  and human-readable setup copy.
- [`gmail/`](gmail/) and [`microsoft365/`](microsoft365/) show provider-neutral
  OAuth integrations backed by the shared
  [`MAIL_CAPABILITY_CONTRACT.md`](MAIL_CAPABILITY_CONTRACT.md).
- [`resend/`](resend/) shows a partner with curated skill-catalog metadata.
- [`digo/`](digo/) is the catalog example for a consent-gated Activity Export
  destination. The complete data, consent, delivery, and conformance contract
  is in the
  [Activity Export guide](../SYSTEM/docs/planning/PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md).

Every catalog contribution needs a `partner.json` for product behavior and a
`PARTNER.md` for positioning and setup guidance. Keep required behavior in the
JSON or host code; the dashboard does not parse Markdown as configuration.

## Catalog Contribution Checklist

1. Add `PARTNERS/<slug>/partner.json` and `PARTNER.md` using a stable lowercase
   slug and user-facing name.
2. Link `docsUrl` to the specific setup or integration guide a user needs, not
   just an organization or repository home page.
3. Add the slug to both the server allowlist and the resilient client fallback
   catalog. Preserve explicit instance selections, including an empty
   selection.
4. Keep secrets server-managed when the server uses them. Never put production
   credentials, raw activity, private partner code, or customer-specific
   configuration in this repository.
5. Add focused definition, fallback, validation, persistence, and responsive UI
   tests for the behavior introduced.
6. State incomplete integration work plainly in the PR and user-facing copy.
   A visible catalog card must not imply that an unavailable operation works.

## Activity Sharing Is A Separate Integration

Adding an Activity Export partner card or collecting an endpoint and credential
does not enable activity sharing. A production destination also requires:

- a named purpose, privacy URL, supported scopes, retention/deletion terms,
  consent version, and partner-scoped participant mapping;
- an explicit per-user, per-destination consent receipt with visible active,
  delayed, failed, and revoked state;
- destination handling in the server consent allowlist and asynchronous worker;
- client controls that name the destination, review scopes, revoke consent, and
  show delivery history/status;
- redaction, retry, restart persistence, purge, and receiver conformance tests;
  and
- a receiver that passes the shared authenticated, idempotent batch contract.

Until those pieces are implemented and tested, describe the contribution as a
catalog entry or planned destination, omit controls that appear to configure a
working export, and do not offer the destination in the activity-sharing UI.
Configuring a partner is never consent.

For the implementation sequence and test matrix, follow the
[Partner Implementation Quickstart](../SYSTEM/docs/planning/PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md#partner-implementation-quickstart).
