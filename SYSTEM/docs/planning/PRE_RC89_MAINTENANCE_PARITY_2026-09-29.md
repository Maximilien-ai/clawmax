# 2.0 pre-RC89 maintenance parity — September 29, 2026

Dashboard integration branch: `feat-2.0-maintenance-parity`.
Base: main `7ff6ee64`. Audited maintenance head:
`088e8a5b` (`origin/fix-1.9.10-cognee-policy`, also the search branch).
This is development-source integration, not an RC89 tag, image, deployment or
release acceptance claim. The maintenance branch remains intact.

## Feature reconciliation

| 1.9.10 behavior | 2.0 disposition |
| --- | --- |
| Navigation search, task-intent matching, partner/subpage navigation, files/groups/skills/configured models | Already on updated main; desktop/mobile browser suite passed |
| Cognee deny cleanup | Ported as explicit opt-in, preserving other restrictions and private backup; retained 2.0 agent-config migration |
| Boxed stale plugin warning suppression | Already in main with broader coverage; retained implementation and added maintenance regression |
| GPT-5.4 selection policy | Ported for OpenAI discovery/fallback/show-all; does not change other providers or label excluded models retired |
| Pinned Cognee bundle | Ported image packaging and smoke checks; inactive default and existing installation/config preservation |
| AgentForge receiver adapter and consent protections | Ported enrollment, receiver/workspace binding, pending-grant revocation fences, durable purge and asynchronous settlement protections |
| AgentForge partner setup and sharing UI | Ported server-managed fields, consent UI, mobile dialog and status-only validation behavior |
| Configuration crash | Main already guarded missing state; retained guard and added real wizard browser regression |
| Test harness fixes | Added new export suites at the correct existing dashboard cwd; use exit status rather than hard-coded counts |
| Legacy version/release metadata and CI branch allowlist | Intentionally not ported; package remains 2.0.0 and OpenClaw remains v2026.9.5 |

Integration also fixes two observed 2.0 problems: failed server saves must not
close the wizard or announce success, and optional activity capture must not
fail chat/Builder responses. Capture binds to the original request start and
workspace so later consent does not authorize an earlier prompt.

## Completed focused validation

- TypeScript and production build passed.
- Cognee startup-policy/entrypoint tests passed with 2.0 migration/recovery tests
  retained. Pinned bundle discovery passed against OpenClaw v2026.9.5 in a
  disposable state directory; no Cognee service was contacted.
- Model discovery: 14 tests; chat normalization: 21; chat helpers: 39; chat
  readiness/edge routes: 20; Builder routes: 19; partner catalog: 8 passed.
- Export contract/edges/worker/receiver binding/settlement/adapter/route-race
  tests and workspace integration tests passed. Added capture failure/redaction
  and request-boundary regression passed.
- Desktop 1440px and mobile 390px browser checks passed for navigation search;
  AgentForge Edit/Save/Reload persistence and failed-save visibility; enrollment,
  default-off scopes, explicit consent, receiver failure, and revoke. All API
  traffic was synthetic, with no real partner transmission.
- Mobile-dialog source audit passed. Configuration screenshots were inspected.

## Full validation and release boundaries

Full isolated integration/validation/coverage was started after implementation
commits were pushed, on ports 3002/5175. Local log:
`/private/tmp/clawmax-2.0-parity-validation.log`.
Result is pending at this checkpoint; do not claim full-suite success yet.

The regular development server uses ports 3001/5174 and runtime version
`2.0.0-dev-pre-rc89`; the source package remains 2.0.0. No release tag, RC image,
live event upgrade or global default change is part of this work.

Live Cognee service operation and actual AgentForge receiver enrollment/delivery/
revocation remain external acceptance. Package discovery and synthetic tests do
not establish those claims. Partner configuration never grants participant
consent. The historical combined/private-image legacy incompatibility is not
resolved by a source parity claim; a future 2.0 RC requires its normal combined
image and runtime validation.

## Local acceptance

1. Reload http://localhost:5174; verify pre-RC89 development identity.
2. Open Search ClawMax (Cmd/Ctrl+K); search a workspace item or partner task and
   verify its destination opens. Existing workspace-switcher search remains.
3. Partners → NYU AgentForge: open/edit/save/reopen configuration. A failed save
   must retain edits and show a warning. Do not enter synthetic test settings in
   a real workspace unless intentionally configuring it.
4. With an authorized receiver, test enrollment and explicit consent separately.
5. Verify Cognee selection and existing Agent/chat/workflow behavior. Keep the
   complete suite and external acceptance distinct from feature visibility.
