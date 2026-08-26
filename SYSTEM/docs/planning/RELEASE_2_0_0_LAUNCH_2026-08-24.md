# ClawMax 2.0.0 Launch

> Status: active final validation plan
> Current candidate: `2.0.0-test-rc45` source validation; image pending
> Stable release: `v1.9.9`
> Updated: August 25, 2026

RC43 hands-on feedback found release-blocking model authorization, runtime
packaging, Builder, and navigation issues. RC43 is no longer promotable
unchanged; remediation is tracked in
[RC43_FEEDBACK_2026-08-25.md](RC43_FEEDBACK_2026-08-25.md), and accepted source
changes require a fully validated replacement candidate. RC44 then failed its
QBO command probe on both architectures before publishing a manifest, so RC43
and RC44 evidence below is historical and does not establish RC45 readiness.

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

## Remaining Launch Gates

Only work requiring human judgment or an external environment remains here:

- [ ] Complete hands-on RC45 product testing and record any release-blocking
  observations in the current Review set.
- [ ] Confirm the accepted candidate restarts cleanly in the supported cloud
  and on-prem deployment paths, including authenticated private-image pulls
  where the enterprise plugins are enabled.
- [ ] Complete real-provider checks that cannot be proven with synthetic OAuth
  fixtures, or explicitly defer them without claiming provider validation.
- [ ] Export and retain the final Review evidence with named verifier, result,
  notes, and external evidence links.

## Promotion

Promote only the exact RC45-or-later source and digest that pass all gates:

1. promote the exact tested public digest to `2.0.0`;
2. publish the matching authorized combined image from the accepted private
   source;
3. tag the accepted public source as `v2.0.0`;
4. publish release assets and verify authenticated and unauthenticated pulls as
   appropriate for each image;
5. update README, changelog, status, known issues, documentation index, and
   release notes from development-candidate language to stable `2.0.0`.

PR #170 is not a launch gate. Its alternate runtime architecture requires a
current rebase, focused review units, and independent post-2.0 validation.
