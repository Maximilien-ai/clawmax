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

---

## Schema Validation Errors in Dashboard

**Severity:** Low
**Status:** Open
**Date Reported:** 2026-03-14

### Description
Dashboard server logs show schema validation errors when loading agents. The validator is looking for schema files in the wrong location:

```
Failed to load schema agents: Error: ENOENT: no such file or directory,
open '/Users/maximilien/github/Maximilien-ai/clawmax-private/WORKSPACES/default/SYSTEM/schemas/agents.schema.json'
```

### Root Cause
The validator in `server/lib/validator.ts:21` is looking for schemas in `WORKSPACES/default/SYSTEM/schemas/` but they should be in `SYSTEM/schemas/` at the repo root.

### Impact
- Dashboard still functions correctly
- Schema validation is skipped (no validation warnings shown)
- Console logs are cluttered with errors
- Non-blocking for production use

### Fix Required
Update `validator.ts` to resolve schema paths from repo root SYSTEM directory instead of workspace SYSTEM directory.

---

## Test Message Accumulation in general.json

**Severity:** Low
**Status:** Open
**Date Reported:** 2026-03-14

### Description
Test suite writes messages to `WORKSPACES/default/SYSTEM/messages/groups/general.json` but doesn't clean them up after test completion.

### Impact
- Test messages accumulate in general.json
- Requires manual cleanup between test runs
- Not blocking, just annoying

### Fix Required
Add cleanup step to test suite to reset message files to empty arrays after tests complete.

---

## TODO: Test Public Repo Fresh Install

**Priority:** High
**Status:** TODO
**Date:** 2026-03-15 (Tomorrow)

### Task
Test the public clawmax repository on a fresh machine or new user account to replicate new user experience:

1. Clone public repo: `git clone https://github.com/Maximilien-ai/clawmax.git`
2. Run `setup.sh` from scratch
3. Verify all prerequisites are checked correctly
4. Test API key configuration
5. Test dashboard startup
6. Test template application
7. Test agent creation
8. Test workflows
9. Document any issues encountered
10. Fix any gaps in setup process or documentation

### Why This Matters
- Screens issues that only appear on fresh installations
- Validates setup.sh works correctly for new users
- Ensures documentation is accurate
- Catches hardcoded paths or missing dependencies
