# Dashboard TODO

## Skills Import - Workspace Copy Feature

**Status:** Deferred - requires more investigation

**Requirement:** When a skill is assigned to an agent, copy the skill files to the agent's workspace directory.

**Current Behavior:**
- Skills imported to `WORKSPACES/{workspace}/SKILLS/custom/{skill-name}/`
- Agent config references skill by name in `skills` array
- OpenClaw loads skills from central location

**Desired Behavior:**
- When skill assigned to agent, copy to `WORKSPACES/{workspace}/AGENTS/{agent-name}/SKILLS/{skill-name}/`
- This allows agent-specific skill customization
- Similar to how TOOLS.md works per-agent

**Investigation Needed:**
1. Where does OpenClaw load agent skills from?
2. Is there an agent-skill assignment API endpoint?
3. Does OpenClaw support per-agent skill directories?
4. Review `src/agents/skills-*.ts` files in OpenClaw source

**Implementation Plan:**
1. Research OpenClaw agent workspace structure
2. Find/create agent-skill assignment function
3. Add copy logic to assignment function
4. Add tests for copy functionality
5. Update dashboard UI to show which skills are in agent workspace

**Related Files:**
- `/Users/maximilien/github/maximilien/openclaw/src/agents/skills-*.ts`
- `SYSTEM/dashboard/server/lib/skills.ts`
- `SYSTEM/dashboard/server/routes/agents.ts`

---

## Completed
- ✅ Auto-rename skill.md → SKILL.md on import (March 16, 2026)
- ✅ Add tests for auto-rename (March 16, 2026)
