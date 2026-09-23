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
- Validation source: `2317a379331f17f05d30037a6b5825b78aef7b3d`.
- Clean integration/validation/coverage rerun: pending. Require at least 77%
  branch coverage; the incremental estimate is not release evidence.
- [Candidate source CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35914749999).
- RC85 tag, public image and matching combined image: not dispatched yet.
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
