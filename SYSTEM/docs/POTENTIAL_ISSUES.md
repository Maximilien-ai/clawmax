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

