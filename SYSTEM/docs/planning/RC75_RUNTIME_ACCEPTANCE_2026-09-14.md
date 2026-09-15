# RC75 cloud and on-prem runtime acceptance

Started: 2026-09-14 America/Los_Angeles; continued 2026-09-15.

## Status

Both test instances now run Dashboard `2.0.0-test-rc75` with OpenClaw
`2026.8.2`. This is partial runtime evidence, not release approval.
The combined-image ARM64 CI smoke remains failed after two attempts.
New-agent hot reload and local Ollama configuration still need product fixes.
The subsequent full VM/service recovery check exposed a zombie gateway owner
that blocked automatic recovery; that gate failed.

Public source: `8bd30b18ecfa171df8ab6f904432075506293ef6`, tag
`v2.0.0-test-rc75`.

- [Public image run](https://github.com/Maximilien-ai/clawmax/actions/runs/34761820837): passed.
- [Combined image run](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/34779347227): build and discovery passed; ARM64 lifecycle readiness failed.
- [CLI recovery-fix CI](https://github.com/Maximilien-ai/clawmax-cli/actions/runs/34787086355): passed at `e79f18b`.

## Cloud: test10

- Context: `clawmax-cloud-nyc1-2`.
- Namespace: `clawmax-cld-test10-molljk0d`.
- Instance identity: `cld-test10-molljk0d`.
- Image: `ghcr.io/maximilien-ai/clawmax-plugins@sha256:2d5fc993fed82a5d340d76d5d3b5ee8e38105e7759b6061f46854001774881a8`.
- Only `/app/DATA` is mounted; no mounted source patch.
- Controlled deployment restart passed. Replacement pod
  `clawmax-dashboard-7b45b444f6-qsdgw` became ready with zero restarts.
- Authenticated `/api/system` and public discovery report RC75.
- Authenticated gateway RPC passed after restart without watchdog recovery.
- All six workspace IDs survived. Startup store counts remained 13 agents,
  85 templates, 11 groups, and nine workflows.
- PVC UID `8025e55b-12fb-451c-a6ba-238235bb5c45` survived; request and capacity
  both remained 4 GiB.
- Existing readiness/watchdog settings remain 75/90 seconds.
- No server provider environment credential is configured. Browser BYOK chat
  remains an external-environment acceptance check; the operator was asked to
  perform it. Credential contents were not read or exported.

This proves a restart of the existing deployment, not a fresh cloud worker
update action. The CLI team still owns the normal update-path verification.

## On-prem: mbp14

- Instance identity: `onp-mbp14-mojahds1`.
- Dedicated VM: `podman-clawmax`; 4 CPUs, 4 GiB memory, 40 GiB disk.
- Installed agent remains CLI `1.9.34`.
- Original failure: four authenticated RC75 pulls timed out at ten minutes.
  The old agent stopped RC64 and then refused recovery during retry cooldown.
- A subsequent manual pull failed on GHCR DNS after transferring layers.
  Retrying after connectivity returned completed successfully.
- RC75 arm64 manifest:
  `sha256:02a86946dcd9b9678f2714f94910588b35367cfbdc3251d8687a632ef3e156b8`.
- Local image ID:
  `072ae7c779611d31bd0b6fc88c1194a8bb843f1ba07db505e645d3708cbc91b0`.
- Temporary recovery CLI build metadata identifies clean source `ebe1491`.
  It includes `0b361dd` (recoverable updates) and `e79f18b` (cooldown recovery).
  A normal one-shot reconcile restored RC64 while RC75 downloaded. Then
  `agent connect --once --retry-failed-image` installed RC75 successfully.
- `/api/system` reports RC75; host health passes; port binding is
  `127.0.0.1:3201`. Persisted desired image remains RC75 and failed-attempt
  state cleared. Original four workspaces and 13 agents survived.

### Real chat findings

Created the dedicated `rc75-runtime-probe` agent with `ollama/qwen2.5:latest`.
It remains in the default workspace with acceptance tags and chat evidence.

1. Provisioning returned success, but chat failed with unknown agent ID.
   Disk roster included the agent; live gateway roster did not. Gateway logs
   showed a committed hot reload failing to recover the cron monitor and a
   missing prepared chat-metadata owner. A container restart loaded the agent.
2. Chat then failed because OpenClaw required Ollama provider auth. The local
   Ollama endpoint was reachable, but no Ollama key/profile was configured.
   Used the supported `openclaw models auth paste-api-key --provider ollama
   --agent rc75-runtime-probe` command with a non-secret placeholder.
3. Dashboard streamed a real local-model response containing `RC75_OK` in
   30 seconds, with terminal completion and no error events.

The initial 25-second gateway readiness check timed out during the first RC75
startup, followed by successful watchdog recovery. Do not equate Dashboard
health with gateway readiness or successful agent execution.

### Full VM/service restart finding

Concurrent CLI integration testing stopped and restored the dedicated VM and
installed service during the final persistence check. Dashboard RC75 returned
with all 14 agents and the original store counts, but gateway recovery failed.
The old gateway PID 123 was a zombie parented by PID 1 (`node`). OpenClaw
refused another gateway because that PID still owned the state directory.
The authenticated probe returned connection refused while HTTP health passed.

After verifying no live agent subprocess remained, a clean container restart
cleared the zombie and restored authenticated gateway readiness. This recovery
does not make the full VM/service restart gate pass. Image entrypoints and
deployment wrappers need to ensure orphaned children are reaped and gateway
ownership can recover without manual container replacement.

## Remaining engineering gates

- Finish post-chat restart/session verification on mbp14, including zombie
  reaping and watchdog recovery after a gateway exits with scheduled work.
- Publish and install a CLI release containing the recovery fixes; the
  temporary one-shot binary does not upgrade the installed service.
- Prove cloud deployment actions preserve the captured instance image/env,
  immutable identity, and expanded PVC while reporting failures accurately.
- Fix Add Agent provisioning so success requires registration in the running
  gateway, including populated state with cron monitoring. A restart must not
  be required after each new agent.
- Make local Ollama initialization compatible with OpenClaw's native auth
  requirements without requesting a real secret for an unauthenticated local
  server. Preserve explicitly configured remote-provider credentials.
- Re-run native architecture lifecycle acceptance with populated state and
  scheduled work. Preserve the unresolved combined CI smoke result.

These are engineering-owned gates, not Review queue assignments. Any source
fix requires a new immutable candidate; do not overwrite published RC75 tags.
