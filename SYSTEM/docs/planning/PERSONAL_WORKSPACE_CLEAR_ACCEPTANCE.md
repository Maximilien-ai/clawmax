# Personal workspace clearing — acceptance

Requested September 30, 2026. Status: source implementation with bounded safety
refusals; full/live acceptance pending. Not part of the preceding green test
result. Owner: Dashboard. Never exercise against a user's
real Personal workspace without separate explicit destructive-test approval.

## Product contract

Expose **Clear Personal workspace**, not Delete Personal. Preserve its immutable
workspace ID, name, path and registry entry, even when it is active or the only
workspace. The user must always retain one Personal workspace.

First confirmation shows the exact targeted workspace and affected content:
agents (including archived agents), workflows and schedules, run/chat history,
groups, communities, documents and other workspace-owned artifacts, skills,
templates and plugin-owned workspace data. Inventory must be authoritative and
workspace-scoped; unavailable inventory must not be presented as empty.

Second confirmation requires a typed phrase such as `CLEAR PERSONAL` and states
that deletion cannot be undone. Explain what remains: the Personal workspace
itself, other workspaces, globally installed skills/templates/plugins, instance
settings and shared credentials. Agent-local credentials/history belonging only
to removed agents are part of the impact; shared runtime state must be preserved.
Resolve ownership before offering deletion, rather than guessing from a path prefix.

## Engineering acceptance (automated)

- Both confirmations are required; cancel at either stage performs no mutation.
  Authorization, target identity and confirmation are checked server-side.
- Active/only Personal can be cleared. Its identity survives and it is usable
  afterward; a new agent can be created and can respond.
- Populate every supported content category, clear it, and verify absence from
  APIs, owned storage and runtime registrations after restart. Scheduled work
  cannot recreate removed content. Unaffected workspace bytes/settings remain
  unchanged, including duplicate agent IDs and shared resources.
- Reject unsafe roots, overlapping workspace paths, symlinks and ambiguous
  ownership. Never recursively remove a home directory, repository or workspace
  root; delete only validated owned content inside the retained workspace.
- Drain/fence active chat, workflow and scheduler writers before deletion; block
  concurrent creation/import. Revalidate changed inventories before committing.
- Double clicks/retries do not duplicate destructive work. Interrupted/partial
  failure remains visible with a persisted outcome and safe recovery; never show
  success when runtime registrations or scheduled tasks remain.
- Show bounded progress and actionable failures; disable repeated submission.
  Verify desktop/mobile scrolling, long names, keyboard focus and error states.

## User acceptance (isolated disposable instance)

- [ ] Impact wording clearly identifies what is removed and what stays.
- [ ] Two confirmations make irreversibility unmistakable; cancellation is clear.
- [ ] After confirmed clearing, Personal remains selectable and empty; another
  workspace is unaffected; a newly created agent can chat after restart.

These checks require human judgment or an external environment respectively.
Automated checks above remain engineering-owned, not additional reviewer tasks.

## Existing mismatch discovered during inspection

`WorkspaceManager.deleteWorkspace` removes only the registry entry; it does not
remove content. The switcher nevertheless says content is permanently deleted.
Do not call that handler to implement clearing or claim it provides cleanup.
Ordinary-workspace deletion semantics need a separate focused correction; this
request does not authorize changing other workspaces or deleting real user data.

## Implementation checkpoint — September 30 (Pacific)

- `d8c1145c`: preview-bound confirmation, retained Personal registry/root,
  native registration/schedule cleanup before file deletion, durable failure
  fencing and retry. Only conventional, exclusively owned runtime paths are
  supported; linked/custom/profile/shared agent storage refuses cleanup.
- `e39ef8b5`: switcher action and two-step dialog; typed `CLEAR PERSONAL`,
  cancellation, bounded errors, pending/success presentation and focus handling.
- `bc81b8e0`: preflight refuses removal of the entire configured runtime roster
  and possible shared-auth owners (`main` and configured auth-inheritance owner).
  OpenClaw 2026.9.5 `agents.delete` explicitly forbids deleting its sole agent.
  No keeper agent or credential relocation has been silently introduced.
- Focused verification passed: 10 filesystem/coordinator tests, mocked runtime
  and HTTP-admission tests, 10 existing workspace route tests, recovery admission
  and recovery-serving tests, TypeScript, lint and shell syntax.
- Disposable browser tests and screenshots passed at 1440px and 390px: cancel
  both steps, incorrect phrase refusal, exact confirmation payload, success,
  non-JSON failure, visible actions and final irreversible warning. Browser
  responses were mocked; this is not native gateway or provider acceptance.

Still open: shared credential owner handling, full integration/coverage, and
native clear/restart/new-agent chat
acceptance on an explicitly disposable instance. Until then do not describe the
feature as unrestricted or release-qualified. Active work must finish first;
other Dashboard operations pause during cleanup and pending recovery.

Browser test: run `node scripts/workspace-clear-browser.test.mjs` from
`SYSTEM/dashboard`; supply `CLAWMAX_TEST_PLAYWRIGHT_PATH` when Playwright is not
locally installed and optionally `CLAWMAX_TEST_CHROME_PATH` for an existing
Chrome executable. The test starts its own loopback fixture with mocked APIs.

## Runtime keeper checkpoint — October 1, 2026 (Pacific)

User approved a runtime-only keeper outside Personal, preserving shared
credentials. Implementation: `90b9adf5`.

- For explicit keyed OpenClaw rosters, confirmed clearing creates
  `clawmax-runtime-keeper` only when all configured agents are being removed.
  A revision-bound patch adds only that entry. No credential copying, changes
  to defaults/bindings, or unrelated-agent rewrites are performed.
- Its reserved workspace is under runtime state, outside every registered
  workspace. Heartbeat is set to `0m`, skills empty, and tools deny `*`.
  This is a retained runtime registration, not a Personal user agent; it is not
  a claim that administrators cannot explicitly invoke it through OpenClaw.
- Private ownership reservation plus exact registration/path checks prevent
  adopting name collisions. Ambiguous committed RPC results can be retried
  without creating another keeper. Linked, overlapping, modified, and legacy
  ownership configurations fail closed. Shared-auth owners still refuse cleanup.
- Passed: keeper safety/RPC patch tests, runtime cleanup/admission retry tests
  (including empty Personal agent listing), 10 coordinator safety tests,
  TypeScript, lint, shell syntax, and diff whitespace validation.
- Native schema validation attempted against pinned OpenClaw 2026.9.5 but could
  not start: cached `tsx` and `@openclaw/fs-safe` dependency files are missing.
  `--version` succeeding does not qualify this installation. Repair the pinned
  cache and rerun full integration/coverage plus disposable native acceptance.
  No real Personal data was cleared and no image was built.

Additional disposable acceptance: clear a Personal workspace whose non-auth-owner
agent is the entire runtime roster; verify the keeper remains outside Personal,
Personal lists zero agents, settings/credentials and a second workspace remain
unchanged, then restart and create/chat with a new Personal agent. Do not treat
mocked runtime tests as completion of this gate.
