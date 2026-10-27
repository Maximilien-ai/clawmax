# ClawMax Status

**Current Version**: v1.9.9

**Development Line**: 2.0.0

**Last Updated**: October 27, 2026

**Status**: `v1.9.9` remains stable. RC94 images were published from `326f2684`; later source fixes landed on main through PR #291. The active RC95 source preview is on `integration/rc95-daniyar` in draft PR #304 and has no release image yet. Independent acceptance, candidate CI and the recorded security gate remain open. See the [RC95 preview acceptance](planning/RC95_PREVIEW_ACCEPTANCE_2026-10-27.md). Older installed-instance gates remain in their dated release records.

## RC95 source preview on October 27

[Draft PR #304](https://github.com/Maximilien-ai/clawmax/pull/304) combines 13 of
Daniyar's 17 reviewed PRs (all eight new #320–#327 included) on `integration/rc95-daniyar`, with four held for
lifecycle evidence. The local code checkpoint passed 556/556 checks. See the
[RC95 acceptance file](planning/RC95_PREVIEW_ACCEPTANCE_2026-10-27.md) for the exact
source, engineering limitations, CI/security gate and nine independent reviewer
checks. Main contains merged RC94 PR #291; this preview has not landed on main.
The existing RC94 images are unchanged; RC95 has no release tag or image yet.

## Earlier release evidence (retained history)

- RC43 public source, image, digest, and combined-image results are retained as historical evidence, but tester feedback made that candidate non-promotable.
- RC45 carries the LM Studio/Gemma, QBO runtime packaging, Builder, optional-skill, Partner navigation, and focused Review repairs. Public source `4ea36c447b3380c4c3cce045b441ec3973edfccb` and amd64/arm64 image publication passed [run 32911120892](https://github.com/Maximilien-ai/clawmax/actions/runs/32911120892); the public manifest digest is `sha256:26d49eb2da975a449db9513ba889f0cd78f064e4fbba2f16458312d69824f688`. The matching authorized combined image passed its private build, contract, smoke, and publication run.
- RC46 adds guaranteed Builder AI Create choices, Claude Code and Factory Droid runtimes, retained-process cleanup, and higher-value branch coverage. Public source `b8f45271e2ef4c4df5f8c1210bbfdab8572b2b36` passed the complete `473/473` local gate and public amd64/arm64 publication plus registry smoke in [run 33211887894](https://github.com/Maximilien-ai/clawmax/actions/runs/33211887894). Matching authorized combined-image validation also passed; restricted source identity and evidence remain with the owning release repository.
- Generic plugin activity remains visible on agent and workflow cards and detail views without encoding external plugin domains into the public host contract.
- Lifecycle and Review are the public product plugins for 2.0. Other deployment-managed plugins remain outside this public repository and image. Public `PLUGINS/test/plugin-*` directories are synthetic contract fixtures only.
- The public partner catalog covers Senso, Opik, GitHub, Resend, Cognee, Gmail, Microsoft 365, and Digo. The [partner contribution guide](../../PARTNERS/README.md) points to each shipped pattern and keeps partner configuration separate from consented Activity Export.
- The [plugin guide](../../PLUGINS/README.md) is the public entry point for plugin creation, host boundaries, and the Lifecycle and Review examples.
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
- Latest tagged test candidate: `2.0.0-test-rc91`; the next candidate number and source SHA are not selected yet.
- Candidate runtime baseline: OpenClaw `v2026.9.7`; verify the packaged core and plugin versions on each installed target.
- Hands-on review: use the [current dual-instance gate](planning/DASHBOARD_2_0_DUAL_INSTANCE_GATE_2026-10-12.md). RC85 and earlier checklists are retained historical evidence.
- External validation: verify the same identified image on MBP14 and test10, including restart, chat, workflows, and plugin persistence.
- Promotion rule: if candidate source changes, cut and validate a new RC. Otherwise promote the exact tested source and image digest.
- Alternate runtime PR #170 is merged in RC46; its source, package, and runtime contracts are green, while hands-on Claude Code and Factory Droid checks remain in the focused Review set.

## Release References

- active launch plan: [RELEASE_2_0_0_LAUNCH_2026-08-24.md](planning/RELEASE_2_0_0_LAUNCH_2026-08-24.md)
- active Dashboard gate: [DASHBOARD_2_0_DUAL_INSTANCE_GATE_2026-10-12.md](planning/DASHBOARD_2_0_DUAL_INSTANCE_GATE_2026-10-12.md)
- changelog: [CHANGELOG.md](../../CHANGELOG.md)
- active backlog: [BACKLOG.md](BACKLOG.md)
- known issues: [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- documentation index: [README.md](README.md)
- testing guide: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- source security review: [SECURITY_REVIEW_2_0_RC38.md](security/SECURITY_REVIEW_2_0_RC38.md)
- historical plans: [planning/archive/](planning/archive/)
