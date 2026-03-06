# OpenClaw Changes for ClawMax Dashboard

This document tracks all changes made to the OpenClaw CLI to support ClawMax Dashboard features.

## Previous Changes (Already in Local Fork)

The following changes were made previously to support ClawMax Dashboard development:

### Skills Integration
- `7a44c1936` - feat(skills): add Apple Notes and Reminders skills via memo CLI
- `10340d2a3` - feat(skills): add bear-notes skill using grizzly CLI

### Provider Enhancements
- `c640b5f86` - feat: add NVIDIA API provider integration
- `333832c2e` - fix: bypass Anthropic OAuth token blocking for tool names

### CLI Improvements
- `777fb6b7b` - CLI: add clawdbot update command and --update flag

### Bug Fixes
- `a656dcc19` - fix(telegram): truncate commands to 100 to avoid BOT_COMMANDS_TOO_MUCH
- `a67752e6b` - fix(discord): use partial mock for @buape/carbon in slash test

## Current Changes (Workflow Execution)

### Purpose

These changes add workflow execution capabilities to OpenClaw, enabling:
- Scheduled/manual workflow execution
- Multi-agent task coordination
- Execution tracking and status updates
- Integration with ClawMax Dashboard's workflow management UI

## Files Added

### `src/cli/workflow-cli.ts`
New CLI command module that implements `openclaw workflow run <workflowId>`.

**Functionality:**
- Reads workflow definitions from `~/.openclaw/workspace/WORKFLOWS/{id}.md`
- Loads execution records from `WORKFLOWS/executions/{workflowId}/{executionId}.json`
- For each participating agent:
  - Retrieves agent gateway configuration from `openclaw.json`
  - Opens WebSocket connection to agent's gateway
  - Sends workflow content via `chat.send` RPC method
  - Updates participant status (pending → running → completed/failed)
  - Captures execution results and errors
- Updates execution record with completion status and logs
- Returns exit code 0 on success, 1 on failure

**Dependencies Added:**
- `gray-matter` - YAML frontmatter parsing for workflow files
- `ws` - WebSocket client for agent gateway communication
- `@types/ws` (dev) - TypeScript definitions for ws

**Key Functions:**
- `loadWorkflow()` - Parse workflow markdown file with YAML frontmatter
- `loadExecution()` / `saveExecution()` - Manage execution state files
- `getAgentConfig()` - Read agent gateway port and auth token
- `sendWorkflowToAgent()` - Execute workflow on single agent via WebSocket
- `runWorkflow()` - Main orchestration logic for multi-agent execution

## Files Modified

### `src/cli/program/register.subclis.ts`
Registered the new `workflow` command in the CLI command registry.

**Changes:**
- Added workflow entry to `entries` array (line 235-243)
- Configured as subcommand with description "Manage and execute workflows"
- Lazy-loaded via dynamic import of `workflow-cli.js`

## Dependencies

### Production Dependencies
```json
{
  "gray-matter": "^4.0.3",
  "ws": "latest"
}
```

### Dev Dependencies
```json
{
  "@types/ws": "latest"
}
```

## Integration with Dashboard

The ClawMax Dashboard server (`server/lib/workflows.ts`) spawns the CLI command when a workflow is manually triggered:

```typescript
spawn('openclaw', ['workflow', 'run', workflowId], {
  detached: true,
  stdio: 'ignore'
})
```

The CLI updates the execution JSON files in realtime, which the dashboard reads via polling to show live progress.

## Workflow File Format

Workflows are stored as Markdown files with YAML frontmatter:

```markdown
---
id: daily-standup
name: Daily Standup
description: Morning sync for engineering team
schedule: "0 9 * * 1-5"
enabled: true
targeting:
  communities:
    - Engineering
  groups:
    - Backend
  tags:
    - oncall
  agents: []
executionMode: automated
---

# Daily Standup Workflow

## Objectives
- Review yesterday's work
- Plan today's priorities
- Identify blockers

## Tasks
1. Check completed PRs from yesterday
2. List today's planned work
3. Note any blockers or dependencies
```

## Execution Record Format

Execution state is tracked in JSON files:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "workflowId": "daily-standup",
  "startedAt": "2026-03-06T09:00:00.000Z",
  "completedAt": "2026-03-06T09:05:23.451Z",
  "status": "completed",
  "triggerType": "manual",
  "participants": [
    {
      "agentId": "agent0",
      "agentName": "Backend Lead",
      "status": "completed",
      "startedAt": "2026-03-06T09:00:01.123Z",
      "completedAt": "2026-03-06T09:02:15.789Z",
      "result": {
        "response": "Standup complete. Yesterday: merged auth PR..."
      }
    }
  ],
  "logs": [
    "Workflow triggered at 2026-03-06T09:00:00.000Z",
    "Targeting 1 agent(s)",
    "Workflow execution started by CLI at 2026-03-06T09:00:01.000Z",
    "Started execution for Backend Lead",
    "Backend Lead completed successfully",
    "Workflow execution completed at 2026-03-06T09:05:23.451Z"
  ]
}
```

## Testing

### Manual Testing
```bash
# Create a test workflow
echo "---
id: test
name: Test Workflow
description: Test workflow execution
schedule: '0 9 * * *'
enabled: true
targeting:
  agents:
    - agent0
executionMode: automated
---

# Test Workflow
Please respond with your status.
" > ~/.openclaw/workspace/WORKFLOWS/test.md

# Start an agent gateway
openclaw gateway run --agent agent0

# Trigger workflow from dashboard UI (creates execution JSON)

# Run workflow execution
openclaw workflow run test
```

### Expected Output
```
Running workflow: test
Workflow: Test Workflow
Description: Test workflow execution

Execution ID: 550e8400-e29b-41d4-a716-446655440000
Participants: 1

→ Processing agent0...
  ✓ agent0 completed

✓ Workflow execution completed
Summary: 1 succeeded, 0 failed
```

## Benefits for OpenClaw Community

1. **Workflow Orchestration** - Enables coordinated multi-agent tasks beyond simple chat
2. **Scheduled Tasks** - Foundation for cron-based workflow automation
3. **Execution Tracking** - Detailed logs and status for troubleshooting
4. **Agent Coordination** - Groups/communities/tags based agent selection
5. **Dashboard Integration** - Visual interface for workflow management

## Upstreaming Path

This feature is production-ready and would benefit the broader OpenClaw community. Recommended upstreaming approach:

1. **Phase 1** (This PR): Core CLI command
   - `openclaw workflow run` command
   - Execution tracking
   - Gateway integration

2. **Phase 2** (Future PR): Scheduler integration
   - Cron daemon hooks
   - Automated scheduled execution
   - Execution history management

3. **Phase 3** (Future PR): Advanced features
   - Workflow dependencies
   - Conditional execution
   - Agent rotation/failover

## Open Questions for Maintainers

1. Should workflows live in `~/.openclaw/workspace/WORKFLOWS/` or a different location?
2. Is the execution state JSON format acceptable, or should we use a different storage mechanism?
3. Should workflow execution be integrated with OpenClaw's existing cron system?
4. Any concerns about the WebSocket-based agent communication approach?
5. Should workflow templates ship with OpenClaw core, or remain plugin/extension territory?

## Timeline

- **2026-03-06**: Initial implementation
- **Next Week**: Discussion with OpenClaw maintainers
- **TBD**: PR submission to upstream

## Contact

For questions or discussion:
- GitHub: @maximilien
- ClawMax Dashboard: https://github.com/maximilien/clawmax-dashboard
