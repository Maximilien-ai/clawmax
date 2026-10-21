# RC81 MBP14 recovery — September 21, 2026

Status: engineering recovery in progress; not tester approval.

## Observed failures

- Installed CLI reports `2.0.0-test-rc9-repair.1`. Its first RC81 health
  failure rolled back to its recorded RC21 last-known-good image. An automatic
  retry then served RC81 with healthy Dashboard/gateway checks.
- Jarvis chat failed at 19:09 PDT: an `agents.entries.jarvis` configuration
  reload failed runtime commit for the cron monitor, triggering a gateway
  restart. The request was rejected with `Gateway request entry is closed`.
- Earlier logs reported schema-19 agent databases. Offline inspection later
  found all 18 agent databases at schema 21, including Jarvis and double-agent.
  No manual doctor migration was run during this recovery. Do not attribute
  that schema change to this repair or assume its timing explains Jarvis.
- A controlled cold start failed the entrypoint's 25-second authenticated
  readiness deadline while existing SQLite databases were being validated.
  Container exit was 1, not OOM.

## Backup and recovery boundary

- User approved backup, controlled stop, repair and chat validation.
- CLI updater was stopped. Its launch-agent shutdown also coincided with loss
  of the VM process; VM recovery is being held by a recovery terminal.
- Private local backup: `/private/tmp/clawmax-mbp14-rc81-repair.5d4P1N`.
  OpenClaw state copied successfully. The workspace copy reported five
  unreadable zero-byte files: three bundled Node launchers and two old Trash
  identity files. This is not a claim of an error-free full workspace backup.
- Original Dashboard entrypoint preserved in that backup. The recovery overlay
  changes only startup readiness allowance to 120 seconds, retaining
  authenticated readiness, early process-exit detection, and finite timeout.
- Published RC81 tags/images have not changed. A locally patched RC81 is not
  evidence that the published image passed acceptance.
- No session reset, arbitrary legacy-session owner assignment, or manual
  recurring-schedule enablement was performed.

## Focused validation

- `sh SYSTEM/dashboard/docker-entrypoint.test.sh`: passed, including supervisor
  shutdown and timeout default/invalid/override/zero checks.
- `npx tsc --noEmit` in `SYSTEM/dashboard`: passed.
- Startup repair committed/pushed as `34b6a000`; CI:
  https://github.com/Maximilien-ai/clawmax/actions/runs/35679087724
  and https://github.com/Maximilien-ai/clawmax/actions/runs/35679087212.
- Patched MBP14 started at 19:20:14 PDT and reported ready at 19:21:06
  (about 52 seconds). Counts: 14 agents, 84 templates, six groups, nine workflows.
- CLI supervisor resumed and reported healthy at 19:23:31 PDT. The recovery
  terminal remains open; VM supervision independence is not yet established.
- Jarvis public CLI chat opened a newly allocated session. The local LM Studio
  Qwen request returned HTTP 200; OpenClaw produced a nonempty greeting and
  completed with `stopReason=stop`, and the Dashboard CLI child exited 0.
  However the invoking CLI stream timed out before completion delivery.
  **Runtime execution passed; end-to-end CLI delivery failed.**
- No offline doctor was needed or run. Historical schema-19 errors are not
  evidence of a currently unmigrated agent database after the fresh inspection.

## CLI handoff / remaining gates

- CLI source `DefaultPodmanHealthTimeout` is two minutes. Coordinate an outer
  deployment deadline that allows gateway startup plus Dashboard startup, and
  the existing bounded lease-recovery path. Do not merely report healthy when
  chat is unavailable. Keep failed-candidate evidence and explicit fallback
  identity visible.
- CLI chat has a ten-minute context, but `src/cmd/instance_remote.go` supplies
  an HTTP client with a 15-second total timeout. Give streaming requests an
  appropriate bounded lifetime without weakening ordinary request timeouts;
  test delayed first output, terminal delivery, cancellation and disconnect.
  Observed Jarvis model execution took about 27 seconds, longer than that
  ordinary-request budget. CLI team owns packaging/installing that repair.
- Determine why stopping the CLI LaunchAgent also terminates its VM children;
  support a maintenance pause that does not unexpectedly kill runtime state.
- Validate actual chat, group communication, template execution, workflow
  completion/results/cancellation, and restart persistence before distribution.
- Fix the chat configuration-preparation/reload race; readiness is currently
  checked before preparation can change configuration.
- Add populated older-schema upgrade coverage; legacy-JSON detection alone
  does not establish SQLite upgrade safety.
- OpenClaw Plugins remains missing: implement as a System sub-tab alongside
  Logs, distinct from the ClawMax PLUGINS manager.
