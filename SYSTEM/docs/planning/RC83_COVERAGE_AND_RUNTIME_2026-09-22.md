# RC83 coverage and isolated-runtime release gate

Status: candidate preparation; full integration/validation/coverage is running.
RC83 images have not been built. Stable remains `v1.9.9`. No installed instance
rollout is authorized by this preparation checkpoint.

## Scope and source checkpoints

- Isolated tests now own their gateway, registry, profile and disposable
  workspaces, separate unit-test environment overrides from live execution,
  and finalize template registration against the selected OpenClaw profile.
- `a9dbcb89`: resolve the temporary runtime root to its physical path before
  configuring OpenClaw. On macOS the `/var` alias versus `/private/var` physical
  path prevented native SQLite session admission from converging, stalling
  chat and workflow execution. Focused dashboard chat and three-participant
  kickoff passed after canonicalization.
- `1e175a9d`: provider validation errors, credential boundaries, catalog and
  completion failures; all requests are mocked in these focused tests.
- `2a09da7c`: metering legacy/empty snapshots, monotonic merges, alias-free
  metadata copies, out-of-order activity, and viewer/instance isolation.
- `dd81fe41`: generated workflow references, handoffs, ownership fallbacks,
  partial generated metadata and company-root normalization.
- `2643c5fa`: Builder catalog fixtures and fallback choices. Routing evaluations
  explicitly seed the expected CEO agent instead of relying on the operator's
  workspace, allowing the entire evaluation suite to execute.
- `5e44dfe9`: the Builder routing wrapper honors a nonzero test exit even when
  earlier assertions printed success. A shell regression covers exits 0, 1,
  and 137. Earlier wrapper-level green results were not proof that every
  Builder routing assertion ran successfully.

## Evidence and pending gates

- User-provided baseline: 484/484 wrapper checks passed; branch coverage
  73.17% (14,431/19,721). The Builder wrapper limitation above applies to this
  historical result.
- Focused provider validation: 125 tests passed; metering: 47; generator
  internal edges: 19; Builder routing: 125. TypeScript no-emit passed.
- Merging retained baseline coverage with focused reports estimates 75.66%
  branches (15,284/20,200). This is planning evidence, not the release gate.
  V8 branch totals change as previously unexecuted paths are discovered.
- Full gate started September 22, expected duration approximately 20–30
  minutes. Command:

  ```sh
  DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 \
    ./SYSTEM/test-with-server.sh integration --with-validation --coverage
  ```

  No `gpt-4o-mini` performance override: the pinned runtime rejected that
  model in the earlier probe. Live execution uses the server-selected default.
- [Source CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35783664745)
  is pending at this checkpoint.
- Before image dispatch: require full-suite success and branch coverage at
  least 75%, align the ignored local version to `2.0.0-test-rc83`, restart the
  local dashboard, and verify visible version plus `/api/system`.
- Dispatch public `Test Container Image` from the candidate ref first, then
  matching combined validation with both tags `2.0.0-test-rc83`. RC82 observed
  durations: public build/lifecycle approximately 43 minutes; combined
  build/smoke approximately 13 minutes. Record exact refs, CI links and
  manifests; verify both architectures, identity, plugin discovery, restart
  persistence and public/private packaging boundaries.

## Unchanged acceptance boundary

RC82 public and combined image checks passed, but image publication is not
installed-instance acceptance. See the
[RC82 CLI deployment handoff](RC82_CLI_DEPLOYMENT_HANDOFF_2026-09-22.md) for
MBP14 storage and test10 cluster-routing blockers. Do not retry those deployments
or modify installed gateways as part of isolated source validation.

Keep schedules disabled and broad tester distribution on hold. Public Template
Workflow graph execution and settled cancellation remain separate from the
legacy dashboard workflow tests; do not infer their readiness from kickoff
success. Retain the [RC81 contract evidence](RC81_CLI_RC6_CHAT_HANDOFF_2026-09-20.md)
until that remaining work is completed.
