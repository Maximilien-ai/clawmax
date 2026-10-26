# Source setup/start/update fix — October 26, 2026

Status: source-checkout follow-up to RC94. Existing RC94 image identities remain
the validated artifacts recorded in RC94_IMAGE_HANDOFF_2026-10-26.md. This source
fix is not included in the immutable RC94 tag or source archive.

Mike's report showed an older global OpenClaw 2026.3.28, an unsupported
`--accept-capabilities` flag, and startup failing because neither pnpm nor
Corepack was installed. Setup had announced readiness before preparing the
branch-pinned OpenClaw 2026.9.7 runtime.

Setup and startup now share runtime selection. Missing pnpm/Corepack is handled
by installing the exact `packageManager` version declared by the pinned OpenClaw
checkout into the task cache through npm, with lifecycle scripts disabled. The
installed version is verified before build; nested build scripts use the same
cache-local binary. Failure stops preparation without a readiness stamp. No
global pnpm installation is required.

Setup selects the pinned runtime before plugin/config/Gateway operations and
fails before completion on runtime or required-plugin errors. Plugin helpers
check consent-flag support before changing plugins. They do not silently retry
without capability consent. Setup's completion output always shows the explicit
SYSTEM/start.sh and SYSTEM/stop.sh paths; launch failure does not claim that the
Dashboard is running. Update reuses setup and prints restart guidance; the
release installer continues to delegate to the release's setup script.

Doctor, direct tests, and the Gateway watchdog now select an already verified
prepared runtime before an older global CLI. Explicit OPENCLAW_BIN remains the
first choice; an unverified cache must not be selected. Real installed services
were not modified by the engineering tests.

## Get the fix on the review branch

From the existing ClawMax checkout:

```sh
git fetch origin
git switch integration/rc94-daniyar
git pull --ff-only
./setup.sh
```

This is a source-branch fix. Reinstalling the unchanged RC94 source archive does
not fetch these later commits. Initial preparation downloads/builds OpenClaw;
later starts reuse the verified cache. Node.js 24.16+ on 24.x, or 26.1+ on 26.x,
is required by the current pinned source runtime; Mike's reported Node 26.12.1
meets that requirement.

From the ClawMax repository root:

```sh
./SYSTEM/start.sh
./SYSTEM/stop.sh
./SYSTEM/start.sh --follow
```

Use the same DASHBOARD_PORT and DASHBOARD_CLIENT_PORT overrides for start and
stop when running custom ports. Default frontend: http://localhost:5173; default
API port: 3001. Update does not restart a running Dashboard automatically.

## Engineering evidence

- Missing-tool preparation fixtures: exact cache-local pnpm selection, nested
  pnpm execution, reuse, install failure, and no false readiness all passed.
- A real npm bootstrap installed/ran the checkout's pnpm 12.5.1 in a fresh
  temporary cache. The normal pinned CLI advertises both consent flags.
- Synthetic setup flows passed against an old global CLI, including pinned
  selection, preparation/plugin failure, unattended setup, interactive launch
  accepted/declined, and launch failure. Start/stop instructions were verified.
- Update/install/uninstall, source alignment and local-start contracts passed.
- Server TypeScript passed. Full isolated integration/validation/coverage at `e45b3012208a3dd80440b9b1194be0331bcf094a`: **548/548 passed**, zero failed. Statements/lines 83.26% (61146/73437), branches 80.71% (19659/24355), functions 91.86% (2519/2742). Estimated 10–20 minutes; observed about 10 minutes. Log: `/private/tmp/clawmax-source-setup-full-e45b3012.log`.
- Reader regression: prepared-cache preference failed before the follow-up;
  passed afterward in `6c1d5355`, with explicit override, unverified-cache fallback and watchdog scope tests. The shared setup flows passed again after the reader change.

## A16 — external-environment acceptance

On Mike's actual machine with the older global CLI and no pnpm/Corepack, pull
the review branch and rerun setup. Verify pinned runtime preparation succeeds,
the unsupported consent-flag error is absent, Dashboard starts at the printed
URL, and a disposable agent can reply with the configured provider/runtime.
Verify the printed SYSTEM stop command stops the Dashboard and the start command
starts it again. Run update and repeat startup. Confirm Doctor reports the
prepared runtime. Record the source SHA, OS, Node/runtime versions and concise
failure steps; do not include keys or raw conversations. This real-machine
acceptance remains open; synthetic tests do not establish it.


Updater follow-up `652c0fd1` pulls the current configured upstream instead of a
fixed main branch. Tests pass for clean tracked, dirty, detached and missing-
upstream checkouts, failure propagation, restart guidance and installer delegation.
The full-suite result above predates these narrow reader/updater follow-ups;
their affected shell suites passed separately. Latest-source CI must provide
independent whole-checkout evidence; no new image was cut for these source fixes.
