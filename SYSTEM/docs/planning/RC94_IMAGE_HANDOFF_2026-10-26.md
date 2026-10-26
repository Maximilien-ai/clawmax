# RC94 test-image handoff — October 26, 2026

Status: **builds in progress; image pair not yet validated or ready for deployment**.
Maximilien authorized these test images for Mike, Daniyar and the other reviewers
before all human acceptance is complete. This does not promote production or
merge integration PR #291 to main.

## Monitor

- [Public amd64/arm64 build and validation](https://github.com/Maximilien-ai/clawmax/actions/runs/40377088343)
  started at 18:22 UTC. Recent observed public duration: 57–72 minutes.
- [Combined-image workflow](https://github.com/Maximilien-ai/clawmax-plugins/actions/workflows/private-image.yml):
  dispatch is waiting on successful public validation. A background coordinator
  is set to dispatch with matching `base_tag` and `image_tag`; a private run has
  not yet been dispatched. Recent observed combined duration: about 13–15 minutes.
- [Candidate CI](https://github.com/Maximilien-ai/clawmax/actions/runs/40375089952)
  was running when the image build began.
- [RC94 prerelease](https://github.com/Maximilien-ai/clawmax/releases/tag/v2.0.0-test-rc94).

The coordinator checks near half the public estimate, then expected completion
plus one minute, with sparse checks if the run overruns. A failed public job
blocks combined dispatch. This document must be updated with both final run
results and digests before the matching pair is reported ready.

## Fixed identity

- Public Git tag: `v2.0.0-test-rc94`.
- Exact tagged source: `326f2684b49d43d72f710fc3408b9d1985177eb3`.
- Public image: `ghcr.io/maximilien-ai/clawmax-dashboard:2.0.0-test-rc94`.
- Combined image: `ghcr.io/maximilien-ai/clawmax-plugins:2.0.0-test-rc94`.
- Required image platforms: `linux/amd64` and `linux/arm64`.
- Expected visible and `/api/system` version: `2.0.0-test-rc94`.
- Image digests and actual combined source SHA: **pending**.

Do not use a partial architecture tag or treat this intended image reference as
proof that a complete registry image is available. Use the existing on-prem or
cloud deployment configuration with the validated image identity; no deployment
has been performed by Dashboard as part of this build request.

## Verified local evidence

- Exact-source isolated integration/validation/coverage: **548/548 passed,
  zero failed**. Statements/lines 83.26% (61146/73437), branches 80.71%
  (19659/24355), functions 91.86% (2519/2742).
- Command: `DASHBOARD_PORT=3003 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage`.
  Log: `/private/tmp/clawmax-rc94-image-final-326f2684.log`. Estimated 10–20
  minutes from recent runs; this run took about 11 minutes.
- The earlier gate failed one obsolete recommendation-route expectation. It
  expected a now-hidden deprecated model. Commit `326f2684` corrects the fixture;
  the route suite passed 79/79, and the complete gate above was rerun afterward.
- Dependency audit passed with zero High/Critical advisories. This is not a
  complete security audit or a disposition of the open PR CodeQL findings.
- AI workflow generation/save/reopen passed synthetic desktop/mobile browser
  regressions, including failed-save draft retention and empty-output recovery.
  AI tests passed 57/57 and workflow-route tests 22/22. Production build, server
  TypeScript and changed-file lint passed. Client TypeScript retains 291 baseline
  diagnostics with zero new diagnostics in the recorded comparison.
- Local ignored `.env` was aligned to RC94, the idle Dashboard restarted, and
  both the browser-rendered version and `/api/system` were verified as RC94.

## Reviewer checks

Use the [review handoff](RC94_REVIEW_HANDOFF_2026-10-26.md) for included changes,
the nine held PRs, and independent results. Use disposable agents/workflows.
Maximilien still has **A4–A8, A13 and A15** to complete. Mike and Daniyar should
record their own results with the image digest, version, OS/architecture,
browser, runtime, and model. Keep keys and raw participant conversations out of
reports.

Prioritize **A15**: generate a workflow through the AI Editor, inspect readable
Markdown instructions and correct agent/schedule/timezone, save, reopen, restart,
and verify persistence. The tagged fix prevents structured instructions becoming
`[object Object]` and blocking save. Real-provider acceptance remains open.

Before promotion, resolve failures, obtain human acceptance and required PR
approval, and disposition the unresolved security findings. Before image handoff,
verify both architectures, registry smoke, packaged identity, plugin discovery,
restart persistence, and the public/private source boundary. If a combined smoke
step flakes after packaging/contracts pass, inspect it and rerun failed smoke
once; do not silently report the pair fully green.
