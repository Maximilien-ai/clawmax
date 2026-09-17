# RC77 stability and chat — 2026-09-16

Status (2026-09-17): public and combined image CI passed. MBP14 and test10 are
running pinned RC77 and passed startup/restart checks. CLI RC4 is installed and
authenticated on both canaries; the loopback-login blocker is resolved. Both
canaries passed live existing-history/export checks, and test10 passed live
skill-assignment feedback/persistence with exact fixture cleanup. A new cloud
model-response check remains unproven because the isolated browser has no
configured AI execution path. Wider rollout remains held pending that check.
Operations deployment remains
excluded from this stability candidate, not a stability-release prerequisite.

## Candidate boundary

- Public code candidate: `67124470b8430a1335bb96b62248573effcfea78`.
- Direct-loopback HTTP CLI discovery: `27449b03`.
- Skill assignment success/error feedback: `e6a4d30b`; responsive, accessible
  notifications: `8ee82263`; test typing correction: `67124470`.
- Chat contrast in light mode: `5c9f29bc`.
- Local Markdown conversation download: `25bf89c8`; download icon: `029bf9d2`.
- Includes RC76 ZIP export, native history reading, and container process reaping.
- The download contains the currently loaded conversation, preserves Markdown,
  includes speaker/timestamps, and redacts common credential patterns. It is
  explicitly initiated by the user and stays local; no partner delivery or
  transcript telemetry was added. Redaction is best-effort, not a safe-sharing
  guarantee. Empty/loading/streaming conversations cannot be downloaded.
- GTM's display name was separately corrected in MBP14's persisted identity;
  its immutable `gtm-agent` ID and conversation history were not renamed.

## Engineering evidence

- Server TypeScript passes. Production Vite frontend build passes (existing
  large-chunk warning remains).
- Final `SYSTEM/test-with-server.sh integration --with-validation --coverage`:
  exit 0, 484 passed, 0 failed, including disposable-workspace cleanup.
  Coverage: statements/lines 82.61%, branches 72.14%, functions 92.00%.
- Focused CLI API tests: 16 passed. Assignment helper tests: 7 passed plus edge
  cases. Markdown export tests: 7 passed. Chat Markdown and icon tests passed.
- Isolated Chrome checks at 1440px and 390px: assignment success, persisted count
  after reload, failed save without false success, and notification fit passed.
- Chat checks at both widths and in both themes: computed white user text on
  `rgb(3, 105, 161)` bubbles, Markdown file download/content, failed-download
  feedback, and disabled empty download passed. Screenshots visually inspected.
- Browser tests used synthetic data and blocked unrelated writes; no real agent
  assignments or conversation contents were used for these checks.
- Local source dashboard restarted with ignored `.env` set to
  `CLAWMAX_VERSION=2.0.0-test-rc77`; `/api/system` and visible version verified.
- Whole-client TypeScript **does not pass**: 291 diagnostics in both RC76 source
  `e0aea6fd` and RC77, with no semantic additions after ignoring source line
  offsets and union-member ordering. This baseline remains engineering debt,
  not a claim of a clean client typecheck.
- An earlier release run was invalidated by changing the test script during
  execution. It is not release evidence; the replacement gate above passed.

Local evidence:

- `/tmp/clawmax-rc77-final-release-gate.log`
- `/tmp/clawmax-rc77-client-build.log`
- `/tmp/clawmax-rc76-client-types.log`, `/tmp/clawmax-rc77-client-types.log`
- `/tmp/clawmax-rc77-skills-success-390.png`, `/tmp/clawmax-rc77-skills-error-390.png`
- `/tmp/clawmax-rc77-chat-1440-light.png`, `/tmp/clawmax-rc77-chat-390-light.png`,
  `/tmp/clawmax-rc77-chat-390-dark.png`, `/tmp/clawmax-rc77-chat-empty-390.png`

## Publication and rollout gate

