# Dependency maintenance — November 14

Stable remains **v1.9.9**; development is **2.0.0**, with pinned OpenClaw
**2026.9.7**. RC98 has not been cut. Dashboard owns these public-source changes;
no deployment or combined-image readiness is claimed.

## Completed merge

The owner merged [#302](https://github.com/Maximilien-ai/clawmax/pull/302) as
`2979a62859982a7c48e0bb1bda6b598df25249f7`. Exact reviewed head `b4f1bf71`
passed [required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43553001886)
and [CodeQL](https://github.com/Maximilien-ai/clawmax/actions/runs/43552997161).
Eight rendering tests and eight browser cases pass on both renderer versions;
strict frontend typing retains 290 baseline diagnostics, with none added.
The primary main checkout and installed Markdown dependency are synchronized.

## Completed: #384, Node 24.22.0

[Existing PR #384](https://github.com/Maximilien-ai/clawmax/pull/384) is refreshed
onto `2979a628` without force pushes. Product source `c95e79f3`, fixture-path
cleanup `fdd21642` and unit-boundary fix `8d775d5f` align all
three Docker stages and all three explicit CI Node steps on **24.22.0**, retaining
build-platform compilation and target-platform runtime selection. Package and
lockfile bytes are unchanged from main.
[Official release notes](https://nodejs.org/en/blog/release/v24.22.0).

Engineering checklist; **no independent human acceptance is needed**:

- [x] Eleven [pin-contract cases](../../node-runtime-pin.test.cjs) pass: stale CI,
  split Docker versions, wrong platform, missing stages/pins, floating versions,
  unreviewed majors and new-workflow drift are rejected. The Docker packaging
  contract calls the same guard and the unit suite is registered separately.
- [x] Four [native runtime cases](../../node-runtime-smoke.test.cjs) pass on the
  current macOS Node 24.19 baseline, candidate macOS Node 24.22, and Linux Node
  24.22 **arm64 and amd64**: exact runtime identity, SQLite WAL persistence,
  streamed fetch cancellation and owned child SIGTERM settlement. This suite is
  separately registered in the system runner.
- [x] The official macOS arm64 Node archive is isolated under
  `/private/tmp/clawmax-node-24.22.0/` and verified against the published SHA256:
  `75ddfb875bbd868ebe57536f4442225f54dd10f6d2178dd439de869a5c648dc3`.
  Global Node is unchanged. Only synthetic test code enters the Linux containers;
  no provider credentials, user workspace or host configuration is mounted.
- [x] Node 24.22 lint, server types, production build, source-engine boundaries,
  OpenClaw Docker packaging contract, eight workflow YAML parses and unchanged
  dependency-audit policy pass.
- [x] Docker-format Dashboard **builder target** builds on Linux arm64, including
  clean dependency installation and production compilation. Local image
  `localhost/clawmax-pr384-builder:b471da9a`, ID
  `81789678686ad837e1c509a106ed96b8dce9afc2dec47b095519b859f4e3c709`.
  Node 24.22/arm64 and both compiled artifacts are verified. This initial build
  predates the ZIP fix below; final builder validation is tracked separately.
- [x] The first full Node 24.22 run completed **577/580**, identifying three ZIP
  import suites affected by directory-level `cpSync(errorOnExist)` behavior.
  Evidence: `/private/tmp/clawmax-384-initial-full.log`.
- [x] ZIP promotion now preflights each directory/file destination, merges existing
  directories and preserves empty ones, then creates files with `COPYFILE_EXCL`.
  Fourteen workspace-upload cases (six added), skill-import routes, twelve Docs
  route cases and sixteen archive-security cases pass under Node 24.22. The
  workspace-upload cases also pass on Node 24.19. Added coverage includes outside
  and dangling symlinks, directory/file collisions, late writers and empty `.git`
  directories; collisions retain existing bytes.
- [x] Skill-import API tests now own private workspace/registry fixtures. A
  subprocess canary test verifies their standalone isolation. The full product
  retest passed **581/581**, but its private caller-registry hash detected other
  unit suites reconciling the caller registry. Evidence:
  `/private/tmp/clawmax-384-product-full-before-unit-boundary.log`. The operator's
  Personal pointer was restored to the confirmed default with a private backup;
  every other registry field was verified unchanged. No registry contents are
  copied into this repository.
- [x] The unit-phase boundary now supplies a private home and workspace, restores
  the exact live-test environment afterward and fails closed if fixture creation
  fails. Two canary cases cover standalone skills and the broader boundary,
  executing the actual skills, workflows and template-registry suites against a
  synthetic caller registry. All pass on Node 24.19 and 24.22, including cleanup
  and environment restoration. The registered isolation suite is
  [test-unit-workspace-isolation.test.cjs](../../test-unit-workspace-isolation.test.cjs).
- [x] Full preservation validation on `f23587ec` completed **580/581** with the
  operator registry **byte-identical**. The remaining check assumed `SKILLS/custom`
  existed before import because unit suites used to create it accidentally.
  A fresh-workspace route regression now verifies on-demand initialization, and
  the integration directory assertion runs after the import request. The check
  is retained. Evidence: `/private/tmp/clawmax-384-preserved-before-import-order.log`.
- [x] Two new CodeQL path-flow findings in the late-collision test hook were
  resolved using fixed fixture-owned paths and an explicit exclusive-mode
  assertion. [CodeQL](https://github.com/Maximilien-ai/clawmax/actions/runs/43563896220)
  passed on `fdd21642`; no suppression or alert dismissal was used. Final-head
  security checks remain required after the unit-boundary checkpoint.
- [x] Final Docker-format builder validation on ZIP-fixed product source passed:
  `localhost/clawmax-pr384-builder:c95e79f3`, image
  `41c0b9e1532fde1e0d84341e365a2711bd660c281e0e7117f634f1506b668a6a`.
  A compiled Linux ZIP probe also passed existing-directory merge, binary/empty
  directory retention and overwrite rejection. No image was published.
- [x] Exact final-source (`4d22641a`) local integration/validation/coverage passed
  **581/581** on Node 24.22. The operator registry remained **byte-identical**.
  Evidence: `/private/tmp/clawmax-384-final-full.log`. Statements/lines 59.06%,
  branches 76.59%, functions 65.51%; this is a measured baseline, not a claim of
  global coverage improvement.
- [x] Final [required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43568118761),
  [CodeQL](https://github.com/Maximilien-ai/clawmax/actions/runs/43568115989) and
  [image-action contracts](https://github.com/Maximilien-ai/clawmax/actions/runs/43568118784)
  passed on the reviewed head. Required CI took approximately 43 minutes.
- [x] Merged as `d9d87c50dd2e598e938f525a22777436db0d6ccb`; main synchronized.

Evidence logs: `/private/tmp/clawmax-384-{node-download,linux-amd64,builder-image,
lint,types,build,audit}.log`; full-suite receipt will be recorded on the PR.
The native arm64 and macOS checks also have session tool output.

The audit policy exits 0 with **zero High/Critical** advisories. Recorded
`npm audit --json` exits 1 for **4 Low / 10 Moderate** findings across 591 reported
dependencies (336 production, 256 development, 32 optional; categories overlap).
Evidence: `/private/tmp/clawmax-384-audit.json`. Dashboard owns lower-severity
follow-up before stable 2.0; the policy is unchanged and this is not a complete
security audit.

## Completed: #298, compatible minor/patch dependencies

[Existing PR #298](https://github.com/Maximilien-ai/clawmax/pull/298) incorporates
main `d9d87c50` without force pushes, retaining the previously merged majors.
Dependency checkpoint `685ef6b8` updates thirteen direct dependency ranges/pins;
`ee4065d8` adds four real-library runtime cases and registers one system group.
No product behavior changes are intended, and no human acceptance is required.

The proposed OpenTelemetry versions conflict: Node SDK 2.12.0 requires API
`>=1.0.0 <1.10.0`, while exporter 0.300.0 pulls SDK/core/resources 3.0.0 requiring
API `>=1.10.0 <1.11.0`. The complete existing tracing family is retained. The
labelled [follow-up #418](https://github.com/Maximilien-ai/clawmax/issues/418)
tracks a compatible migration; Dashboard owns assessment before stable 2.0.
No tracing/export consent or runtime configuration changes are included.

Engineering checklist:

- [x] Clean Node 24.22 locked install and `npm ls --all --json`: no invalid peers.
- [x] Lint, server TypeScript and production frontend build pass.
- [x] Focused scheduler, cron security, next-run, gateway protocol/client, dynamic
  API security, PDF generation and Markdown rendering suites pass in private unit
  fixtures. Four new runtime cases verify timezone/stopped-task behavior, actual
  HTTP quota enforcement, WebSocket text/binary retention and oversized-message
  refusal. Shell syntax and lint pass after registration.
- [x] Audit policy passes with zero High/Critical. Raw audit exits 1 with
  **4 Low / 10 Moderate**, fourteen total, across 590 reported dependencies
  (333 production, 258 development, 33 optional; categories overlap). Evidence:
  `/private/tmp/clawmax-298-audit.{json,log}`. Dashboard owns lower-severity
  remediation before stable 2.0; this is not a complete security audit.
- [x] Eight light/dark desktop/mobile rendering cases and four PDF preview/download
  checks pass; downloaded PDF is rendered for inspection and document definitions
  match main. Artifacts: `/private/tmp/clawmax-298-browser/`.
- [x] Final committed source `175380d0` passed **582/582** local integration,
  validation and coverage checks; operator registry stayed **byte-identical**.
  Log: `/private/tmp/clawmax-298-full.log`. Statements/lines 59.06%, branches
  76.59%, functions 65.51%. The initial 581/582 result identified a stale Vite
  security assertion; both manifest and lock assertions now enforce 8.3.5.
- [x] [Required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43601839058)
  and [CodeQL](https://github.com/Maximilien-ai/clawmax/actions/runs/43601835831)
  passed on `175380d0`. CI took **26 minutes 39 seconds**.
- [x] Merged as `a96266315ba248f8286be647be1a17cf277030ac`; main and installed
  dependencies synchronized, clean working tree.

Exact installed updates: `@types/ws` 8.18.2, cronstrue 3.39.0,
express-rate-limit 8.7.4, marked 18.1.1, node-cron 4.6.0, pdfmake 0.3.13,
ws 8.23.0, TypeScript ESLint parser 8.72.0, React Vite plugin 6.3.0,
autoprefixer 10.6.2, ESLint 10.13.0, PostCSS 8.5.33 and Vite 8.3.5.
Focused logs: `/private/tmp/clawmax-298-{lock,install,tree,lint,build,focused}.*`.

## Completed: #296, optional-memory package compatibility

[Existing PR #296](https://github.com/Maximilien-ai/clawmax/pull/296) is refreshed
onto merged main `a9626631`, without force pushes. Dependency checkpoint
`cb2acb75` pins the partner package to **2026.10.13**, with a scoped **Undici
7.30.1** override. The lock follows the existing Docker install policy
(`--omit=dev --ignore-scripts --legacy-peer-deps`), containing only two installed
packages instead of introducing a second OpenClaw runtime via peers. The host
remains **OpenClaw 2026.9.7** on **Node 24.22.0**.

The upgrade's new offline capture queue has no destination/affected-user consent
binding. `8591c370` disables that new retention/replay path in the image-owned
package with an exact-version, fail-closed patch. Live requests are preserved;
failed captures clearly report that they cannot be buffered. Existing pending
files are neither read/replayed nor deleted. The mitigation is idempotent and
refuses unexpected package versions, consumers or queue implementations.
[Security follow-up #419](https://github.com/Maximilien-ai/clawmax/issues/419)
tracks destination/user/consent binding, immediate revocation, private durable
storage and legacy recovery before offline retention may be enabled. Dashboard
owns this gate; no broader egress or manually installed plugin certification is
claimed.

Engineering checklist; **no Dashboard UI acceptance is required**:

- [x] Clean locked install, raw production audit and inactive discovery on pinned
  OpenClaw pass in synthetic HOME/config/state. Initial two-package audit exits 1
  with **1 High / 1 Moderate** package finding. The scoped patch exits 0 with
  **zero findings** across two installed dependencies (three production inventory
  entries including root). Logs: `/private/tmp/clawmax-296-{baseline-audit,
  patched-audit}.json`, `clawmax-296-install.log`. This is a bundle-specific audit,
  not a complete security review. Dashboard's separate 4 Low/10 Moderate baseline
  remains owned before stable 2.0.
- [x] Seven CI-scope guards and eight real bundle transport/hardening cases pass
  on macOS Node 24.22: credential refusal before HTTP, multipart bytes through
  patched Undici, JSON/status errors, abort/disconnect settlement, no retention
  or replay, unchanged legacy bytes and fail-closed patching. Required CI now
  unconditionally installs, audits, hardens and tests the optional bundle.
- [x] Actual plugin registration loads in the pinned runtime's memory slot with
  synthetic credentials, all capture/recall disabled and external fetch blocked;
  status `loaded`, no loader error. This proves SDK compatibility, not live
  provider readiness. Evidence: `/private/tmp/clawmax-296-activation/`.
- [x] Docker packaging/pin contracts and container-entrypoint fixtures pass.
  Dashboard source and dependency files are byte-identical to merged #298, so
  its **582/582** full local result is reused. No repeat local Dashboard suite or
  browser audit is needed for this package-only change.
- [x] Focused Linux arm64/amd64 package builds and all eight transport/hardening
  cases pass on Node 24.22.0. Local image IDs: arm64 `ca2b3f85e783`, amd64
  `8ffd18210132`. These are package probes, not published release images.
- [x] Final-head (`7d92f73e`) [required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43622293018)
  and [CodeQL](https://github.com/Maximilien-ai/clawmax/actions/runs/43622289552)
  passed; CI took **35 minutes 45 seconds**.
- [x] Merged as `703d65eba3cbe8f49df9c1905e9353e6056a99c7`. Main and the local
  optional bundle are synchronized, hardened and clean; all eight primary-checkout
  bundle cases pass. The Dependabot PR queue is cleared; #418/#419 remain open.

## Remaining queue and release boundary

The six older product PRs remain for source/evidence review:
#292, #229, #228, #194, #192 and #191. Current work is
[#191 acceptance and validation](PR191_ACCEPTANCE_2026-11-14.md). They are not automatically resolved by these
dependency merges. Tracing migration #418 and consent-bound offline replay #419
remain active, labelled follow-ups. Use existing PRs and keep each merge fresh.

The [November 13 record](DEPENDABOT_2026-11-13.md) retains earlier merge evidence,
dated feedback/issue snapshots and unresolved RC98 gates. Final runtime images
still require public/private amd64/arm64 builds, registry and restart smoke,
version identity and source-boundary evidence before RC readiness. The focused
Node base smoke and Dashboard builder checks do not establish those release gates.
