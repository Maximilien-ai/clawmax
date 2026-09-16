# RC76 stability images — 2026-09-15

Status: public image build queued; private build dispatch waits for public success.
Neither test10 nor mbp14 has been upgraded by this work. This is not a deployment-readiness claim.

## Immutable candidate

- Public source: `e0aea6fd275eb47f262bd46cc0459e9bef4673fa`.
- Prerelease: <https://github.com/Maximilien-ai/clawmax/releases/tag/v2.0.0-test-rc76>.
- Includes process reaping (`5884d901`), ZIP exports (`460306c4`), and native SQLite chat history (`e0aea6fd`).
- Image tag for both repositories: `2.0.0-test-rc76`. Do not overwrite RC75.
- Operations catalog/capability and plan/apply/revision requirements remain incomplete.
  Recurring Operations schedules must remain disabled.

## Source validation

- Normal CI: <https://github.com/Maximilien-ai/clawmax/actions/runs/35020348823> — passed.
- CodeQL: <https://github.com/Maximilien-ai/clawmax/actions/runs/35020348068> — passed.
- Full local `SYSTEM/test-with-server.sh integration --with-validation --coverage`: exit 0,
  483 checks passed, 0 failed, using OpenClaw 2026.8.2 (`0965053`).
- Coverage: statements/lines 82.60%, branches 72.08%, functions 91.98%.
- Ignored local dashboard `.env` aligned to `2.0.0-test-rc76`; newly started dashboard
  verified through `/api/system` and visible version screenshot.
- Local evidence: `/tmp/clawmax-rc76-release-gate.log`,
  `/tmp/clawmax-rc76-version.png`, `SYSTEM/dashboard/coverage/coverage-summary.json`.
- GTM read-only probe on mbp14 located 11 user/assistant messages in native storage;
  no conversation text was exported and no runtime database writes were performed.

## Image workflow handoff

- Public: <https://github.com/Maximilien-ai/clawmax/actions/runs/35045721382>.
  Inputs: `source_ref=refs/tags/v2.0.0-test-rc76`, `test_tag=rc76`.
  Recent successful public build duration: approximately 32 minutes.
- Private: not dispatched yet. A local watcher waits for public success, then dispatches
  `private-image.yml` in `Maximilien-ai/clawmax-plugins` with
  `base_tag=2.0.0-test-rc76` and `image_tag=2.0.0-test-rc76`.
  Watcher log: `/tmp/clawmax-rc76-image-chain.log`. It depends on this local process
  remaining alive. If it is interrupted, inspect workflow history before dispatching
  manually to avoid duplicate builds. Expected private duration: approximately 23 minutes.
- Record the private run URL, exact private source SHA, both image digests, amd64/arm64
  build results, registry/version/plugin smoke results, and restart-persistence results
  before claiming the combined image ready. No digests are available yet.
- RC75's combined lifecycle smoke was unresolved. If the same smoke fails after
  packaging/contracts pass, inspect the failed step and rerun failed smoke jobs once;
  do not silently count it as passed.

## Still required

Verify completed images, then separately validate deployment, agent chat close/reopen,
ZIP downloads, and unattended restart behavior on mbp14 and test10. Image publication
does not establish Operations deployment readiness or complete all export-path auditing.
