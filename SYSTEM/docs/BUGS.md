# Known Bugs

## Old Agents - Missing Module Error

**Severity:** Medium
**Status:** Open
**Date Reported:** 2026-03-13

### Description
Legacy agents created before recent OpenClaw updates are responding with a "missing module" error when receiving chat messages. The agents report:

> "I encountered an error trying to check the status. It seems there's a missing module. Would you like me to assist with troubleshooting this issue?"

### Affected Agents
- All agents created before 2026-03-13
- Examples: max0, qa-engineer, release-engineer, product-owner, agent-manager, dave, hernan, todd, jim, jim0, alexy, test20, test0, saroop, clawmax-assistant, template-optimizer, organization-architect, workflow-debugger, agent0, allie

### Root Cause
The error appears to be related to a missing `tool-loop-detection-CaSQeaOT.js` module in OpenClaw's runtime. This is an internal OpenClaw issue, not a ClawMax dashboard issue.

When testing via CLI:
```bash
openclaw agent --to engineer --message "status?"
```

Response includes:
> "I'm unable to provide a detailed status report right now due to a missing module in the system. It appears there's an error related to a missing file: tool-loop-detection-CaSQeaOT.js, which is preventing session status checks."

### Workaround
Newly created agents work correctly. To fix an affected agent:
1. Remove the old agent directory from `AGENTS/`
2. Recreate the agent using template import via dashboard
3. The new agent will work properly with chat functionality

### Impact
- Old agents can still be messaged but respond with error
- New agents work correctly
- Dashboard chat functionality works for newly created agents
- Does not block demo or production use (just recreate affected agents)

### Next Steps
- Monitor if OpenClaw releases a fix for the missing module issue
- Consider bulk recreation of old agents from templates if needed
- Document agent recreation process for users

### Related
- OpenClaw gateway integration (agents.ts:1073, chat.ts:68)
- Agent registration in `~/.openclaw/openclaw.json`
