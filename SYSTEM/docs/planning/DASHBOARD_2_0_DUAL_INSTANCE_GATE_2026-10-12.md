# Dashboard 2.0 dual-instance acceptance gate

**Opened:** October 12, 2026  
**Stable release:** `v1.9.9`  
**Latest tagged test candidate in this checkout:** `v2.0.0-test-rc91`  
**Source under review:** [PR #212](https://github.com/Maximilien-ai/clawmax/pull/212), owner-scoped inert Template staging and dev-only no-tool chat

This is the active Dashboard 2.0 gate. Passing source CI, publishing an image, deploying an instance, and obtaining hands-on acceptance are separate results. Do not call 2.0 working on both targets until each target passes the checks below on the same identified candidate. Do not infer current fleet state from an earlier local or handoff result.

## Today: close the source and evidence gap

1. Finish PR #212's CI and review. Verify that its dev-only chat path remains limited to the selected localhost workspace and that no public Template execution capability is advertised prematurely. Merge only after required checks and review pass; record the merge SHA. PR #212 does not by itself complete the public plan/apply/Workflow contract.
2. Run focused Template, authorization, origin, model-protection, and chat tests on the candidate source. The user runs the complete local `integration --with-validation --coverage` wrapper before the next RC; record its total, coverage, OpenClaw version, and any failures. Do not start image/release CI with completed implementation uncommitted.
3. Triage the MBP14 RC91 `ERR_PACKAGE_PATH_NOT_EXPORTED` chat failure against the **exact affected agent** and installed OpenClaw core/plugin versions. Preserve its volumes and last known good image; repair or upgrade through the owning CLI/on-prem flow, then repeat direct chat. Local dev success cannot close this issue.
4. Obtain a bounded test10 inventory: current image digest/version, OpenClaw core/plugin versions, health, workspace state, and whether the same chat failure occurs. Treat unknown as unknown, not a pass.

## This week: prove one candidate on both targets

- Select the next candidate from a fixed source SHA after PR #212 and any independently reviewed runtime repair. Run the complete local suite, public amd64/arm64 image and smoke, and matching private combined-image validation/smoke. Verify packaged version, plugin discovery, and public/private source boundary. Record both CI links and image digests. GCP mirroring is useful for availability; verify the exact digest and pull/auth path used by each deployment rather than assuming registry cutover.
- Have CLI deploy that **same candidate** to MBP14 (on-prem) and test10 (cloud) with rollback preserved. For each, verify authenticated UI/API version identity, startup and restart health, workspace switching, persistent agents/configuration, direct chat with the intended model, Group and temporary Group chat, a manual Workflow with settled result/history, and failure diagnostics. Check both public and combined-plugin features actually used on that instance.
- Exercise Template catalog import and inert staging in isolated workspaces. Keep the public lifecycle claim separate: named host-owned Skill/credential bindings, read-only Collector Workflow execution, restart/idempotency, exact cleanup, and CLI commands require their own authorization and runtime evidence. No credential values in evidence or exports.
- Capture per-target pass/fail evidence and any remaining external-environment or human-judgment checks. Promote `2.0.0` only after the exact tested image/digest and both target acceptances are recorded; otherwise cut another candidate for fixes.

## Exit criteria

| Gate | Evidence required | Current state on October 12 |
| --- | --- | --- |
| PR #212 | Required CI and review pass; merged SHA | Open; mergeable, review required; CI test running at last check |
| Full local suite | User-run integration, validation, coverage summary on candidate SHA | Not yet recorded for post-#212 candidate |
| Matching images | Public and private amd64/arm64 builds, smoke, identity, digests | Not yet recorded for post-#212 candidate |
| MBP14 | Exact image and installed core/plugin identity; direct/Group chat, Workflow, restart, persistence | RC91 chat failure reported; repair and retest pending |
| test10 | Same identified candidate and full cloud acceptance | Current deployment/acceptance evidence not yet recorded |
| Public Template execution | Server-owned authority, broker, plan/apply, read-only Workflow and cleanup | Not established by PR #212 |

The older RC85 and RC89 documents remain historical evidence and backlog detail, not the active release gate.
