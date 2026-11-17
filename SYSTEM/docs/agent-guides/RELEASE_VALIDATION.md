# Testing and release procedure

Required before tests, CI, candidate images, release claims, or release handoff. Incorporated by [AGENTS.md](../../../AGENTS.md).

## Validation requirements

- Add or update focused tests for every behavior change, including error,
  persistence, and responsive presentation paths where applicable. Improve
  coverage with each change rather than relying only on existing tests.
- Run TypeScript and the directly affected unit/contract suites while
  iterating. Before an RC, run the complete integration, validation, and
  coverage suite.
- When cutting an RC, align `CLAWMAX_VERSION` in the ignored local
  `SYSTEM/dashboard/.env` to the exact candidate being built, restart the local
  dashboard, and verify both the visible version and `/api/system`. For example:
  `perl -0pi -e 's/^CLAWMAX_VERSION=.*/CLAWMAX_VERSION=2.0.0-test-rcN/m' SYSTEM/dashboard/.env`.
  Never carry an older RC value into a new RC or stable release. The test-image
  workflow supplies this value for containers, but local source checkouts
  otherwise fall back to the latest Git tag plus the current short SHA.
- Visually audit changed pages, dialogs, pop-ups, cards, lists, and graphical
  views at desktop and mobile widths. Check long text, scrolling, sticky
  actions, progress states, and empty/error states.
- For public/private combined RCs, verify amd64 and arm64 image builds, registry
  smoke tests, packaged version identity, plugin discovery, restart persistence,
  and the public/private source boundary before reporting the release ready.
- When creating an RC image, dispatch the public `Test Container Image`
  workflow from the candidate ref first, then dispatch `Private ClawMax Plugins
  Image` in `clawmax-plugins` with the exact same public `base_tag` and private
  `image_tag`. Record both CI links and do not call the public image complete
  until the matching combined image has passed its validation and smoke jobs.
- If a combined-image smoke job fails after the image build and plugin contract
  checks pass, inspect the failed step and distinguish a dashboard readiness
  probe/connection-reset flake from a packaging or plugin failure. The image
  may be usable, but report the smoke result as unresolved and do not silently
  mark the combined RC fully green; rerun the failed smoke jobs once before
  deferring readiness-test hardening.
- Record the observed or documented duration before starting a long-running CI,
  image, deployment, or test job. Do not continuously poll it.
- Check once near half the expected duration to catch an early failure. If the
  job is still healthy, check next at the expected completion time plus one
  minute. Only use additional sparse checks when the job exceeds that window or
  a known failure needs investigation.
- When waiting on local test processes, use long yielded waits and small output
  budgets. Report the failure or final summary instead of repeatedly relaying
  routine progress output.
- Before handoff, commit and push every owning repository with an approved
  lowercase prefix, record the relevant SHAs and CI links, and verify that no
  task-created changes remain uncommitted.
- Security claims require reproducible evidence. Record dependency counts,
  command results, residual severity, owner, and deadline; do not describe an
  initial dependency/configuration baseline as the complete security audit.

## Image dispatch preflight

Before image dispatch, read the actual workflow inputs. For public candidate images,
use `SYSTEM/dispatch-test-image.mjs` when available on the working branch:

```sh
node SYSTEM/dispatch-test-image.mjs <candidate-tag> <expected-full-SHA> --dry-run
node SYSTEM/dispatch-test-image.mjs <candidate-tag> <expected-full-SHA>
```

The helper verifies the remote tag's commit and passes full tag refs. The public
image workflow rejects raw SHA source inputs. If the helper is not yet present on
the branch, verify the remote tag and workflow schema explicitly; do not invent a
replacement invocation. Never move a published candidate tag or reuse its image
tag for different source. Record public source, private source, validation-workflow
source, and registry digest separately; a smoke-only workflow SHA is not the image
build source. Verify actual GCP mirror jobs and destination digest/pull receipts,
not only an overall green workflow that may contain skipped jobs.

For deployment-specific checks, consult [Release Checklist](../RELEASE_CHECKLIST.md)
and [Release Distribution](../RELEASE_DISTRIBUTION.md). Their examples do not replace
verification of the current candidate's configuration.

