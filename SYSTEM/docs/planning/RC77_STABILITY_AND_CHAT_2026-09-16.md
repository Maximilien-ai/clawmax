# RC77 stability and chat — 2026-09-16

Status: source changes committed and pushed; final release gate running. Images
are not yet published. MBP14 and test10 remain on RC76 pending RC77 validation.

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
  execution. It is not release evidence. The final full gate must finish before
  image dispatch.

Local evidence:

- `/tmp/clawmax-rc77-final-release-gate.log`
- `/tmp/clawmax-rc77-client-build.log`
- `/tmp/clawmax-rc76-client-types.log`, `/tmp/clawmax-rc77-client-types.log`
- `/tmp/clawmax-rc77-skills-success-390.png`, `/tmp/clawmax-rc77-skills-error-390.png`
- `/tmp/clawmax-rc77-chat-1440-light.png`, `/tmp/clawmax-rc77-chat-390-light.png`,
  `/tmp/clawmax-rc77-chat-390-dark.png`, `/tmp/clawmax-rc77-chat-empty-390.png`

## Publication and rollout gate

Publish `v2.0.0-test-rc77` from the candidate commit without overwriting RC76.
Dispatch public `Test Container Image` first, then private
`Private ClawMax Plugins Image` with matching `base_tag` and `image_tag`
`2.0.0-test-rc77`. Record both workflow links, source SHAs, immutable digests,
architecture results, and packaged version/plugin/runtime checks.

Observed previous image durations: public about 32 minutes; combined about
23 minutes. Private registry smoke now uses native architecture runners.

Validate MBP14 and test10 first: sign-in, chat close/reopen, downloads, gateway,
restart persistence, and unrelated workspace preservation. Only then expand to
remaining on-prem test clients, followed by cloud test clients. Do not promote
stable or upgrade non-test customer instances.

Operations capability/catalog and plan/apply/revision contracts remain incomplete.
Keep recurring Operations schedules disabled. Native chat clear/reset/archive-write
lifecycle remains incomplete. The unidentified guide-copy request is deferred.
