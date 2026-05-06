# Three-Day Sprint — ClawMax 1.4.0

> **Window:** Friday, May 1 through Sunday, May 3, 2026  
> **Release Goal:** ship `1.4.0` by Sunday EOD with build-a-company, company dashboards, workflow handoffs, and stable test/release automation.  
> **Primary Risk:** new company orchestration features are powerful but still expose cleanup, hierarchy, and workflow-runtime edge cases. Keep the sprint narrow.

## Release Definition

`1.4.0` is releasable when:

- `SYSTEM/test-with-server.sh` is green on `main`.
- Context-overflow regression is not reproducible on fresh workflow runs after restart.
- Applying, deleting, and reapplying a generated company does not leave stale agents, files, workflows, outputs, dashboards, or org nodes.
- Build-a-company hack test and B2B SaaS company can each run at least one handoff path end to end.
- Company dashboard detail/compact views do not crash and show company input, org summary, output/handoff links, and consistent spend.
- Workspace switcher/top bar handles long workspace names without clipping critical controls.
- Release notes/changelog describe the new company workflow features and known limitations.

## Non-Goals

- No full org editor.
- No complete template marketplace/promotion flow.
- No broad mobile audit beyond release-blocking clipping.
- No third demo company unless hack-test and B2B paths are stable first.
- No gateway architecture rewrite unless it directly blocks local/dev release validation.

## Friday — Stabilize Core Correctness

### Goal

Make the merged `main` branch deterministic enough that feature validation is meaningful.

### Must Ship

- [ ] Fix and commit `SYSTEM/test-with-server.sh` wrapper shell issue.
- [ ] Run `SYSTEM/test-with-server.sh` on `main` and capture failures.
- [ ] Fix any failing unit/smoke tests that block the wrapper.
- [ ] Reproduce or close the current context-overflow regression with fresh restart + fresh workflow run.
- [ ] Add regression coverage for the session/cache/context fix if not already covered.
- [ ] Audit company delete path and identify exactly what still survives delete.

### Targeted Tests

- [ ] `bash -n SYSTEM/test-with-server.sh`
- [ ] `DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test-with-server.sh`
- [ ] Fresh technical-writing workflow run after dashboard restart.
- [ ] Fresh build-a-company hack-test kickoff run after dashboard restart.

### Exit Criteria

- Test wrapper is green or has one clearly scoped failure with a fix plan.
- Context overflow is either fixed with tests or reduced to a provider/model limitation with evidence.
- Company delete/reapply cleanup work has a concrete file/API checklist.

## Saturday — Company Flow Hardening

### Goal

Make company apply, org rendering, workflow handoffs, and dashboards reliable enough for release demos.

### Must Ship

- [ ] Company delete removes generated agents and agent directories for that company namespace.
- [ ] Company delete removes or invalidates related workflow outputs and generated dashboards.
- [ ] Company delete does not remove unrelated companies with the same display name.
- [ ] AI-generated companies import as one rooted company with child teams, not per-lane wrapper roots.
- [ ] Org page renders each company once and suppresses duplicate derived/wrapper roots.
- [ ] Generated workflow dependencies/handoffs appear in the DAG and unlock downstream steps.
- [ ] Handoff/output documents show as links where the artifact exists.
- [ ] Dashboard notification artifact links open the in-dashboard document viewer consistently.

### Targeted Tests

- [ ] Template/company delete/reapply unit coverage.
- [ ] Organization-team tree normalization test for one-root company import.
- [ ] Workflow handoff/dependency inference test for generated company workflows.
- [ ] Dashboard route/link test for artifact links where practical.

### Manual Smoke

- [ ] Apply hack-test company.
- [ ] Run kickoff through at least one downstream step.
- [ ] Open org page and verify one rooted company tree.
- [ ] Delete company and verify agents/files/workflows/dashboard residue is gone.
- [ ] Reapply same company and verify no `Agent already exists`.

### Exit Criteria

- Hack-test company path is repeatable after delete/reapply.
- B2B generated company applies with a clean org hierarchy and visible workflow dependencies.
- Dashboard links and compact/detail views are stable enough for demo.

## Sunday — Release Candidate, Image, and Notes

### Goal

Freeze release candidate, run full validation, publish `1.4.0`, and test the released artifact.

### Must Ship

- [ ] Run full `SYSTEM/test-with-server.sh`.
- [ ] Run release smoke checklist in a fresh workspace.
- [ ] Update release notes/changelog for `1.4.0`.
- [ ] Commit remaining fixes with `fix:`, `feat:`, `test:`, or `docs:` prefixes.
- [ ] Push `main`.
- [ ] Build/publish `1.4.0` image/release artifact.
- [ ] Pull/test the released image or package path.
- [ ] Document any known release limitations in `SYSTEM/docs/KNOWN_ISSUES.md`.

### Release Smoke Checklist

- [ ] Start dashboard from clean restart.
- [ ] Confirm BYOK/provider readiness.
- [ ] Apply build-a-company hack test.
- [ ] Run at least two connected workflow steps.
- [ ] Open workflow DAG and verify handoff line/edge.
- [ ] Open company dashboard and verify input/org/output/costs.
- [ ] Delete and reapply the same company.
- [ ] Generate/apply B2B company.
- [ ] Run B2B kickoff and verify downstream unlock.
- [ ] Open docs/artifacts from dashboard and communication links.
- [ ] Verify long workspace names are readable in top bar/dropdown.

### Exit Criteria

- Tests are green.
- Manual release smoke passes without manual filesystem cleanup.
- New release artifact is published and validated.
- Any remaining limitations are documented and not release-blocking.

## Triage Rules

- If a bug blocks delete/reapply or context-safe workflow execution, fix it before UI polish.
- If a UI issue is cosmetic and does not block the release smoke checklist, document it and defer.
- If B2B generation remains flaky, ship with hack-test as the canonical demo and document B2B as early-generation follow-through only if the rest is stable.
- Do not add new feature scope after Saturday noon unless it directly reduces release risk.

## Owners / Work Streams

- **Runtime/test:** `SYSTEM/test-with-server.sh`, workflow context/session behavior, test determinism.
- **Company lifecycle:** template apply, delete cleanup, namespace isolation, org rendering.
- **Workflow handoffs:** dependency inference, DAG rendering, output artifacts, downstream unlock.
- **Company dashboards:** compact/detail resilience, artifact links, spend consistency.
- **Release:** changelog, image/package publish, smoke validation.
