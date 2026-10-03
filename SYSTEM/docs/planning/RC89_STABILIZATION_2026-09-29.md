# RC89 stabilization: September 29–30

Dashboard team; written September 29, 2026 (America/Los_Angeles).
Branch: `feat-2.0-maintenance-parity`. No image/release authorization implied.

## Tonight — September 29 (priority, not a completion guarantee)

1. Keep the high-resource local stack stopped until a bounded diagnostic run is
   useful. Address BYOK save blocking and stale/misleading health first. Preserve
   all user sessions, agents, workspaces, and scheduled work.
2. Confirm where the owner's latest rotated Resend/Opik credentials were saved.
   Reconcile effective source precedence and reload behavior with CLI/Web's
   protected stores. Report presence/revision and provider status only, never key
   values or environment dumps. Further coordinated rotation may be required;
   existing ciphertext requires a real master-key migration, not replacement.
3. Ship and test the Available-first agent Skills change as a focused checkpoint.
4. Repair live search loading so slow sources cannot hide ready results; audit
   workspace names and all eight required object categories. Add pagination and
   workspace-switch isolation tests before declaring the feature complete.

## Tomorrow — September 30

- Finish responsive header/search tests at desktop/mobile widths and constrained
  header space. Make important actions obvious without adding persistent clutter.
- Reproduce CLI's local-model pressure scenario using disposable fixtures. Check
  whole-prompt budget, tool overhead, history compaction, duplicate-turn prevention,
  terminal timeout evidence, and truthful progress. Verify current source against
  the installed RC87 handoff before assuming their timeout findings still apply.
- Fix watchdog drain/lease races, recovery serialization, stale readiness, and
  Opik error/stale-cache semantics with focused failure tests. Retest after restart.
- Coordinate Mike's on-prem instance and the owner's Mac mini individually with
  CLI. Obtain exact current targets/images/runtime versions and failure evidence;
  use backed-up candidate volumes with rollback. Do not treat MBP14 as either target.
- Run joint CLI acceptance for Maximilien-AI and AuctionsMax-AI operations in
  isolated workspaces before the complete integration/validation/coverage gate.

## Search acceptance (release blocking)

Search must find authorized workspace names plus active-workspace agents,
workflows, groups, communities, skills, templates, and plugin objects through the
public plugin contract. Never import private plugin implementation into this repo.
Check exact/partial names, IDs, empty query/results, pagination beyond the first
page, slow/failed sources, workspace switches during requests, renamed items,
correct detail navigation, and inaccessible-workspace denial. Do not make model
provider availability a prerequisite for local content search.

## Model policy clarification

GPT-5.4 is an experience-based recommended baseline, not a proven compatibility
boundary. Pending implementation: default to OpenClaw-supported GPT-5.4+ OpenAI
models, with an explicit owner-only override for older supported models. Catalogue
support, permission, provider access, and successful execution are separate claims.
The current GPT-5.5-only picker is temporary and does not meet this revised policy.

## Handoffs and release gates

### P0 — September 29 late CLI handoff: template apply split state

Private source: `20260930T052000Z_CLI-to-Dashboard_mbp14-template-apply-split-state.md`
under the owner's Desktop/ClawMax/handoffs directory. This is a separate blocker
from the gateway stall/watchdog handoff below. CLI reports MBP14 repaired in place,
without restarting the Gateway/container; the Dashboard product fix is not complete.

Reported sequence on RC87/OpenClaw 2026.9.5: native registration committed nine
agents; direct config WebSocket lacked administrative scope; paired CLI fallback
rejected a persisted `__OPENCLAW_REDACTED__` remote-token sentinel; import cleanup
deleted workspace directories without compensating committed registrations.
Recovery health incorrectly reported complete. Installation and roster visibility
were verified after repair, but no paid model reply was tested.

Required engineering work:

- Trace the sentinel writer. Never round-trip resolved/redacted presentation config
  into authored config; mutations must use source configuration and allowlisted
  patches. Test that read-then-mutate cannot persist a sentinel anywhere.
- Offer audited, backed-up native repair only for an invalid sentinel in the unused
  remote-token field of a confirmed local-only Gateway, with no remote URL and valid
  local authentication. Real remote credentials require explicit repair, not deletion
  by inference. Do not use private operator backups as fixtures or application input.
- Journal before the first mutation across both stores. Re-read the roster after
  timeout/lost responses. Restart recovery must reach verified commit on both sides
  or verified rollback of exactly this apply's resources; preserve unrelated data.
  Expose recovery-required health and fence conflicting reapply until reconciled.
- Make scoped WebSocket versus paired-CLI transport deliberate. Successful fallback
  is success; errors expose bounded code/phase, never raw commands, patches, hashes,
  credentials, or config payloads.

RC89 acceptance on clean and upgraded RC87-style disposable fixtures:

1. Apply the nine-agent Marketing Strategy Team with prefix and 2/2/2 parameter
   expansion; verify exact roster/filesystem names, models, and Skill allowlists.
2. Exercise scope rejection with successful paired-CLI fallback, local sentinel
   repair, committed mutation with lost response, and post-registration patch failure.
3. Interrupt between registration and workspace commit; restart and verify recovery
   of both stores, including with unrelated pre-existing resources.
4. Repeat the same request without duplicated agents, groups, workflows, or schedules.
   Restart the successful deployment and verify persistence and agent usability.
5. Verify truthful UI success/failure/recovery states and absence of sensitive error
   payloads. Record a synthetic model response separately from roster visibility.

### Next-session checks — September 29 dev restart

- Rotated Resend and Opik keys were synchronized into the ignored local Dashboard
  environment from the owner-designated protected source, without printing values.
  A read-only Opik request returned HTTP 200. This verifies authentication for that
  request, not tracing, metering correctness, or resolution of the resource issue.
- Dashboard health returned HTTP 200; Astro chat remains unverified and was reported
  unavailable. The initial isolation restart deliberately omitted gateway bootstrap.
  A subsequent pinned gateway start had not opened port 18789 at the last check.
  Inspect existing processes before restarting; avoid duplicate gateway starts.
- Compare gateway startup, memory growth, oversized local-model prompts, drain/lease
  handling, and stale readiness with the CLI handoff below. Do not attribute Astro's
  failure to either the key or that handoff without reproducing it.
- Check workspace-specific Resend overrides, real Opik tracing/metering, and BYOK
  save responsiveness. Invalid/expired/revoked keys must yield actionable partner
  authentication errors without blocking Dashboard or chat; distinguish transport
  failures, preserve last verified usage as stale, and never report failed email as
  sent. Add bounded-timeout and failure/recovery tests before claiming this fixed.

Read private coordination files under the owner's Desktop/ClawMax/handoffs folder.
Current relevant CLI source: `20260930T000500Z_CLI-to-Dashboard_mbp14-gateway-stall-watchdog-race.md`.
Dashboard owns public UI/server/watchdog and release evidence; CLI owns target
deployment and protected-store reconciliation; Web owns its secret consumers.
No external instance writes without exact target authority.

Before RC89: directly affected tests and TypeScript, desktop/mobile visual checks,
complete integration/validation/coverage, clean pushed commits, exact local version
identity, public amd64/arm64 image plus matching private combined image, registry
smoke/persistence/source-boundary checks, and explicit joint CLI acceptance evidence.
Do not promote merely because an image builds. Priority remains stability first,
simplification second, consistency everywhere, with measured execution speed.
