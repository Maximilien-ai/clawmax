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

## Execution Rules

- Start from the current visible full-suite count of `304` tests.
- Any bug fix or hardening change should either add a new visible regression lane or extend an existing visible lane so the count increases when meaningful.
- After each sprint section:
  - run focused tests for changed code
  - run `npm run build` for dashboard/client/server changes
  - run the full integration command before a release candidate
  - stop for manual checks and review before starting the next section
- Automate first. Manual checks are allowed only for visual review, live provider delivery, image deployment, or runtime behavior that is not yet practical to automate.
- Every manual check should either reference an existing automated test or create a follow-up item to automate it.
- Prefer helper/unit tests for deterministic logic, route-contract tests for API behavior, and integration/system tests for cross-surface regressions.
- Keep commits small and section-scoped so rollback is possible without losing unrelated work.
- Prefer `1.8.0` for low-risk hardening and simplification; move anything structural or ambiguous to `1.8.1+`.

## Sectioned Sprint Board

### Section 1: Release-State + Backlog Hygiene

Intent: make the docs/backlog truthful before changing behavior.

Items I think we can address now:

- [ ] Update `STATUS.md` to `v1.7.9` baseline and active `1.8.x` branch posture.
- [ ] Rewrite `KNOWN_ISSUES.md` so it only lists current known issues, not resolved `1.4.x`/`1.5.x` era items.
- [ ] Prune obsolete active backlog entries that were completed by `1.7.5` through `1.7.9`.
- [ ] Move stale release-candidate validation items out of active priority.
- [ ] Reconcile GitHub issue references and keep only currently open issue `#111` as active external tracking unless a closed issue still needs explicit follow-through.

Regression tests expected:

- None for docs-only cleanup.
- If we touch release scripts or test summaries during this section, add/update a visible docs/release helper test.

Automated checks before stop:

- Search docs for stale release references like older release candidates and obsolete active issue references.

Minimal manual checks before stop:

- Read `README.md`, `CHANGELOG.md`, `STATUS.md`, `KNOWN_ISSUES.md`, and top of `BACKLOG.md` together for consistency.
- Confirm no active top-priority item references an already shipped release candidate.

Stop point:

- Commit docs cleanup and review before changing product code.

### Section 2: Test And Workspace Isolation Hardening

Intent: make repeated test runs safe and keep the test count moving upward.

Items I think we can address in `1.8.0`:

- [x] Audit system-test workspace create/activate/reset flow.
- [x] Add a regression test for scoped cleanup of system-test org/channel artifacts.
- [x] Add a visible test lane for workspace isolation cleanup so the aggregate count increases beyond `304`.
- [ ] Make cleanup idempotent when the test workspace already exists or was partially deleted.
- [ ] Add clearer failure output when workspace setup fails but later activation appears to succeed.

Progress note:

- Fixed integration active-workspace restoration to read `/api/workspaces/active` as `.workspace.id`.
- Added API-level post-cleanup assertions that the active workspace has no system-test agents, workflows, communities, or groups.
- Added one workspace-manager unit regression, increasing that visible lane from `6` to `7` tests.

Items likely for `1.8.1`:

- [ ] Broader isolation audit across every workspace-scoped API.
- [ ] Dedicated clean-room test profile that never touches the personal/default workspace.

Manual checks before stop:

- Run the full integration command once.
- After it exits, open the personal/default workspace and confirm no system-test organizations, groups, communities, workflows, or agents are visible.
- Rerun setup/cleanup path once to verify idempotency.

Automation target:

- Replace the personal/default workspace inspection with an API-level post-integration isolation assertion.

Stop point:

- Commit only after focused tests and full integration are green.

### Section 3: Runtime + Gateway Recovery Hardening

Intent: make common runtime failures recoverable and less noisy.

Items I think we can address in `1.8.0`:

- [ ] Add Doctor action for `openclaw gateway restart` when gateway is configured but unhealthy.
- [ ] Add route/helper tests for restart action permissions, success output, and failure output.
- [ ] Reduce dashboard-originated invalid-handshake/probe warnings where the probe is only checking status.
- [ ] Add a visible regression test for probe identity/handshake behavior if the code path changes.

Items likely for `1.8.1`:

- [ ] Logs pane reconnect behavior in cloud/on-prem.
- [ ] Durable gateway service/supervision changes that require CLI/runtime coordination.

Manual checks before stop:

- In dev, stop or break gateway, open Doctor, run restart, confirm gateway returns healthy.
- Confirm agent chat works after restart.
- Confirm logs do not fill with repeated dashboard probe warnings during normal page load.

Automation target:

- Mock gateway-down state in route/helper tests and assert restart action command, status transition, and sanitized output.
- Add log-filter/probe helper tests for benign warnings where possible.

Stop point:

- Commit after Doctor restart path and focused tests pass.

### Section 4: Resend + Cognee Regression Safety

Intent: protect the two newest partner paths before doing larger simplification work.

Items I think we can address in `1.8.0`:

