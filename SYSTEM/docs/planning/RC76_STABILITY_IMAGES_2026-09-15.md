# RC76 stability images — 2026-09-15

Status (2026-09-16): both immutable images published; native amd64 and arm64
acceptance passed. Test10 is running RC76 and passed controlled restart checks.
MBP14 remains on RC75. This is not Operations deployment-readiness certification.

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

## Image evidence

- Public: <https://github.com/Maximilien-ai/clawmax/actions/runs/35045721382>.
  Inputs: `source_ref=refs/tags/v2.0.0-test-rc76`, `test_tag=rc76`.
  Passed builds, manifest, registry smoke, and native lifecycle checks on both architectures.
  Observed duration: approximately 32 minutes.
- Private: <https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/35047933784>.
  Matching `base_tag` and `image_tag`: `2.0.0-test-rc76`.
  Image source: `d7e17c39bcbef9168718de5b33d28950abc437fc`.
  Builds, contracts, runtime acceptance, and amd64 registry smoke passed. Arm64
  plugin/health checks passed, but lifecycle startup exceeded its 40-second limit
  under QEMU on both the original attempt and the single failed-job rerun.
  The original workflow remains failed; it must not be represented as green.
- Private CI fix `96c4b2d09214d77c1ea24a06ca974a42d2268058` uses native runners
  and adds read-only, digest-pinned acceptance. No RC76 image was overwritten.
  Source checks passed: <https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/35139388154>.
- Independent acceptance of the exact published combined digest passed on native
  amd64 and arm64, using public candidate tag `refs/tags/v2.0.0-test-rc76`:
  <https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/35139406437>.
  The lifecycle timeout was not relaxed. Observed duration: approximately 5 minutes.

### Registry pins

| Image | Architecture | SHA256 digest |
| --- | --- | --- |
| `ghcr.io/maximilien-ai/clawmax-dashboard` | Index | `c9bf890ada66a964f7737151b284665ec457bc403eedfcb836c217db5f917cf2` |
| Public | amd64 | `6e425524067a7f5a57f9674e8f77ca2a802fda49bf935f5b1c25080b984d2d12` |
| Public | arm64 | `19b0de224bc35862ab6abb4ccdde502dfe930537f82c1c8694e549294953ab52` |
| `ghcr.io/maximilien-ai/clawmax-plugins` | Index | `f1cd72a8e8932ed057a555c8e1716ecfa70111967e23400762c9840b67587304` |
| Combined | amd64 | `1c3ad654879e23899c8b9774018d3ee753c109194087db6c2d75eb6d8385a7ff` |
| Combined | arm64 | `23323a0c513654d78da1cd147d22a2db82fe66563a87ba4b810d672a0d20e87f` |

## Test-instance rollout

### Test10 cloud

- Updated only deployment `clawmax-dashboard`, container `dashboard`, in namespace
  `clawmax-cld-test10-molljk0d` on context `clawmax-cloud-nyc1-2` to the combined index above.
  This direct Kubernetes canary does not prove the normal CLI/worker upgrade path.
- Rollout and a subsequent controlled deployment restart succeeded. After restart:
  `/api/system` reports `2.0.0-test-rc76`, PID 1 is `tini`, gateway RPC responds,
  and the dashboard pod is ready with zero container restarts.
- All six workspace inventories survived unchanged (agents/workflows): default 13/9,
  demo 9/9, biopharma-hack 5/4, clawcamp 13/8, maximilien-ai-operations 0/0,
  maximilien-ai-operations-0-1-0 5/4. No unrelated workflows were disabled.
- Both Operations workspaces have zero enabled recurring schedules after restart.
- Workspace PVC remains the existing 4 GiB claim, UID
  `8025e55b-12fb-451c-a6ba-238235bb5c45`.
- Live agent and workspace ZIP export requests returned HTTP 200, ZIP content type,
  and ZIP signatures. Responses were checked in memory; no archive contents or
  credentials were logged. This is not an exhaustive export-path audit.
- Recovery image remains
  `ghcr.io/maximilien-ai/clawmax-plugins@sha256:2d5fc993fed82a5d340d76d5d3b5ee8e38105e7759b6061f46854001774881a8`.

### MBP14 on-prem

- Left healthy RC75 container `clawmax-dashboard-240e10` unchanged.
- Podman management SSH returned EOF, but the dedicated VM's local API socket works.
  VM filesystem has approximately 5 GiB free (88% used); safe pull headroom is not
  established. No images, volumes, or workspace data were pruned.
- Installed CLI is still 1.9.34. Official RC3 installer and native archive downloaded
  with matching published SHA256 checksums; installer signature and notarization
  accepted. Installation stopped at `sudo: a password is required`; no installation
  or raw-binary replacement was performed.
- User action: run the staged official installer with local administrator approval:
  `sudo /usr/sbin/installer -pkg /tmp/clawmax-cli-rc3.yblH6x/ClawMax-2.0.0-test-rc3.pkg -target /`.
  If the temporary file is gone, download it again from the
  [official RC3 release](https://github.com/Maximilien-ai/clawmax-cli-releases/releases/tag/v2.0.0-test-rc3).
  Then verify installed CLI identity, disk headroom, and the supported upgrade path
  before replacing the on-prem container.

## Still required

Complete mbp14 deployment and both instances' browser chat close/reopen and download
checks, including cloud BYOK chat. Native history reading is fixed, but native
clear/reset/archive-write lifecycle is not fully repaired. GTM's stored identity
still names it `gtm-agent`; the intended guide text field remains unidentified.
Finish Operations API contracts and acceptance separately; keep recurring Operations
schedules disabled. Image publication does not establish Operations deployment
readiness, normal CLI/worker upgrade reliability, or complete all export-path auditing.
