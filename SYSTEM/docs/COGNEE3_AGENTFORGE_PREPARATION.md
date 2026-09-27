# 1.9.10-test-cognee3: AgentForge image preparation

Status: provisional Event 5 canary authorized by the user on September 27.
Build `1.9.10-test-cognee3` from the 1.9.9-derived maintenance branch only.
Keep cognee2 available and do not change CLI defaults or other event instances.

## Current implementation and acceptance evidence

- Maintenance branch: `fix-1.9.10-cognee-policy`, worktree
  `/private/tmp/clawmax-1.9.10-cognee`. Main remains on the 2.0 line.
- Foundation backport: `d3b86f09`; pending-grant revocation fences and permanent
  configuration-change revocation: `af18ac17`; UI/runtime wiring: `893a16b1`.
- Backend typecheck and production build pass using this branch's lockfile.
  Focused export, receiver-binding, settlement, purge, consent-race, partner,
  chat, Builder, and workspace-integration tests pass.
- Synthetic Chromium fixture passes at 1440px and 390px: enrollment without
  implied consent, unchecked categories/confirmation, explicit enable, visible
  failure, sharing indicator, revoke, and no horizontal overflow. No real
  participant data or partner credentials were used.
- Live receiver enrollment/delivery/deletion and full integration/validation/
  coverage remain outstanding. The user approved a provisional image while
  normal tag CI runs. This is not a fully validated release.
- This maintenance UI offers chat and Builder recommendation capture. It does
  not claim automated workflow capture or backfill old activity. Do not enable
  broader scopes in deployment guidance without implementing their capture.
- The consent receipt binds the receiver URL, privacy URL, disclosure/purpose,
  identity scheme, and credential fingerprint; configuration changes revoke
  existing grants. No credential value is stored in receipts.
- Purge jobs require their original workspace/receiver configuration; a changed
  or unavailable receiver leaves deletion unresolved, never falsely completed.

## CLI Event 5 canary handoff

Event 5 was upgraded successfully on September 27 to the public Cognee3 image:
`ghcr.io/maximilien-ai/clawmax-dashboard@sha256:474c519e27fcd6a0fac2b3457ed1f1d7c01ea85796f48aa6e0e4d24a48939d6d`.
Both architecture builds and registry smoke passed; anonymous manifest access
was verified. Health, system, integration-status, and activity-status endpoints
returned HTTP 200; system reported `1.9.10-test-cognee3`, AgentForge was present,
and sharing was off. The pod was ready with zero restarts.

PVC UID remained `28b2afc2-8854-48c7-a0df-9cd2bcac74be` (Bound). A deployment-spec
fingerprint excluding only image/version was identical before and after rollout.
No other instance or provisioning default changed.

The original tag CI failed seven export invocations due to the runner working
directory and the mobile-dialog source audit. Follow-up commits `c8ff59be` and
`05f4b6d4` fix those issues; all seven suites, typecheck, build, dialog audit and
desktop/mobile browser checks pass locally. They are NOT in the already-published
Cognee3 image. Maintenance-branch CI is enabled by `c8c91170`; await its result and
a separately tagged image before claiming those fixes deployed or full readiness.

Build source: `9d1e78d03589a1d93f3b98b389590abd90afe740`, immutable tag
`v1.9.10-test-cognee3`.

- Public image build: https://github.com/Maximilien-ai/clawmax/actions/runs/36333402234
- Tag CI: https://github.com/Maximilien-ai/clawmax/actions/runs/36333354581
- Matching private-image gate:
  https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/36333486290
  failed runtime acceptance: current private plugins require a newer generic host
  API than 1.9.10 provides. Its build/smoke jobs were skipped. Do not claim combined
  image readiness or deploy that combination to this canary.
- Synthetic loopback HTTP rehearsal passed enrollment, default-off behavior,
  explicit consent, redacted delivery, revocation, and verified purge receipt.
  This is not a live AgentForge receiver test.
- Read-only Event 5 preflight found no AgentForge API URL, privacy URL, or stored
  credential. These must be configured by the operator before live acceptance.

Target: `cld-event-5-2cbf80e368f4`, namespace
`clawmax-cld-event-5-2cbf80e368f4`, context `clawmax-cloud-nyc1-2`.
Pin the new image by digest; retain the PVC, credentials, placement and access
policy. Rollback remains Cognee2 digest
`sha256:2c6bd5d5faff2bf75dce77b10ef16ff2481bd8642a1f1952320e0ba55cba0585`.

Set `CLAWMAX_VERSION=1.9.10-test-cognee3` and retain the already-authorized
`CLAWMAX_REMOVE_LEGACY_COGNEE_DENY=true` migration flag where needed.
If `WORKSPACES_INTEGRATIONS_THIRD_PARTIES` is explicitly set, append `agentforge`
to that allowlist without dropping existing partners. The allowlist is respected,
not silently expanded. Cognee remains packaged but requires explicit enablement.

Operator: configure AgentForge API base URL, privacy URL, and server-stored API
key in Partners. Participant: open the enrollment handoff from AgentForge,
review the destination/purpose/categories, and explicitly enable sharing.
Use a synthetic chat for the canary and verify its arrival with Yuxin. Revoke,
verify capture stops, and verify remote deletion evidence before broader rollout.
Configuring a partner or enrolling is not consent. Do not put API keys in this
handoff or build logs. Never make this candidate the provisioning default yet.

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

### Earlier September 27 review results (historical blockers, now regression-tested)

Inspected the exact PR head above in a detached review worktree. TypeScript,
the AgentForge adapter test (14 assertions), activity-export tests (36), and
worker edge tests (9) passed. These are focused checks, not full integration.

A synthetic, network-free concurrency reproduction failed:

1. Save an active AgentForge receipt and queue one synthetic chat event.
2. Begin an outbox flush with an unresolved mocked fetch.
3. Revoke destination consent: persisted receipt becomes inactive and outbox empty.
4. Resolve that fetch with HTTP 503.
5. Observe persisted receipt becomes active again and the event returns to outbox.

Observed result:
```json
{"activeAfterRevocation":false,"queuedAfterRevocation":0,"activeAfterFailedDeliverySettles":true,"queuedAfterFailedDeliverySettles":1}
```

Root cause: `flushActivityExportOutbox` writes the state snapshot captured before
the asynchronous network request, overwriting subsequent consent revocation.
Fix with a concurrency-safe settlement transaction that preserves current state,
never revives removed events, and revalidates current consent before dispatch.
Test both success/failure settlement, concurrent enqueue, expiry, and revocation.

Additional source-review findings requiring tests:

- Receipts do not bind the configured endpoint; the worker resolves the current
  endpoint at delivery time. Configuration changes must invalidate old consent
  rather than redirect queued participant content to a new receiver.
- Purge worker and delete-consent route mark a successful HTTP response complete
  without checking `purgeStatus`; the adapter fixture explicitly returns
  `purgeStatus: pending`. Preserve pending state until verified completion.
- Enrollment disconnection and revoke-all paths need receipt-linked purge checks;
  they currently bypass the destination-specific remote purge path.

No partner service was contacted and no real participant data was used. No
cognee3 image or source tag was created. Keep cognee2 as the current candidate.

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
