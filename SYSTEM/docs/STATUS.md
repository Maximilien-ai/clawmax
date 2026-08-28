# ClawMax Status

**Current Version**: v1.9.9

**Development Line**: 2.0.0

**Last Updated**: August 28, 2026

**Status**: `v1.9.9` remains stable. RC46 is the latest fully published 2.0 test candidate; OpenClaw remains pinned to `v2026.6.34` on the 2.0 line.

## Current State

- RC43 public source, image, digest, and combined-image results are retained as historical evidence, but tester feedback made that candidate non-promotable.
- RC45 carries the LM Studio/Gemma, QBO runtime packaging, Builder, optional-skill, Partner navigation, and focused Review repairs. Public source `4ea36c447b3380c4c3cce045b441ec3973edfccb` and amd64/arm64 image publication passed [run 32911120892](https://github.com/Maximilien-ai/clawmax/actions/runs/32911120892); the public manifest digest is `sha256:26d49eb2da975a449db9513ba889f0cd78f064e4fbba2f16458312d69824f688`. The matching authorized combined image passed its private build, contract, smoke, and publication run.
- RC46 adds guaranteed Builder AI Create choices, Claude Code and Factory Droid runtimes, retained-process cleanup, and higher-value branch coverage. Public source `b8f45271e2ef4c4df5f8c1210bbfdab8572b2b36` passed the complete `473/473` local gate and public amd64/arm64 publication plus registry smoke in [run 33211887894](https://github.com/Maximilien-ai/clawmax/actions/runs/33211887894). Private source `dc04204d7dbe90bf9cd49b8d8a7a5f745e33fe91` passed contracts, runtime acceptance, build, package privacy, live discovery, and both architecture smokes in [run 33211905606](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/33211905606); the combined multi-architecture RepoDigest is `sha256:ecd22c383e2d00f019bb767f71adbda477be32008a0e8c5f49cb704422d71010`.
- Generic plugin activity remains visible on agent and workflow cards and detail views without encoding private plugin domains into the public host contract.
- Lifecycle and Review are the public product plugins for 2.0. Evals, Guardrails, and Optimize remain private enterprise plugins. Public `PLUGINS/test/plugin-*` directories are synthetic contract fixtures only.
- The RC38 source security review has no unresolved Critical or High findings. Final-candidate cloud/on-prem runtime evidence and the completed Review export remain required before promotion; the source review is not a claim that those external gates have passed.
- Real Google and Microsoft provider checks remain pending or require an explicit documented deferral. Synthetic OAuth, authorization, persistence, and adapter coverage is green.

## Active Release Tracks

### 1.9.9 maintenance

- Branch: `release-1.9.9`
- Tag: `v1.9.9`
- Image: `ghcr.io/maximilien-ai/clawmax-dashboard:1.9.9`
- Policy: accept only reproducible release-blocking hotfixes; validate any hotfix as a new RC before promotion.
- Runtime: OpenClaw `v2026.6.11`.

### 2.0.0 development

- Branch: `main`
- Latest published candidate: `2.0.0-test-rc46`
- Next candidate: only if RC46 hands-on or external-environment testing finds a source or packaging defect
- Runtime: OpenClaw `v2026.6.34`
- Hands-on review: use the focused RC46 Review set; RC45 results remain historical evidence.
- External validation: verify cloud and on-prem health, restart behavior, chat, workflows, and plugin persistence against the accepted images.
- Promotion rule: if candidate source changes, cut and validate a new RC. Otherwise promote the exact tested source and image digest.
- Alternate runtime PR #170 is merged in RC46; its source, package, and runtime contracts are green, while hands-on Claude Code and Factory Droid checks remain in the focused Review set.

## Release References

- active launch plan: [RELEASE_2_0_0_LAUNCH_2026-08-24.md](planning/RELEASE_2_0_0_LAUNCH_2026-08-24.md)
- changelog: [CHANGELOG.md](../../CHANGELOG.md)
- active backlog: [BACKLOG.md](BACKLOG.md)
- known issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- documentation index: [README.md](README.md)
- testing guide: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- source security review: [SECURITY_REVIEW_2_0_RC38.md](security/SECURITY_REVIEW_2_0_RC38.md)
- historical plans: [planning/archive/](planning/archive/)
