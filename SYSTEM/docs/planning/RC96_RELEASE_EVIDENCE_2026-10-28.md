# RC96 release evidence — October 28, 2026

Dashboard team. Version: `2.0.0-test-rc96`. Tester candidate; image validation is pending.

## Source and acceptance

- Full RC95 baseline plus accepted RC96 stability/usability work and deployment OpenAI defaults.
- Product checkpoint: `e2466928`; tested tree: `2be9c585` (later README-only documentation at `3bf3a3d2`).
- #344 merged to main as `61a7d851`; release branch aligned with main at `e6641593`.
- Max reported all model selection, AI workflow and DAG deletion retests worked. Deployment-key flow has synthetic server/browser evidence; Web's worker and live first chat require canary confirmation.

## Validation

Final isolated integration, validation and coverage: **559/559 passed**, zero failed. Statements/lines **83.56%**, branches **81.30%**, functions **91.92%**. Server TypeScript passed. Client retains 291 baseline diagnostics with none added. Desktop/mobile deployed-key generation, model selection, workflow editing/deletion and group/community regressions passed. Live chat in the full suite was skipped because no paid provider key was supplied; do not treat synthetic completion as real-provider certification.

## Images

Dispatch public Test Container Image from the exact release tag, then the matching private image with `base_tag=image_tag=2.0.0-test-rc96`. Expected public pipeline duration from recent RCs: 60–67 minutes. Matching private RC95 pipeline: about 13 minutes after public availability. Both amd64/arm64 packaging, registry smoke and plugin acceptance must pass before reporting the combined image ready. Record CI links and digests after dispatch/completion.

Private source: `eb9af8eb05988a7c5ed307e7aff3788a81107fab`, the same private source used by RC95. No private source is copied into the public repository or image.

## Remaining boundaries

- Held #227, #228, #229 and #288: session lifecycle, Gateway ownership, streaming persistence and observable scheduler cleanup.
- Broad dependency upgrades, new runtime additions and unrelated feature PRs are not admitted to this accepted stability candidate.
- Most recently inspected CodeQL gate reported 13 findings (3 critical, 10 high). Analysis jobs completing does not resolve those findings. Dashboard owns reproducible disposition before broad deployment; no blanket dismissals or security clearance.
- OpenAI-compatible alias consistency and Web/CLI worker key injection remain external validation boundaries.

[Tester checklist and deployment contract](RC96_PREVIEW_ACCEPTANCE_2026-10-28.md).
