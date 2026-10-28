# RC96 release evidence — October 28, 2026

Dashboard team. Version: `2.0.0-test-rc96`. Tester candidate; public and combined image validation and both GCP mirrors passed. Security and live deployment acceptance remain separate.

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

## Published source and build dispatch

- Immutable public tag: `v2.0.0-test-rc96`, source `e548c64da18f7eca27108dd8f7adc0bf5c4f2cd6`.
- [Public image workflow](https://github.com/Maximilien-ai/clawmax/actions/runs/40743991708), dispatched October 28 at 18:19 UTC. Expected tag: `ghcr.io/maximilien-ai/clawmax-dashboard:2.0.0-test-rc96`.
- Private source tag `v2.0.0-test-rc96` pins `eb9af8eb05988a7c5ed307e7aff3788a81107fab`. Matching combined image is queued to dispatch only after public workflow success, with both inputs `2.0.0-test-rc96`; expected tag: `ghcr.io/maximilien-ai/clawmax-plugins:2.0.0-test-rc96`.
- Local preview visible version and `/api/system` both verified `2.0.0-test-rc96`; all five configured plugin pages loaded and reloaded without page errors. Existing workspace data was preserved.
- Source integration #344 is merged. #320 was merged independently. Seven redundant originals (#324, #326, #328, #329, #330, #332, #342) were closed after proving their changes already incorporated; do not count these as seven new independent merges. Earlier originals were automatically incorporated/closed by the integration.
- Eight Daniyar PRs remain open: four held reliability changes (#227/#228/#229/#288), and four overlapping alternatives or follow-ups (#339/#340/#341/#343). RC96 already provides table containment, member inspection, Details editing and honest non-streaming wording; these four PRs are not four missing RC96 features. Any further differences need reconciliation separately.

## Short tester handoff

RC96 includes all accepted RC95/RC96 fixes and the deployment OpenAI-key setup. Please wait for both image pipelines to pass before pulling the combined plugin image. Focus on fresh deployment without browser BYOK: configured OpenAI, selected model defaults, AI-create agent and first chat; then model/backup selection, AI workflows with mentions and examples, groups/communities, DAG deletion and restart persistence. Record version, Pass/Fail/Blocked and a brief note in Review. Secrets stay server-side. Open CodeQL findings and external worker delivery remain explicit limitations.

## Final image identity — verified October 28

Version field: `2.0.0-test-rc96` (keep this separate from the registry reference).

Combined Dashboard + plugins (use for plugin-enabled deployments):

```text
ghcr.io/maximilien-ai/clawmax-plugins:2.0.0-test-rc96
ghcr.io/maximilien-ai/clawmax-plugins@sha256:54f1801ad730aeef27a7b872334cf92c5a34e26f8d13f28ece2c4618851ad210
us-east1-docker.pkg.dev/clawmax-ai/clawmax-private/clawmax-plugins@sha256:54f1801ad730aeef27a7b872334cf92c5a34e26f8d13f28ece2c4618851ad210
us-west1-docker.pkg.dev/clawmax-ai/clawmax-private/clawmax-plugins@sha256:54f1801ad730aeef27a7b872334cf92c5a34e26f8d13f28ece2c4618851ad210
```

Public Dashboard image (public plugins only):

```text
ghcr.io/maximilien-ai/clawmax-dashboard:2.0.0-test-rc96
ghcr.io/maximilien-ai/clawmax-dashboard@sha256:b75a62eeabacf81ce225b57dc0e7e3a8626dc143998bed115b1d2f7b1c5339dd
us-east1-docker.pkg.dev/clawmax-ai/clawmax-public/clawmax-dashboard@sha256:b75a62eeabacf81ce225b57dc0e7e3a8626dc143998bed115b1d2f7b1c5339dd
us-west1-docker.pkg.dev/clawmax-ai/clawmax-public/clawmax-dashboard@sha256:b75a62eeabacf81ce225b57dc0e7e3a8626dc143998bed115b1d2f7b1c5339dd
```

These are multi-architecture index digests for amd64 and arm64. GHCR identities come from the successful workflows' `gcp-mirror-target` artifacts; both regional mirror jobs reported the same digest, both architectures, and `pullVerified: true`.

- [Public build, registry smoke and lifecycle acceptance: passed](https://github.com/Maximilien-ai/clawmax/actions/runs/40743991708).
- [Combined build, plugin/runtime validation and both architecture smoke jobs: passed](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/40755182053).
- [Public mirrors: passed](https://github.com/Maximilien-ai/clawmax/actions/runs/40754554073).
- [Combined mirrors: passed](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/40757443189).

Web/CLI own catalog pinning and rollout. Dashboard has not changed a fleet deployment. After delivery, verify installed version, digest, plugin discovery, and the fresh-instance deployed-key create/chat canary. RC97 default/backup pairs and WhatsApp pairing recovery are planned follow-ups, not RC96 image features.