- [ ] Add a visible test/manual checklist lane for Resend partner test email vs agent chat email parity.
- [ ] Add/extend tests that runtime-injected `RESEND_API_KEY` reaches agent tools and workflow execution.
- [ ] Add/extend tests that benign Cognee plugin warnings are filtered but real plugin errors are preserved.
- [ ] Confirm Cognee install/uninstall/reinstall status detection remains state-aware.

Items likely for `1.8.1`:

- [ ] Deeper Cognee memory behavior tests once the plugin contract is clearer.
- [ ] Email delivery audit/rate-limit UI beyond current backend guardrails.

Manual checks before stop:

- Dev: Resend partner test email.
- Dev: agent with `clawmax-resend` sends inline status email.
- Dev: same agent sends `IDENTITY.md` or `SOUL.md` attachment.
- Cloud image: repeat partner test email and one agent email.
- On-prem image: repeat partner test email and one agent email.
- Cognee: install, uninstall, reinstall, refresh page, verify button state.

Automation target:

- Keep live email delivery manual, but automate secret propagation, dispatch selection, attachment resolution, Cognee plugin status parsing, and warning filtering.

Stop point:

- Commit after focused partner tests and manual checks are recorded.

### Section 5: Focused Client Simplification

Intent: improve high-friction UI without changing core behavior.

Items I think we can address in `1.8.0`:

- [ ] Agents: improve density/scannability while preserving chat, detail, skill, create, import, and actions flows.
- [ ] Notifications: group repeated bursts or at least reduce repeated near-identical file/action noise.
- [ ] Mobile dropdown/popover audit: top bar, notifications, Skills, Templates, Agents, Workflows, Communications, Partners.
- [ ] Add helper tests for dropdown positioning/grouping if behavior changes.

Items likely for `1.8.1`:

- [ ] Builder remaining routing/action simplification.
- [ ] Activity/Budget first-screen simplification and token/cost gap messaging.
- [ ] DocHub generated artifact browsing simplification.
- [ ] Logs/System action-oriented diagnostic surface.

Manual checks before stop:

- Desktop: Agents grid/list/table, card actions, chat open, skill manage.
- Desktop: notification open/dismiss/open-chat/open-file actions.
- Mobile/narrow: every dropdown/popover stays inside viewport.
- Light and dark mode for changed surfaces.

Automation target:

- Add pure helper tests for dropdown positioning, grouping logic, and action availability.
- Use browser/manual review only for final visual fit until we add browser automation.

Stop point:

- Commit after focused visual/manual review and relevant helper tests pass.

### Section 6: Workflow + Communications Correctness

Intent: make workflow status match real coordination outcomes.

Items I think we can start in `1.8.0` if earlier sections finish cleanly:

- [ ] Audit channel target resolution for display-name vs id mistakes.
- [ ] Add a regression test for workflow/group channel target lookup.
- [ ] Improve error wording when a workflow tries to post to a missing channel/group.

Items likely for `1.8.1`:

- [ ] Make workflow success criteria account for participant communication failures.
- [ ] Improve live thread visibility or clearly label current runtime limitations.
- [ ] De-emphasize downstream failures when upstream model/quota/auth failure is the real blocker.

Manual checks before stop:

- Apply a team template with groups.
- Trigger a workflow that posts to a group.
- Confirm group chat contains expected workflow messages.
- Confirm workflow execution status reflects any communication failure.

Automation target:

- Add route/lib tests for channel target resolution and communication-failure status handling before manual template runs.

Stop point:

- Treat this as optional for `1.8.0`; move to `1.8.1` if it expands.

### Section 7: Security + Skill Guardrails

Intent: make risk visible before users install or generate powerful skills.

Items I think we can address in `1.8.1`:

- [ ] Dangerous-skill review copy and warning taxonomy.
- [ ] Stronger warnings for skills/plugins that add binaries, network access, secrets, or machine commands.
- [ ] Readiness states for missing/present/degraded secrets before template apply or workflow run.
- [ ] Visible `OTP_DEV_MODE=log` warning outside dev/test.

Manual checks before stop:

- Import safe skill.
- Import or preview risky skill fixture.
- Install partner plugin.
- Apply template with missing secret.
- Login/auth screen in dev log-mode.

Automation target:

- Add helper tests for risk classification, readiness-state calculation, and `OTP_DEV_MODE=log` warning visibility.

Stop point:

- Do not start until 1.8.0 stabilization is complete unless a security bug appears.

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
- Minimize manual validation by adding API/helper assertions for anything repeatable.
- Keep a short manual checklist only for deployed image behavior, live third-party delivery, and visual/mobile layout.

## Manual Checks For `1.8.0`

- Agent chat with normal provider key.
- Agent chat with `clawmax-resend` status email.
- Agent chat with `clawmax-resend` file attachment.
- Cognee plugin install/uninstall/reinstall in Skills and Partners.
- Workspace switch between at least two workspaces.
- System-test integration run followed by personal workspace inspection for leaked artifacts.
- Mobile top bar, notifications, Skills, Templates, Agents, Workflows, Communications, Partners.
- Workflow run that posts to a group/channel and verifies participant communication status.
