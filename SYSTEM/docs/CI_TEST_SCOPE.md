# Dashboard test scope

November 13 policy: choose tests by affected behavior. Workflow/documentation
maintenance uses focused validation; application, dependency, runtime and shared
changes retain the Dashboard suite. Unknown scope never selects the faster lane.

The required GitHub **test** job still runs. Its scope tests and existing
High/Critical dependency-audit policy run in both lanes. Repository branch
protection, approving-review requirements and CodeQL are unchanged.

## Focused automation lane

The explicit allowlist covers the reviewed image/mirror/CI workflows, their scope
selector and tests, Markdown under `SYSTEM/docs`, and root README/CHANGELOG.
It does not classify arbitrary Markdown, scripts or workflows as documentation.
The exact paths are in [.github/scripts/dashboard-test-scope.cjs](../../.github/scripts/dashboard-test-scope.cjs).

This lane validates the scope selector and runs image/mirror evidence, promotion,
Docker packaging and lifecycle contracts, plus the unchanged dependency audit.
Image action changes also require their hosted artifact round-trip/build-export
checks. No Dashboard server, Gateway or provider calls are needed. Expected CI
duration is 2–5 minutes rather than the approximately 43-minute application lane.

## Full Dashboard lane

Dashboard source/configuration, package manifests or locks, Docker/runtime files,
public plugins/fixtures, skills, shared helpers and every non-allowlisted path use
the existing setup, lint, build, server and coverage tests. Release-branch/tag
pushes also select full validation. Missing commits, unreadable events, failed or
empty diffs, malformed inventories and unusual paths select full validation.

Diffs use validated commit IDs, NUL-delimited paths and disabled rename detection.
Moving application code into docs therefore still detects its original deletion.

For local full integration, validation and coverage when applicable:

```sh
env -u OPENCLAW_BIN DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

The test wrapper uses an isolated Gateway/workspace. Do not start two runs on the
same ports. The complete final-source suite and image/runtime evidence remain
mandatory before an RC; this policy does not establish release readiness.

## Selector verification

```sh
node --test .github/scripts/dashboard-test-scope.test.cjs
```

Seven regression tests cover allowed and required paths, invalid inputs/commits,
comparison failures, actual Git edits/deletions/renames, CLI outputs and CI wiring.
The CI contract keeps the required job and audit, and checks that missing scope
output defaults to the full lane. Current-head checks must pass before merge.
