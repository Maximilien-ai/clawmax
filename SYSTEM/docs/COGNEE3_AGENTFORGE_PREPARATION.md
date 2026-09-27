# 1.9.10-test-cognee3: AgentForge image preparation

Status: preparation only. No cognee3 tag, image, merge, or deployment authorized
by this document. Keep cognee2 available and do not change CLI defaults.

## Sources

- Base: `v1.9.10-test-cognee2` / `615d4ebf`, including the pinned inactive
  Cognee 2026.9.2 package, opt-in legacy-deny cleanup, and GPT-5.4 selection.
- Yuxin Ren's merged catalog PR: https://github.com/Maximilien-ai/clawmax/pull/188
- Yuxin Ren's open functional integration PR:
  https://github.com/Maximilien-ai/clawmax/pull/192
- Inspected PR 192 head: `5e0c0d33f94488e7935fa2c92b5eb1b1a80dfa5e`.
  At inspection, review was required and GitHub reported no check results.
  The PR description lists author-run tests, not independently verified CI.

## Choose the image scope explicitly

Catalog-only: backport the final merged catalog semantics, including the
follow-up labeling Activity Export as planned. This exposes the partner but
does not provide enrollment, consent, or delivery. Do not call it a working
AgentForge integration.

Functional integration: review PR 192 and its frozen Activity Export profile,
then port only the required changes to the 1.9.9-derived maintenance branch.
This is not a plugin npm install. It changes Dashboard consent, identity,
enrollment, activity capture, delivery, and deletion behavior. The maintenance
branch lacks the Activity Export foundation present on main; review that
dependency explicitly rather than importing the entire 2.0 branch. Separate
unrelated Windows CLI changes unless they are necessary for the integration.

## Required gates before the functional image

1. Confirm receiver endpoint/auth contract, destination/purpose identity,
   participant/workspace enrollment mapping, receipt schema, and executable
   request/result/error fixtures with Yuxin. No secrets or participant content
   in the image, repository, CI artifacts, or handoff.
2. Default export off. Partner selection and configuring a key must not grant
   consent. Enforce participant-specific scopes, visible active state, immediate
   revocation, and re-consent when destination/purpose/disclosure changes.
3. Redact before durable storage; deliver asynchronously. Verify destination and
   workspace isolation, retry deduplication, bounded failure behavior, no Agent
   chat blocking, and retained deletion/purge evidence.
4. Run TypeScript, affected partner/export/chat/CLI tests, and desktop/mobile
   consent/status/error-state checks. Run full integration/validation/coverage
   or obtain explicit authorization for a provisional image with these gates
   outstanding, as was done for cognee2.
5. Verify ordinary chat with export disabled, and consented synthetic events
   reaching an isolated AgentForge receiver. Revoke and verify capture/delivery
   stop. Do not use existing participant conversations as test fixtures.
6. Commit/push focused changes, pin a new source tag, then dispatch the test
   image workflow from that ref using suffix `cognee3`. Verify both architectures,
   registry smoke, version identity, and bundled inactive Cognee discovery.

Expected candidate name after approval/build:
`ghcr.io/maximilien-ai/clawmax-dashboard:1.9.10-test-cognee3`.
Record the resulting digest and CI links; never reuse the cognee2 tag.

## Deployment boundary

Wait for CLI provisioning and access verification to finish. Upgrade only an
explicitly identified canary instance, preserving its PVC, credentials, access
policy, placement, and rollback digest. Event 5 has been used for cognee2 chat
acceptance; its readiness is not evidence that Dave's provisioning is complete.
Do not infer instance ownership from event numbering.

Retain `CLAWMAX_REMOVE_LEGACY_COGNEE_DENY=true` where an authorized legacy policy
cleanup is still required. Set `CLAWMAX_VERSION=1.9.10-test-cognee3` only when
deploying that actual image. Neither variable enables AgentForge export.
