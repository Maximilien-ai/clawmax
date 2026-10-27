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

### Follow-up: existing Gateway belongs to another installation

Mike's next attempt prepared OpenClaw 2026.9.7 successfully, then failed on
legacy `meta.lastTouchedAt` and `commands.ownerDisplay` config keys. Doctor
refused maintenance because the installed Gateway belongs to another OpenClaw
installation. That refusal must not be bypassed. A16 remains open.

Fix `94dccd7dfb1ea7edd79bb03776fe0394814b18a5` adds a read-only config check
before plugin commands and an explicit isolated development launcher. Retry:

```sh
git fetch origin
git switch integration/rc94-daniyar
git pull --ff-only
./SYSTEM/local-dev.sh
```

Open http://localhost:5178 after startup. Add a key in Model Integration, create
a disposable agent and verify chat. Ctrl-C stops this Dashboard and foreground
Gateway. Save the printed `./SYSTEM/local-dev.sh --root ...` command to restart
with the same test data. Do not use normal SYSTEM/stop.sh for this isolated mode.
The default API port is 3005; occupied ports cause an error before startup.

This mode creates a committed public-source snapshot with its own HOME, config,
workspace, registry and token. Existing global state/services are not migrated.
Host provider secrets and private plugin paths are not inherited. It reuses
the prepared runtime binaries; it does not test a cold runtime build. Reusing a
root preserves its original source commit; a new invocation without `--root`
tests the latest pulled commit. Data is temporary and may be cleaned by the OS.

First-run clarification (`17a5e6f8`): Mike's retry reached a running Dashboard
successfully, then Ctrl-C stopped it. The live-log terminal had looked stuck.
The launcher now waits for the API, UI and frontend API proxy to return the
expected source version/workspace before printing **ClawMax is ready** and
opening the browser. It explicitly says to keep the terminal running.
`--no-open` supports headless testing; browser-launch failure prints the URL.
Isolated setup no longer prints standard host start/stop commands or the wrong
5173 URL; normal setup also uses its configured frontend URL throughout.
Six launcher tests passed, including delayed/mismatched readiness, failure,
process exit and browser-launch fallback. Setup/alignment suites and server
TypeScript passed. A real reused environment passed the new API/UI/proxy gate.
A fresh snapshot of `17a5e6f85d37ba5cf28d4cd8755668b7795eddba` then
installed dependencies, started the isolated runtime and Dashboard, passed that
gate and successfully invoked the macOS browser opener. Its output contained
the correct 5178 URL and the keep-terminal-running instruction, without the
conflicting 5173 URL or host start/stop commands. Log:
`/private/tmp/clawmax-first-run-ready.log`. This used the prepared runtime cache;
a provider-backed agent reply and Mike's machine acceptance remain open.

Repeated-start feedback: Mike later reported port 3005 already occupied on
both a new invocation and `--root` restart. This does not identify the listener
or prove an agent workflow works. Try the existing UI at localhost:5178 and
inspect the listener with `lsof -nP -iTCP:3005 -sTCP:LISTEN`. Stop the original
session with Ctrl-C before restarting it. A root retains its saved ports and
cannot run twice. For another new environment choose unused ports, for example
`DASHBOARD_PORT=3006 DASHBOARD_CLIENT_PORT=5179 ./SYSTEM/local-dev.sh`.
Fix `148755df` prints these recovery steps on a port conflict without stopping
any existing process. Seven launcher tests passed, including this conflict path.

Merge status checked at `ae8a4aab`: test CI passed, but PR #291 still required
review approval and its CodeQL findings gate failed with 2 critical and 18 high
alerts. Successful CodeQL analysis jobs do not clear that findings gate. These
startup improvements do not resolve those alerts or establish merge readiness.

### PR #291 security remediation — validation in progress

The 20-alert gate was inspected rather than dismissed. Remediation source:

- `25fddc46`: process-secret HMAC cache partitions replace reusable API-key
  fingerprints; linear trailing-slash normalization replaces the flagged
  backtracking expressions. Model discovery: 19 tests passed at this checkpoint.
- `717cb72e`: confined paths and symlink rejection for skill/agent deletion,
  repository subdirectories and workspace import destinations. Import roots are
  restricted to home or `CLAWMAX_WORKSPACE_IMPORT_ROOTS`. The membership write
  failure fixture now simulates a write failure without forwarding arbitrary
  paths. Archive/path checks: 16; agent deletion: 7; skills: 65; skill routes: 38;
  workspace imports: 2; agent routes: 79. All passed; server TypeScript passed.
- `95b071a1`: model discovery requires operator-trusted origins, reconstructs
  the request origin from server configuration and rejects redirects. Policy
  failures return actionable 400 responses. Additional origins use
  `CLAWMAX_MODEL_ENDPOINT_ORIGINS` (comma-separated) or server base-URL settings;
  default local/on-prem model endpoints remain enabled. Model tests: 20; agent
  routes: 80; redirect HTTP assertions: 3. All passed; server TypeScript passed.
  The HTTP regression observed one authorized request and zero requests to the
  redirect destination, with only a disposable test credential.

Full integration/validation/coverage started on isolated ports 3007/5180,
expected 10–20 minutes (prior run about 10). Log:
`/private/tmp/clawmax-pr291-remediation-full.log`. Source CI:
https://github.com/Maximilien-ai/clawmax/actions/runs/40435091176.
These are focused remediation results, not a completed security audit. The
latest CodeQL findings gate, full-suite result, independent reviewer approval
and outstanding external/human acceptance must be checked before merging.
Existing RC94 images do not include these later source fixes.

Follow-up `50530a1f` uses HKDF with a process-random salt and provider/purpose
context for cache identities; these are ephemeral identities derived from API
key material, not password verifiers. [Node crypto reference](https://nodejs.org/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen).
All 21 model tests and server TypeScript passed. Its CodeQL findings gate passed
with no PR findings reported; all three analysis jobs also passed. No alerts
were dismissed and no scanner suppression was added.

The first full run completed 549/550, with integration workflows/chat passing.
The archive/path suite itself passed 16 assertions, but the harness still
required the old literal “8 tests passed.” Follow-up `aaea269e` checks the suite
exit status and reads the updated count. The 16 archive/path assertions and
shell syntax check pass. A complete rerun is required before final merge.
First-run coverage: statements/lines 82.88% (60951/73541), branches 80.72%
(19754/24472), functions 91.47% (2531/2767). Those coverage values do not turn a
failed overall run into a pass. Latest validation and merge status will be
recorded on [PR #291](https://github.com/Maximilien-ai/clawmax/pull/291).

Engineering checks: credential/profile isolation and scoped process cleanup
tests passed; affected plugin/setup/alignment suites passed. A real temporary
snapshot of `97b87abe` prepared dependencies and default plugins, passed
authenticated pinned-Gateway readiness, served UI HTTP 200 on localhost:5178
and `/api/system` on 3005, then stopped and restarted with the same root.
The restarted API reported `2.0.0-test-rc94-review.97b87abe` and the isolated
workspace. Logs: `/private/tmp/clawmax-local-dev-live.log` and
`/private/tmp/clawmax-local-dev-restart.log`. No provider-backed agent reply was
tested in this clean environment; Mike must validate that on his machine.
The complete suite was not rerun for this follow-up. Source CI:
https://github.com/Maximilien-ai/clawmax/actions/runs/40416082935 (pending when
recorded). These source changes do not alter the existing RC94 images.

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
