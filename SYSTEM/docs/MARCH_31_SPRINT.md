# March 31 Sprint

> Date: March 31, 2026
> Window: One-day sprint
> Focus: hardening, aggressive testing, regression safety, and workflow correctness fixes

## Goals

1. Reduce user-facing workflow errors before more feature work.
2. Add a repeatable smoke path so recent dashboard changes are easier to trust.
3. Push test coverage and manual verification harder before more feature expansion.
4. Keep workflow correctness tasks ready if the main test push uncovers blockers.

## Tomorrow AM

### 1. Workflow customization field validation

**Goal**
- Prevent bad template/workflow apply inputs from failing later in execution.

**Scope**
- Validate required fields in apply/customization forms.
- Validate obvious URL fields.
- Validate GitHub repo inputs when applicable.
- Show clear field-level or modal-level error messages before apply.

**Expected output**
- Safer apply flow with fast feedback.
- Reduced runtime failures from invalid user input.

**Definition of done**
- Invalid required inputs are blocked before submit.
- Invalid URLs are rejected with clear messaging.
- GitHub repo validation is enforced where relevant.
- Added tests for validation behavior.

### 2. Rate limit notification

**Goal**
- Surface provider/API rate-limit failures clearly instead of leaving them buried in logs or raw errors.

**Scope**
- Detect rate-limit responses in relevant server paths.
- Create warning notifications with retry guidance.
- Show useful UI copy rather than opaque provider output.

**Expected output**
- Users understand why a request failed and what to do next.

**Definition of done**
- Rate-limit failures create visible warnings.
- Notification copy suggests retry/backoff.
- Added targeted tests where practical.

### 3. Dashboard smoke suite

**Goal**
- Create one command to verify the highest-value local dashboard flows.

**Scope**
- Cover auth/bootstrap assumptions where practical.
- Workspace switching.
- Budget read/write.
- Agent import/export basic path.
- Basic workflow create/view/trigger path where feasible.

**Expected output**
- A repeatable local smoke command or script.
- Clear pass/fail output for key dashboard regressions.

**Definition of done**
- One documented command runs the smoke suite.
- Failures are easy to diagnose.
- The suite is stable enough to use before shipping.

## Tomorrow PM

### 1. Dashboard regression automation

**Goal**
- Turn the most failure-prone dashboard paths into repeatable automated coverage.

**Scope**
- Add or extend regression coverage for template apply.
- Cover workspace switching and budget read/write paths.
- Include at least one agent import/export path if the test harness supports it.
- Prioritize stable high-signal checks over broad but flaky coverage.

**Expected output**
- Higher confidence in the dashboard without relying only on manual clicking.

**Definition of done**
- At least one repeatable automated regression path is added for each highest-risk flow selected.
- Failures point clearly to the broken area.
- The suite is stable enough to run during active iteration.

### 2. Integration and smoke test expansion

**Goal**
- Make the current test surface broad enough to catch workflow and import/export regressions fast.

**Scope**
- Tighten the one-command smoke path for key UI/API flows.
- Expand integration coverage for workflow create/view/trigger behavior where practical.
- Include recent import/export and budget-sensitive flows in the verification plan.
- Keep runtime and flakiness under control so the suite remains usable.

**Expected output**
- A more aggressive but still practical test pass for the areas most likely to regress.

**Definition of done**
- Smoke coverage and integration coverage are both documented and runnable.
- Recent hardening work is exercised by at least one repeatable test path.
- Any uncovered gaps are written down as explicit follow-up items.

### 3. Full manual verification pass

**Goal**
- Run an aggressive hands-on pass over the highest-value flows after the automated work lands.

**Scope**
- Manually verify template apply with validation failures and success cases.
- Exercise rate-limit notification behavior using a reproducible trigger or stubbed path if available.
- Re-run workspace switching, budget feedback, import/export basic path, and workflow trigger path.
- Record exact failures and convert anything significant into next tasks immediately.

**Expected output**
- A same-day confidence read on whether the new hardening work actually holds up end to end.

**Definition of done**
- The full manual pass is completed against the current build.
- Any failures have exact reproduction notes.
- The sprint closes with a short go/no-go quality summary.

