# Hardening + Simplification Sprint: 1.8.x

> Started: June 10, 2026
> Branch: `hardening-simplification`
> Baseline: `v1.7.9`

## Goal

Use the `1.8.x` line to reduce operational risk, simplify crowded client surfaces, and retire stale backlog noise after the fast `1.7.x` partner/runtime release train.

This is likely more than one release:

- `1.8.0`: cleanup, deterministic test/runtime hardening, highest-friction UX simplification
- `1.8.1`: follow-through from manual testing and customer-reported regressions
- `1.8.2+`: deeper structural cleanup that is too risky for the first hardening cut

## Branch Notes

- The old `simplify-client-surfaces` branch has already been merged into `main`; it is an ancestor of the `v1.7.9` baseline.
- Do not merge code from `simplify-client-surfaces` back into this branch. Its raw diff is stale and would remove large parts of the `1.7.x` work, including release-image workflows, Resend, Cognee, and regression tests.
- Carry forward only the still-relevant planning themes from the archived simplification docs.

## Sprint Principles

- Prefer deleting or hiding complexity over adding new controls.
- Keep one primary action per page where possible.
- Preserve power-user capability behind `Actions`, drawers, or progressive disclosure.
- Every hardening bug fixed in this line should add or surface a regression test.
- Separate stale backlog cleanup from product behavior changes so release risk stays low.
- Validate against dev, cloud image, and on-prem image paths before promoting.

## 1.8.0 Proposed Scope

### P0: Release-State And Backlog Hygiene

- [ ] Update `SYSTEM/docs/STATUS.md` from `v1.7.3` to `v1.7.9`/`1.8.x`.
- [ ] Refresh `SYSTEM/docs/KNOWN_ISSUES.md`, which still references `v1.5.5` and older resolved limitations.
- [ ] Clean `SYSTEM/docs/BACKLOG.md` top priorities that are obsolete after `1.7.9`.
- [ ] Move completed `1.7.4` through `1.7.9` follow-through items out of active backlog into changelog/archive references.
- [ ] Reconcile GitHub issue references in backlog; current open repo issue list only shows `#111` at the time of this sprint start.
- [ ] Keep a short active 1.8.x checklist at the top of backlog so future release work is not buried under stale historical items.

### P0: Test And Runtime Determinism

- [ ] Make system-test workspace setup/teardown deterministic across repeated `SYSTEM/test.sh integration` runs.
- [ ] Verify no system-test organizations, groups, communities, workflows, or agents bleed into the personal/default workspace after integration tests.
- [ ] Add or surface explicit test coverage for workspace isolation cleanup.
- [ ] Re-check `test-with-server.sh integration` count and make new 1.8.x regression lanes visible in the aggregate summary.
- [ ] Audit CI and local test scripts for stale references to removed/archived release paths.
- [ ] Keep the test image path (`test-rcN` then promote) as the default release validation flow.

### P0: Runtime And Gateway Hardening

- [ ] Add an in-product Doctor action for `openclaw gateway restart` when gateway is configured but unhealthy.
- [ ] Reduce noisy gateway probe warnings and invalid-handshake logs in normal dashboard operation.
- [ ] Validate gateway durability in built cloud and on-prem images after restart, workspace switch, and agent chat.
- [ ] Improve cloud/on-prem logs pane reconnect behavior so diagnostics do not churn or obscure real errors.
- [ ] Keep runtime-injected partner secrets covered in chat/workflow tool execution tests.
- [ ] Audit built-in skill runtime packaging needs (`bash`, `zip`, `unzip`, `tar`, `gzip`, `file`, `less`) and decide what belongs in base images.

### P0: Resend/Cognee Regression Safety

- [ ] Confirm `clawmax-resend` still works in dev, cloud, and on-prem with runtime-injected `RESEND_API_KEY`.
- [ ] Confirm Resend partner test email and agent chat email use equivalent secret availability rules.
- [ ] Add a manual check for inline status email and attached `IDENTITY.md`/`SOUL.md` sends before every `1.8.x` release candidate.
- [ ] Confirm Cognee partner config, plugin install, uninstall, and reinstall work in dev, cloud, and on-prem images.
- [ ] Ensure benign plugin runtime warnings stay filtered from chat without hiding real plugin/tool failures.

