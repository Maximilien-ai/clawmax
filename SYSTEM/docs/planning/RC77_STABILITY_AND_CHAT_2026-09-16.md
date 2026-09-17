# RC77 stability and chat — 2026-09-16

Status (2026-09-17): public and combined image CI passed. MBP14 and test10 are
running pinned RC77 and passed startup/restart checks. Wider rollout is held:
installed CLI RC3 rejects HTTP loopback discovery, and live chat/export acceptance
is still pending. Image-build success is not full deployment acceptance.

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
- Live close/reopen, Markdown download, agent ZIP export, skill-assignment feedback,
  and visual checks on the deployed canaries remain pending. Earlier synthetic
  browser checks above do not substitute for these live acceptance checks.

### CLI handoff: loopback discovery blocks on-prem acceptance

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
was still running at handoff. This is not yet an installed-release fix: publish
and install the next signed CLI test package, explicitly re-register MBP14's
obsolete issuer binding, then prove live PKCE login. Installed RC3 and existing
profiles were left unchanged.

Observed previous image durations: public about 32 minutes; combined about
23 minutes. Private registry smoke now uses native architecture runners.

Validate MBP14 and test10 first: sign-in, chat close/reopen, downloads, gateway,
restart persistence, and unrelated workspace preservation. Only then expand to
remaining on-prem test clients, followed by cloud test clients. Do not promote
stable or upgrade non-test customer instances.

Operations capability/catalog and plan/apply/revision contracts remain incomplete.
Keep recurring Operations schedules disabled. Native chat clear/reset/archive-write
lifecycle remains incomplete. The unidentified guide-copy request is deferred.