- [RC77 prerelease](https://github.com/Maximilien-ai/clawmax/releases/tag/v2.0.0-test-rc77)
  created from the exact candidate SHA above; remote tag target verified.
- [Public image CI](https://github.com/Maximilien-ai/clawmax/actions/runs/35155042434)
  started 2026-09-16 21:55:57 UTC. Inputs:
  `source_ref=refs/tags/v2.0.0-test-rc77`, `test_tag=rc77`.
- Public CI passed both architecture builds, registry smoke, and both architecture
  lifecycle acceptance jobs. Published public index:
  `ghcr.io/maximilien-ai/clawmax-dashboard@sha256:476de8b4b0c241e36d8f11767b993c05b644737320232486d19fc52caa8c8fe0`.
- [Combined image CI](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/35158723609)
  was dispatched after public success with matching `base_tag` and `image_tag`
  `2.0.0-test-rc77`, at private source
  `ce2516d8a07ef96796ca138b748e6bd501672547`. Validation, runtime acceptance,
  build, and native amd64/arm64 registry smoke all passed.
- Published combined index, used by both canaries:
  `ghcr.io/maximilien-ai/clawmax-plugins@sha256:1db1e5aeb4000f92601c0ac6e998635bd4d99f086a4a35d3d4f46fa295923477`.
  Registry architecture pins: amd64
  `sha256:c0e19f1b42997da7f29c20c88f3abf697051f5e47a743f17a5fa29c4918902c4`;
  arm64 `sha256:355a1a2130fe643a2555b445acacf68ac17573ddbd0c128d50e7f9b770b543b2`.
  Neither RC75 nor RC76 was overwritten.

## Canary checks — 2026-09-17

- MBP14 (`onp-mbp14-mojahds1`, container `clawmax-dashboard-240e10`): installed
  CLI `2.0.0-test-rc3` worker action `mbp14-rc77-canary-20260917` completed.
  After an additional controlled restart, health reports ready with 14 agents,
  83 templates, 4 groups, and 5 workflows, matching the previous baseline.
  Public discovery reports RC77 and issuer `http://127.0.0.1:3201`.
  Read-only gateway probe reports running on port 18789.
- test10 (`cld-test10-molljk0d`): pinned Kubernetes image update and a subsequent
  controlled restart both rolled out successfully. Authenticated CLI discovery
  reports RC77. Gateway probe reports running on port 18789. Temporary 404/502
  responses occurred during replacement; settled API checks succeeded.
- Cloud agents/workflows counts after restart match the pre-upgrade baseline:
  `default` 13/9, `demo` 9/9, `biopharma-hack` 5/4, `clawcamp` 13/8,
  `maximilien-ai-operations` 0/0, `maximilien-ai-operations-0-1-0` 5/4.
  All four workflows in the populated Operations workspace report `disabled`.
  The CLI list omits schedule fields; absent fields are not evidence of disabled
  schedules. No schedules were enabled by this work.
- Cloud PVC UID remains `8025e55b-12fb-451c-a6ba-238235bb5c45`.
- RC76 rollback index retained:
  `ghcr.io/maximilien-ai/clawmax-plugins@sha256:f1cd72a8e8932ed057a555c8e1716ecfa70111967e23400762c9840b67587304`.
  No image pruning or wider rollout was performed.
- MBP14 live isolated-Chrome checks passed at 1440px and 390px: uppercase GTM
  card/chat header; 12 rendered Markdown message blocks preserved exactly across
  close/reopen; Markdown download (7,750 bytes); user text white on
  `rgb(3, 105, 161)` bubbles. Mobile download control fits the viewport.
  Agent ZIP export downloaded successfully (24,742 bytes, 33 central-directory
  entries, ZIP header/end-record verified). No new messages, skill assignments,
  resets, or deletes were performed. Download contents were not printed.
- The first close/reopen comparison ran before reopened history had loaded;
  waiting for panel teardown and download readiness resolved the harness race.
  This was not a reproduced product history-loss defect.
- test10 live browser login was completed directly by the user in isolated
  Chrome. No credentials/cookies were copied from another browser. Existing
  `gtm-agent` history contained seven rendered Markdown blocks, all preserved
  exactly across close/reopen. Markdown download passed (2,111 bytes), and agent
  ZIP download passed (22,242 bytes, 33 central-directory entries, ZIP header/end
  record verified). No conversation contents were printed during these checks.
- With explicit user approval, created disposable test10 agent
  `rc77-skill-toast-20260917` in `default` through the creation wizard, with
  `openai/gpt-5.4`, tag `rc77-acceptance`, no AI generation, and no external
  channels/groups/workflows. Assigned built-in `summarize` through Skills.
  Exact success toast appeared; the assigned badge/count persisted after reload
  and explicit re-entry into that agent's Skills view. Removal and re-add notices
  also passed at 390px. The settled removal toast fit at x=16, width=358;
  screenshot `/tmp/rc77-live-skill-toast-mobile.png` was visually inspected.
- Cleaned up only that exact fixture through the typed-ID delete confirmation.
  UI returned to 13 active agents and zero matches for the fixture; its temporary
  assignment and workspace were removed. No existing agent was modified.
- New cloud chat sends remain disabled with the explicit no-AI-execution-path
  message in this isolated browser. Existing history/export passes do not prove
  a new model response. Do not transfer provider credentials or bypass this gate;
  configure BYOK interactively or obtain acceptance in an already configured
  browser. MBP14's creation wizard likewise reported no available models; no
  on-prem fixture was created.
- Usability follow-up: a full Skills-page reload lost the agent selection and
  selected `agent0`. No mutation was performed on that default agent; re-entry
  through the fixture's agent menu proved its assignment was retained. Selection
  persistence and assignment persistence are distinct claims.

### CLI handoff: loopback discovery blocker resolved by installed RC4

Completion evidence from CLI commit `f2fa389`, independently checked locally:

- Installed `/usr/local/bin/clawmax` and installed Skill `VERSION` both report
  `2.0.0-test-rc4`.
- MBP14 CLI status reports Dashboard RC77, URL and issuer
  `http://127.0.0.1:3201`. Supported `whoami` returns authenticated owner identity;
  authenticated workspace listing returns four workspaces.
- test10 supported `whoami` returns authenticated owner identity over its
  unchanged HTTPS profile.
- CLI records successful browser PKCE, explicit supported replacement of the
  obsolete MBP14 issuer binding, and post-install resource preservation.
- [Published RC4](https://github.com/Maximilien-ai/clawmax-cli-releases/releases/tag/v2.0.0-test-rc4),
  signed/notarized PKG SHA-256:
  `3d8b5a1e47e3c1757880b1dc97019fd8b533de6cbe0c8b687ac7968d98cefadf`.
  Signing/publication evidence is owned by the linked CLI handoff; this
  Dashboard follow-up independently checked installed identity/authentication,
  not every packaging check.
- Optional Desktop-shortcut installation was denied by macOS; installation
  succeeded with that component disabled. CLI owns the follow-up. Do not claim
  the default all-components installer path passed or replace published bytes.
- No Dashboard image/cloud-worker rollout or schedule activation was performed
  for this authentication verification. Stable Homebrew remains unchanged per
  CLI's release evidence.

The following records preserve the original failure and handoff chronology;
references to installed RC3 or unpublished RC4 below are historical.

Installed RC3 `instance status --instance mbp14 --json` and
`instance login --instance mbp14 --json` both fail with:
`validate discovery response: issuer must be an absolute HTTPS URL without credentials, query, or fragment`.

The Dashboard now correctly advertises direct-loopback HTTP, but CLI
`src/pkg/instanceclient/client.go` calls `validateHTTPSURL` for issuer,
authorization, token, and revocation endpoints. Coordinate a released CLI fix
allowing HTTP only for explicitly registered loopback instances, with appropriate
origin matching. Preserve HTTPS requirements for remote instances. Test localhost,
127.0.0.1, IPv6 loopback, all four discovery URLs, and rejection of remote HTTP,
credentials, query/fragment, and cross-origin endpoints. Prove browser PKCE login
against MBP14 RC77 and unchanged HTTPS login against test10. No token extraction,
private API fallback, or local credential-store edits were used to bypass failure.

CLI source fix pushed as `7a2d72ca0df3891774c20cbe9e3923c8a622904a`:
HTTP auth requires client-held configured-loopback-origin evidence, and all four
auth URLs must match. Browser launch accepts validated literal-loopback HTTP;
remote HTTPS requirements and issuer pinning remain intact. Focused tests,
`go vet`, race tests for instanceclient/instanceauth/instanceprofile, and full
unit coverage passed (1,082 tests; statement/line coverage 74.04% to 74.06%,
function coverage 94.03% unchanged). [CLI CI](https://github.com/Maximilien-ai/clawmax-cli/actions/runs/35225713693)
passed. This is not yet an installed-release fix: publish
and install the next signed CLI test package, explicitly re-register MBP14's
obsolete issuer binding, then prove live PKCE login. Installed RC3 and existing
profiles were left unchanged.

CLI packaging/install ownership was handed back to the CLI team at the user's
request. Version-preparation commit `edfef3299b4aa58da115fdf3aed92ed22d071462`
sets CLI RC4; [its CI](https://github.com/Maximilien-ai/clawmax-cli/actions/runs/35226362042)
passed. Local lint/build, 7 stack tests, 14 integration tests, and 1,082 unit
tests passed (74.07% statement/line coverage, 94.03% functions). The integration
lane finished and restored the installed agent; MBP14 recovered on RC77 with
unchanged store counts. No further VM/lifecycle operations are planned while
other persistence checks are coordinated. Preserve any RC75 evidence as
historical; current MBP14 is RC77.

[CLI handoff](https://github.com/Maximilien-ai/clawmax-cli/blob/main/docs/operations/RC4_LOOPBACK_HANDOFF_2026-09-17.md)
was pushed in `3e473b6`. RC4 has not been tagged, published, or installed by this
work. Stable Homebrew and other instances remain untouched.

Observed previous image durations: public about 32 minutes; combined about
23 minutes. Private registry smoke now uses native architecture runners.

Validate MBP14 and test10 first: sign-in, chat close/reopen, downloads, gateway,
restart persistence, and unrelated workspace preservation. Only then expand to
remaining on-prem test clients, followed by cloud test clients. Do not promote
stable or upgrade non-test customer instances.

Operations capability/catalog and plan/apply/revision contracts remain incomplete.
Keep recurring Operations schedules disabled. Native chat clear/reset/archive-write
lifecycle remains incomplete. The user confirmed the guide-copy request is fixed.

### Post-RC77 follow-up: viewport-safe BYOK dialog

User screenshot feedback on September 17 showed Save at the bottom of the long
BYOK form. Source fix `d41d3a88` reuses `MobileSafeDialog`: fixed header/footer,
independently scrolling settings, wrapping actions, dynamic viewport height, and
mobile safe-area padding. The dialog is portaled to the document body to escape
header containing blocks/clipping; the nested plugin confirmation retains its
higher stacking order. Existing provider selection and save behavior are retained.
Partners and Runtime use the same action footer. No new tabs were necessary to
keep Save accessible.

Engineering validation:

- Server TypeScript and production Vite build passed; existing chunk-size warning
  remains. Client TypeScript still reports 291 baseline diagnostics, with no new
  normalized diagnostics against the RC77 baseline.
- BYOK helpers: 27 passed; shared dialog: 8 assertions; dialog audit: 8 assertions.
- Reproducible isolated-browser test: `SYSTEM/dashboard/scripts/test-byok-dialog.cjs`.
  Supply `PLAYWRIGHT_MODULE` and `CHROME_PATH` if using an existing external
  Playwright/Chrome installation; defaults to frontend `http://127.0.0.1:5176`.
  All API calls are fulfilled with synthetic responses and only a fake key is
  used. No live instance configuration or provider credentials are accessed.
- 1440×900, 1280×600, 390×844, and 320×568 passed: Save visible/clickable without
  zoom changes, invariant footer position while scrolling, validation-in-progress
  disabled state, validation-error recovery, save/reload persistence, and
  Partners/Runtime footer bounds. Desktop/mobile light/dark screenshots inspected.

This is a source follow-up for the next image, not a change to the immutable RC77
images already installed on MBP14/test10. It does not close the outstanding fresh
cloud model-response acceptance check or authorize wider rollout.

### Post-RC77 follow-up: cloud versus on-prem execution options

Source fix: `494eddab`. Cloud BYOK now explains that it cannot access models or CLI tools on the user's
computer. Ollama stays hidden; OpenAI-compatible services are labeled
cloud-reachable and no longer receive a localhost default. Machine-local endpoint
values are rejected on validation/save. Hosted providers and remote-compatible
services remain available; endpoint reachability still requires Check Connection.

Cloud no longer advertises Claude Code/Droid agent runtimes merely because an
executable is present in the image. Its runtime catalog is empty, enablement is
rejected, and direct agent-runtime CLI execution is guarded. OpenClaw remains the
cloud execution engine. This does not remove unrelated server-side CLI tools.
On-prem keeps its local model defaults and agent CLI choices. Agent creation and
editing explain the relevant deployment's execution options.

Stale browser-local model/CLI settings do not establish cloud readiness, and
stale machine-local compatible endpoints cannot mask otherwise valid hosted
credentials. No existing agent files are rewritten. Only the model wizard can
auto-open for missing credentials, avoiding stacked dialogs on empty cloud setup.

Validation: root lint/server TypeScript and production build passed. Focused suites
passed: BYOK 29, integrations routes 14, deployment environment 31, model discovery
12, integration validation 23, agent runtime 91, and execution environment 22.
Full client TypeScript has 290 existing diagnostics versus the 291 baseline, with
no new diagnostics (the touched key-availability helper now accepts null config).
No full release/integration gate was rerun for this source-only follow-up.

The synthetic browser script supports `BYOK_TEST_DEPLOYMENT_KIND=cloud` or
`onprem`. Both passed at 1440×900, 1280×600, 390×844, and 320×568: available/hidden
controls, local endpoint rejection, remote endpoint saving, browser-key save/reload, validation error
and progress, fixed Save bounds, Runtime/Partners, and agent creation/edit copy.
Desktop/mobile screenshots were inspected; BYOK was checked in light/dark mode.
No real keys, agents, schedules, VM lifecycle, or live instance configuration were
changed. This still requires a new image and canary acceptance; immutable RC77
images are unchanged.