### P1: Client Simplification Carry-Forward

These are the remaining items from the old simplification branch that are still relevant after `1.7.9`.

- [ ] Builder: reduce remaining routing/action ambiguity for workspace actions and generated-agent handoff.
- [ ] Agents: improve density/scannability without regressing card actions, chat entry, or skill management.
- [ ] Template apply: simplify defaults, readiness warnings, and customization follow-through based on customer testing.
- [ ] Activity/Budget: simplify first-screen information and make token/cost gaps obvious instead of silently showing zeros.
- [ ] DocHub: simplify generated artifact browsing, file links, and Builder session discovery.
- [ ] Logs/System: make diagnostics more action-oriented, with fewer raw streams by default.
- [ ] Notifications: group repeated bursts and keep primary actions inline only when they reliably work.
- [ ] Mobile: audit dropdowns/popovers/sheets across top bar, notifications, Skills, Templates, Agents, Workflows, Communications, and Partners.

### P1: Workflow And Communications Correctness

- [ ] Audit workflow/channel target resolution so templates use real channel/community/group ids, not display labels.
- [ ] Make workflow success criteria account for participant communication failures when the workflow intent includes posting to a group/channel.
- [ ] Improve group chat live-thread visibility during workflow runs, or clearly label current runtime limitations.
- [ ] Surface upstream model/quota/auth failures before downstream workflow step failures.
- [ ] Continue template lane/subdirectory audit for hidden helper dirs, ambiguous ownership, and false success reporting.

### P1: Security And Skill Guardrails

- [ ] Add dangerous-skill review guidance for imported and AI-created skills.
- [ ] Improve warning UX when a skill can add binaries, network access, machine-level commands, or secrets handling.
- [ ] Keep partner plugin install/uninstall allowlisted and visible with command output.
- [ ] Add stronger readiness states for required secrets before template apply or workflow run.
- [ ] Add visible warning when `OTP_DEV_MODE=log` is enabled in non-dev contexts.

### P2: Product Polish

- [ ] Refresh demo videos and docs for current `1.7.9+` surfaces. GitHub: `#111`.
- [ ] Improve first-run onboarding with BYOK readiness, import-vs-create path, and template suggestions.
- [ ] Evaluate AG-UI for richer chat/notification/template-run interactions, but keep it out of `1.8.0` unless a narrow use case is obvious.
- [ ] Continue AI Builder evaluation corpus and taxonomy cleanup.

## Proposed Release Slicing

### `1.8.0`

- Docs/backlog/status cleanup
- System-test workspace cleanup/isolation
- Gateway/Doctor recovery action
- Resend/Cognee regression safety checklists
- One focused client simplification pass: Agents + Notifications + mobile dropdowns

### `1.8.1`

- Workflow/channel correctness
- Activity/Budget metering clarity
- DocHub artifact browsing simplification
- Skill security warnings and readiness states

### `1.8.2+`

- Broader Builder simplification
- First-run onboarding expansion
- AG-UI exploration
- Larger runtime packaging cleanup

## Initial Validation Plan

- Focused unit/helper tests for every code change.
- `npm run build` for dashboard changes.
- `DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test-with-server.sh integration` before RC.
- Build `1.8.0-test-rc1` image and validate cloud + on-prem before promotion.

## Manual Checks For `1.8.0`

- Agent chat with normal provider key.
- Agent chat with `clawmax-resend` status email.
- Agent chat with `clawmax-resend` file attachment.
- Cognee plugin install/uninstall/reinstall in Skills and Partners.
- Workspace switch between at least two workspaces.
- System-test integration run followed by personal workspace inspection for leaked artifacts.
- Mobile top bar, notifications, Skills, Templates, Agents, Workflows, Communications, Partners.
- Workflow run that posts to a group/channel and verifies participant communication status.

