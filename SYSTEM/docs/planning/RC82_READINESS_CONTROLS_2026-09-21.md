# RC82 stability diagnostics checkpoint

Status: source implementation and focused verification; no RC82 image cut and
no installed instance rollout. Published RC81 is unchanged.

## Included scope

- Agent warning triangle, separate from online/idle status, in cards, list rows
  and chat. Tap/click exposes a specific explanation and repair action.
- Browser-local credentials missing or requiring validation, missing effective
  model, unavailable execution path, gateway not ready, and failed readiness
  checks are distinct states. Existing usable inherited models/shared keys and
  independent CLI authentication must not produce false missing-key warnings.
- BYOK shows Needs attention for model/credential issues and failed checks;
  credential actions select the affected provider. Browser profile/address
  isolation is explained without claiming that a key was deleted.
- Checks use the existing chat-readiness endpoint, explicit workspace and agent
  generation, bounded parallelism, cancellation on workspace changes, and
  refresh on vault/configuration changes and once per minute. These are
  configuration/readiness checks, not continuous paid model validation.
- System has Logs and OpenClaw Plugins sub-tabs. Installed runtime inventory
  is distinct from ClawMax dashboard plugins. There is no installation path.
- Enable/disable uses the selected OpenClaw CLI and profile, confirms
  instance-wide/restart impact, serializes changes, and records pending/saved/
  failed outcomes. Saved configuration is not a claim of live plugin activation.
  The latest 100 change records persist under the OpenClaw state directory.
- Enterprise workspace sessions are read-only because workspace identity does
  not prove instance-wide administration authority. Dashboard authentication
  protects both inventory and changes. Raw CLI error output and credentials
  are not returned or persisted in the change log.

## Verification

- TypeScript no-emit checks passed.
- New agent-readiness presentation tests passed.
- New OpenClaw plugin control and route tests passed: inventory filtering,
  invalid/unknown targets, confirmation, no-op, concurrent changes, failures,
  persisted history, read-only enterprise sessions and cross-origin rejection.
- Existing BYOK helper suite: 29 passed.
- Existing chat-route edge suite: 20 passed, rerun with an isolated
  `CLAWMAX_TEST_WORKSPACE`. Initial unscoped invocation attempted transcript
  writes to the installed native workspace; the sandbox denied them. The
  isolated rerun passed without that storage warning.
- Existing partner-setup clarity suite: 12 passed. Sidebar suite: 15 passed.
- Focused ESLint passed.
- `npm run build` passed (server TypeScript and production Vite bundle).
  Existing non-blocking warnings remain for stale Browserslist data, package
  module typing and large client bundles; they are not new release blockers.
- Isolated Chrome desktop/mobile checks passed using synthetic API responses:
  warning disclosure, provider targeting, warning clearing, failed readiness,
  gateway warning, confirmation before plugin mutation, visible saved history,
  inventory error/empty states, light/dark styling and mobile horizontal overflow.
- Screenshots inspected at desktop and 390×844 mobile; BYOK Save & Close remains
  visible while content scrolls. No real provider key or plugin toggle was used.

## Repeating browser checks

Start only Vite (not a Dashboard backend) on `127.0.0.1:5186`. Install Playwright
in an isolated tooling directory and make it available through `NODE_PATH`.
From `SYSTEM/dashboard` run:

```sh
CLAWMAX_CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/test-runtime-readiness-browser.cjs
```

`CLAWMAX_UI_TEST_URL` optionally selects another frontend-only Vite origin.
All `/api/` traffic is mocked. The runner creates/removes its own temporary
client fixture and prints a local screenshot directory. Do not point it at an
installed instance. Non-macOS runs can use Playwright's installed Chromium.

## Still required before release

- Full integration, validation and coverage, plus green CI.
- Gateway reload race and CLI stream/deployment timeout acceptance from the
  [MBP14 recovery handoff](RC81_MBP14_RECOVERY_2026-09-21.md).
- Real upgraded MBP14 and test10: chat, groups, templates, workflow completion,
  results/cancellation, restart persistence and credential/profile behavior.
- Real isolated-runtime plugin toggle/restart persistence and policy checks;
  mocked UI/service tests alone do not establish installed execution readiness.
- Keep schedules disabled, preserve unrelated resources, and do not distribute
  based only on health or source CI. The RC81 MBP14 startup overlay is not part
  of the published RC81 image.

## Native runtime checkpoint — September 21, evening PDT

Candidate source: `ab390e01`. The bounded chat admission recovery retries only
the explicit pre-dispatch `Gateway request entry is closed` rejection, once,
after readiness and current authority checks. Partial output, persisted replies,
timeouts and ambiguous disconnections are not replayed. Focused recovery,
gateway RPC, chat-route tests and TypeScript passed before that commit.

The isolated native acceptance runner reported all assertions passed using
OpenClaw 2026.9.5 and `ollama/qwen2.5:latest`:

- Template staging, replay, journal recovery, two-agent rollback, stale-revision
  rejection and lost-response cleanup recovery.
- Non-mutating cleanup plans, exact revision cleanup after catalog deletion,
  repeated cleanup and preservation of unrelated registrations.
- Nonempty native chat and durable reply replay.
- PKCE-authenticated public CLI router chat, correlated events and rejection of
  reused codes, invalid sessions, wrong workspace and wrong actor.
- Two-agent Group communication: four edge-directed turns, exact reply handoffs,
  turn-limit termination and durable replay.

The runner exited and its log contains no cleanup or host-registry assertion
failure. It uses disposable state and stops only its own gateway process group.
This is not installed-CLI stream acceptance, full workflow execution, a
process-crash test, or acceptance of an upgraded MBP14/test10 image.

Reproduce from `SYSTEM/dashboard` with a prepared 2026.9.5 executable:

```sh
npx ts-node scripts/test-template-isolated-gateway.ts /absolute/path/to/openclaw --local-model ollama/qwen2.5:latest
```

The local-model harness has a seven-minute bound. CI normally takes about
27 minutes; at this checkpoint it is still running:

- [Source CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35685673635)
- [Code scanning](https://github.com/Maximilien-ai/clawmax/actions/runs/35685674046)

The existing full-suite wrapper can restart the host gateway and touches a
HOME-based workspace registry. Setting only `OPENCLAW_STATE_DIR` does not isolate
that registry. Run the remaining complete integration/validation/coverage gate
in an isolated environment; do not restart MBP14 merely to run source tests.

CLI action remains necessary: the inspected CLI main still uses a 15-second
HTTP client for `StreamChat`, despite the chat command's longer context. See the
[CLI handoff](RC81_MBP14_RECOVERY_2026-09-21.md#cli-handoff--remaining-gates).
No RC82 image has been dispatched and no tester rollout is approved.
