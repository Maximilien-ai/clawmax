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

## Next: #384, Node 24.22.0

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
- [ ] Exact final-source full local integration/validation/coverage under Node
  24.22, with disposable gateway/workspace and the configured test provider.
  Expected **12–15 minutes**; only the selected provider key is passed in child
  memory, without copying the primary ignored `.env` into the worktree. A private
  before/after hash must confirm the operator registry remains byte-identical.
  The earlier 581/581 result does not satisfy that additional preservation gate.
- [ ] Final required CI/CodeQL and image-action contracts are green on the current
  head. Full required CI runs under Node 24.22; normal duration **33–43 minutes**.
- [ ] Merge only after required checks pass and main remains fresh.

Evidence logs: `/private/tmp/clawmax-384-{node-download,linux-amd64,builder-image,
lint,types,build,audit}.log`; full-suite receipt will be recorded on the PR.
The native arm64 and macOS checks also have session tool output.

The audit policy exits 0 with **zero High/Critical** advisories. Recorded
`npm audit --json` exits 1 for **4 Low / 10 Moderate** findings across 591 reported
dependencies (336 production, 256 development, 32 optional; categories overlap).
Evidence: `/private/tmp/clawmax-384-audit.json`. Dashboard owns lower-severity
follow-up before stable 2.0; the policy is unchanged and this is not a complete
security audit.

## Remaining queue and release boundary

After #384, review [#298](https://github.com/Maximilien-ai/clawmax/pull/298)'s
grouped minor/patch packages, then [#296](https://github.com/Maximilien-ai/clawmax/pull/296)'s
optional memory integration compatibility with the pinned runtime. Use existing
PRs and preserve a fresh main base after each merge. Order can change with findings.

The [November 13 record](DEPENDABOT_2026-11-13.md) retains earlier merge evidence,
dated feedback/issue snapshots and unresolved RC98 gates. Final runtime images
still require public/private amd64/arm64 builds, registry and restart smoke,
version identity and source-boundary evidence before RC readiness. The focused
Node base smoke and Dashboard builder checks do not establish those release gates.