## AM Swap-ins If Time Opens Up

### 1. Top bar online count ignores paused agents

**Goal**
- Make the dashboard status count reflect actually active agents instead of paused ones.

**Scope**
- Exclude paused agents from the top bar online count.
- Verify the count stays correct when agents are paused or resumed.
- Check for any related empty or all-paused state copy issues.

**Expected output**
- The top bar no longer reports paused agents as online.

**Definition of done**
- A fully paused workspace does not show agents as online.
- Mixed active/paused states display the correct online count.
- Added or updated targeted coverage if the count logic is tested.

### 2. Cost notifications

**Goal**
- Warn users before or when cost limits become a problem instead of only failing later.

**Scope**
- Add toast/alert coverage for approaching workspace cost limits.
- Show a clearer notification when a limit is hit.
- Keep the initial version focused on in-product notifications, not email delivery.

**Expected output**
- Users get timely cost warnings and clearer budget-related feedback.

**Definition of done**
- Near-limit states generate a visible warning.
- Limit-hit states generate clear actionable notification copy.
- Notification behavior is documented or covered with targeted tests where practical.

### 3. Chat message normalization

**Goal**
- Normalize gateway/chat payloads on the server so the client does not need fragile parsing hacks.

**Scope**
- Strip JSON wrappers, ANSI codes, and internal metadata at the API layer.
- Normalize known raw gateway payload shapes before returning them to the client.
- Preserve readable content while reducing client-side best-effort parsing.

**Expected output**
- Cleaner chat payloads and fewer rendering/parsing edge cases in the dashboard.

**Definition of done**
- Known raw payload variants are normalized server-side.
- Client rendering works without depending on brittle regex cleanup for those cases.
- Added targeted tests for representative payload formats where practical.

## PM Swap-ins If Test Work Blocks

### 1. Workflow import should use template's id field

**Goal**
- Preserve workflow dependency references during import instead of regenerating unstable ids from names.

**Scope**
- Use the template workflow `id` field during import.
- Keep `dependsOn` and related references aligned with imported ids.
- Verify imported workflows still render and execute correctly.

**Expected output**
- Imported workflows preserve their original dependency graph.

**Definition of done**
- Import uses template ids rather than name-derived ids.
- `dependsOn` links remain intact after import.
- Added regression coverage for import behavior if test hooks exist.

### 2. Workflow re-run resets status

**Goal**
- Make re-running a completed workflow behave like a fresh execution for downstream nodes.

**Scope**
- Reset downstream dependency state to idle when a workflow is re-triggered.
- Ensure stale completed/blocked statuses do not leak into the new run.
- Verify the UI reflects the reset state correctly.

**Expected output**
- Re-runs start from a clean dependency state and progress correctly.

**Definition of done**
- Re-triggering a completed workflow resets downstream nodes to idle.
- The next run can advance without stale status interference.
- Added targeted tests for re-run state transitions where practical.

### 3. DAG auto-advance on cron triggers

**Goal**
- Make cron-triggered workflow execution advance dependent DAG nodes the same way manual triggers do.

**Scope**
- Reuse or extend existing DAG completion logic for cron-triggered runs.
- Verify downstream tasks are scheduled after cron-originated completion events.
- Check for parity between manual and cron execution paths.

**Expected output**
- Cron-triggered workflows cascade through the DAG without manual intervention.

**Definition of done**
- Cron-triggered completions advance eligible downstream nodes.
- Manual and cron trigger behavior is aligned for DAG progression.
- Added regression coverage for cron cascade behavior where practical.

## Recommended Execution Order

### Best AM sequence
1. Workflow customization field validation
2. Rate limit notification
3. Dashboard smoke suite

### Best PM sequence
1. Dashboard regression automation
2. Integration and smoke test expansion
3. Full manual verification pass

## Notes

- Hardening first is the right move after tonight's import/export and budget work.
- Workflow validation and stronger test coverage will reduce avoidable regressions before more feature expansion.
- OAuth clean-room auth test and security follow-through remain important, but they are intentionally deferred because they need a larger uninterrupted block than this sprint can support.
- If the PM test push hits harness or environment blockers, switch immediately to the workflow correctness swap-ins rather than burning time on test churn.
