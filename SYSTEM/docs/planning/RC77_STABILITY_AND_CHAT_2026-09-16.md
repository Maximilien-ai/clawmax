# RC77 stability and chat — 2026-09-16

Status: full local release gate passed; public image build running. Combined build
dispatch waits for public success. Images are not yet validated for deployment.
MBP14 and test10 remain on RC76 pending RC77 image validation.

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
- A local watcher dispatches private `Private ClawMax Plugins Image` only after
  public success, with matching `base_tag` and `image_tag` `2.0.0-test-rc77`.
  Watcher log: `/tmp/clawmax-rc77-image-chain.log`. It depends on the local process
  remaining alive; if interrupted, inspect workflow history before redispatching.
- Private source at handoff: `ce2516d8a07ef96796ca138b748e6bd501672547`. Record
  the actual dispatched source, private workflow URL, both immutable digests,
  architecture results, and packaged version/plugin/runtime checks before calling
  the combined candidate ready. Neither RC75 nor RC76 was overwritten.

Observed previous image durations: public about 32 minutes; combined about
23 minutes. Private registry smoke now uses native architecture runners.

Validate MBP14 and test10 first: sign-in, chat close/reopen, downloads, gateway,
restart persistence, and unrelated workspace preservation. Only then expand to
remaining on-prem test clients, followed by cloud test clients. Do not promote
stable or upgrade non-test customer instances.

Operations capability/catalog and plan/apply/revision contracts remain incomplete.
Keep recurring Operations schedules disabled. Native chat clear/reset/archive-write
lifecycle remains incomplete. The unidentified guide-copy request is deferred.
