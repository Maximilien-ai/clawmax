# Potential Issues

> Captured from live demos and exploratory testing.
> These are not yet confirmed known issues. Promote to `KNOWN_ISSUES.md` or GitHub once repro is crisp.

## April 8, 2026

- **Agent detail panel opens unexpectedly on Agents page**
  Seen during investor demo. Agent details appeared without an intentional open action. Need exact repro path on grid/list/detail views and check whether selection/focus/click bubbling is opening the panel.

- **Workspace costs / budget may bleed across workspaces**
  Concern raised when opening multiple workspaces with overlapping agent/workflow ids. Need to verify:
  - metering is isolated by workspace id, not just agent id
  - budget state does not drift when switching between workspaces
  - dashboards do not reuse stale cost payloads from another workspace

- **Template apply can fail after delete + reapply in the same workspace**
  Seen after deleting a previously applied template/team and then applying again in the same workspace. Likely related to stale workflow/agent/group residue or incomplete conflict cleanup.

- **Multi-workflow apply still has intermittent same-workspace issues**
  Even after workflow conflict detection first pass, applying multiple templates/pipelines into the same workspace can still behave inconsistently. Need a crisp repro with:
  - workspace name
  - templates applied
  - whether failures are agent, workflow, group/community, or execution conflicts

- **Agent voice replies / TTS playback in chat are not production-ready**
  Deferred after experimentation because the playback fix caused instability in Chrome and was not reliable enough to keep live.
  Context from the attempted approach:
  - target behavior was to make Jarvis-style `speak your name` replies playable inline in the dashboard
  - the assistant currently emits local temp-file references like `MEDIA:/tmp/openclaw/...mp3` and "Listen here" links
  - attempted files were:
    - `SYSTEM/dashboard/client/src/components/AgentChatPanel.tsx`
    - `SYSTEM/dashboard/server/routes/chat.ts`
  - attempted fixes included:
    - serving `/tmp/openclaw` audio through a protected dashboard route
    - converting `MEDIA:/tmp/openclaw/...` and related audio links into inline `<audio>` players
    - hardening chat-history loading to avoid indefinite spinner states
  - observed issues:
    - Chrome chat panel instability / hangs
    - playback still inconsistent across browsers
  Resume later from this design direction, but keep the current system on the simpler non-inline-link behavior until the media path is made robust.
