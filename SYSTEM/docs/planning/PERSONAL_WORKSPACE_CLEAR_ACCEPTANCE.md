# Personal workspace clearing — acceptance

Requested September 30, 2026. Status: pending implementation; not part of the
preceding green test result. Owner: Dashboard. Never exercise against a user's
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
