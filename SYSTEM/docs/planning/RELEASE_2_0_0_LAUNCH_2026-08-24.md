# ClawMax 2.0.0 Launch

> Status: active RC46 preparation and final validation plan
> Latest published candidate: `2.0.0-test-rc45`
> Next candidate: `2.0.0-test-rc46`, pending current-main merge and validation
> Stable release: `v1.9.9`
> Updated: August 27, 2026

RC43 hands-on feedback found release-blocking model authorization, runtime
packaging, Builder, and navigation issues. RC43 is no longer promotable
unchanged; remediation is tracked in
[archived RC43 feedback](archive/RC43_FEEDBACK_2026-08-25.md), and accepted source
changes require a fully validated replacement candidate. RC44 then failed its
QBO command probe on both architectures before publishing a manifest, so RC43
and RC44 evidence below is historical. RC45 subsequently passed publication;
new changes on `main` require a fully validated RC46 rather than modifying RC45.

## Accepted RC45 Engineering Evidence

- Public source: `4ea36c447b3380c4c3cce045b441ec3973edfccb`.
- Public amd64/arm64 build, manifest publication, packaged-version verification,
  and registry smoke passed in
  [run 32911120892](https://github.com/Maximilien-ai/clawmax/actions/runs/32911120892).
- Public multi-architecture manifest digest:
  `sha256:26d49eb2da975a449db9513ba889f0cd78f064e4fbba2f16458312d69824f688`.
- The matching authorized combined image passed private build, source-boundary,
  plugin-contract, runtime-acceptance, smoke, and publication validation in
  [run 32912142580](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/32912142580).

## Historical RC43 Engineering Evidence

- Public source `a4b78c1d12136e21707e926c3d2a0e8cc0b1a1d0` passed hosted CI.
- The complete local integration, validation, coverage, and live-execution gate
  passed `463/463`, with 81.14% statements/lines, 69.40% branches, and 91.19%
  functions.
- Public amd64/arm64 image publication, packaged identity, manifest assembly,
  and independent registry smoke passed in
  [run 32658795332](https://github.com/Maximilien-ai/clawmax/actions/runs/32658795332).
- The public multi-architecture manifest digest is
  `sha256:8af1e160106db1acab5e9b853743cad943effe8de5d52dc11890dd0b2b715c44`.
- Authorized combined-image validation, private source locking, package privacy,
  runtime acceptance, live plugin discovery, and amd64/arm64 registry smoke
  passed. Detailed private source and evidence remain in the private plugin
  repository.

## RC46 Engineering Gates

- [ ] Merge only reviewed changes with green hosted CI, then run the complete
  integration, validation, coverage, and live-execution suite on the exact
  merged source.
- [ ] Complete issue [#187](https://github.com/Maximilien-ai/clawmax/issues/187):
  run the documented 24-hour combined-image Podman soak and retain baseline,
  interval, peak/final RSS and PID, process inventory, architecture, and digest
  evidence. A restart must not be required to reclaim routine resources.
- [ ] Build and independently smoke both public and matching authorized combined
  amd64/arm64 images from the exact RC46 source, with packaged version identity,
  discovery, restart persistence, and public/private source-boundary evidence.

## Human And External-Environment Gates

Only work requiring human judgment or an external environment remains here:

- [ ] Complete hands-on RC46 product testing for surfaces changed after RC45 and
  record any release-blocking observations in the current Review set.
- [ ] Confirm the accepted candidate restarts cleanly in the supported cloud
  and on-prem deployment paths, including authenticated private-image pulls
  where the enterprise plugins are enabled.
- [ ] Complete real-provider checks that cannot be proven with synthetic OAuth
  fixtures, or explicitly defer them without claiming provider validation.
- [ ] Export and retain the final Review evidence with named verifier, result,
  notes, and external evidence links.

## Promotion

Promote only the exact RC46-or-later source and digest that pass all gates:

1. promote the exact tested public digest to `2.0.0`;
2. publish the matching authorized combined image from the accepted private
   source;
3. tag the accepted public source as `v2.0.0`;
4. publish release assets and verify authenticated and unauthenticated pulls as
   appropriate for each image;
5. update README, changelog, status, known issues, documentation index, and
   release notes from development-candidate language to stable `2.0.0`.

PR #170 is a proposed RC46 change, not accepted release evidence. If it merges,
its alternate runtimes, cancellation lifecycle, credential isolation, packaged
CLIs, and resource behavior must pass the same RC46 source and image gates.
