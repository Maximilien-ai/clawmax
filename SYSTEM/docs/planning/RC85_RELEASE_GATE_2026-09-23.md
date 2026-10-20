# RC85 release gate — September 23, 2026

Stable remains `v1.9.9`. RC85 is a test candidate, not a stable promotion.
Priorities remain stability, simplification, then consistency.

## Candidate scope

- Consistent optional empty `TOOLS.md` handling and legacy `N/A` tag parsing.
- Reject primary/backup model saves denied by explicit runtime policy without
  widening that policy or overwriting the previous configuration.
- Preserve single-agent versus team intent in Builder; recover cleanly from
  malformed starter-suggestion responses.
- Read older native SQLite chat stores while preserving modern active-branch
  isolation and index-readiness checks.
- Navigate to Agents after successful agent/team template application; preserve
  the modal and inputs on failure. Synthetic desktop/mobile retry checks passed.
- Public Template catalog import/export and staged lifecycle work: see the
  [CLI contract handoff](RC85_TEMPLATE_CLI_HANDOFF_2026-09-23.md). Staged apply is
  not a claim of admitted public Template Workflow execution.

## Engineering gate

- User-supplied baseline: 485/485 checks; statements/lines 83.64%, branches
  75.76%, functions 92.45%.
- New test-only checkpoints cover registry failures, skill-route validation and
  partial failure, provider readiness/discovery, generic plugin contracts and
  persistence, and workspace result presentation. Focused tests and TypeScript
  passed.
- Validation source: `a6f23e9210dea81c749bdf9ab224be8eb593297d`.
- Clean integration/validation/coverage rerun: **485 passed, zero failed**.
  Branches **77.19% (15987/20710)**; statements/lines 84.17%
  (55034/65382); functions 92.95% (2244/2414). This exceeds the 77% gate.
  Command: `DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test-with-server.sh integration --with-validation --coverage`.
  Local log: `/private/tmp/clawmax-rc85-final-gate.log`.
- Local ignored environment aligned to `2.0.0-test-rc85`; restarted dashboard
  verified through `/api/system` and a read-only browser version check.
- [Candidate source CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35917231768).
- Candidate tag: `v2.0.0-test-rc85`, source
  `dc0c4369500d6d3e9c19e7ccf9bb299f55197402` (documentation-only evidence update
  after the tested source).
- [Public image build](https://github.com/Maximilien-ai/clawmax/actions/runs/35918395530):
  passed amd64 and arm64 builds, manifest publication, registry smoke, and
  lifecycle acceptance on both architectures. Published image:
  `ghcr.io/maximilien-ai/clawmax-dashboard:2.0.0-test-rc85`, digest
  `sha256:a094d8ed7f251ba46974893e8c98292d114cb30a92e4a67fa91e926ca5fa0363`.
- [Matching combined image](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/35923539989):
  passed runtime acceptance, monorepo contracts, private package boundary,
  packaged plugin discovery, amd64/arm64 registry smoke, and ARM64 template
  persistence. Private source:
  `ce2516d8a07ef96796ca138b748e6bd501672547`. Both `base_tag` and
  `image_tag` were `2.0.0-test-rc85`. Published image:
  `ghcr.io/maximilien-ai/clawmax-plugins:2.0.0-test-rc85`, digest
  `sha256:33a0850a7b9068fcf7020c94571cb61257a6dc7084bc90a37568d57c4ec9e869`.
- Previous observed timing: approximately 8 minutes for local coverage, 50
  minutes for public images, and 13 minutes for the combined image.

Before tester handoff, verify amd64/arm64 builds, registry smoke tests, packaged
version, source identity, plugin discovery and persistence. Installed cloud and
on-prem acceptance remain separate from successful image publication.

## Mike acceptance and unresolved reports

Mike reported issues on RC83; his compatible endpoint is believed to be hosted,
but that detail is not confirmed.

- Check an allowed primary/backup model can be saved and actually used in chat.
- Check policy-denied saves fail clearly and preserve previous settings.
- Check empty tools files and placeholder tags no longer block agent editing.
- Wrong-model execution is **not confirmed fixed**. Obtain the same agent's saved
  primary/backup selection and redacted failed-chat logs; do not request keys or
  complete configuration files.
- Duplicated chat errors and raw Markdown in the error banner remain unresolved.
- Broad history/clear, credential-forwarding, and activity-export PRs are not
  implicitly included by the focused fixes above.

Retain the existing deployment blockers and public Template execution limitation
in [Known Issues](../KNOWN_ISSUES.md). No RC85 image should be described as ready
until its matching combined-image validation and smoke jobs have passed.
