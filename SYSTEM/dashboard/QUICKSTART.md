# ClawMax Dashboard - Quick Start Guide

**Last Updated**: March 7, 2026
**Version**: v0.9.2

---

## Current Setup Status

✅ **Dashboard**: Running on http://localhost:5173
✅ **Gateway**: Shared gateway on port 18889 (PID: 62627)
✅ **Workflow CLI**: `openclaw workflow run` command installed

---

## Important: Gateway Configuration

You are using a **SHARED GATEWAY** for all agents:
- **Port**: 18889
- **Config**: `~/.openclaw/openclaw.json`
- **Auth Token**: Configured

### ⚠️ Common Mistake

**WRONG** (this will fail):
```bash
openclaw gateway run --agent agent0 &
openclaw gateway run --agent engineer &
```

**Error**: `error: unknown option '--agent'`

**CORRECT** (shared gateway approach):
```bash
# Check if gateway is already running
lsof -ti:18889

# If nothing returned, start shared gateway
openclaw gateway run &
```

The `--agent` flag doesn't exist in OpenClaw. The shared gateway handles all agents.

---

## Starting the Dashboard

### 1. Verify Gateway is Running
```bash
lsof -ti:18889
```

If no PID returned:
```bash
cd ~/.openclaw
openclaw gateway run &
```

### 2. Start Dashboard
```bash
cd ~/.openclaw/workspace/SYSTEM/dashboard
npm run dev
```

Dashboard will be available at: **http://localhost:5173**

---

## Testing Your First Workflow

### Status Check Workflow (Simplest Test)

1. **Open Dashboard**: http://localhost:5173
2. **Navigate**: Click "Workflows" in sidebar
3. **Select Workflow**: Click "Status Check"
4. **Review**: Check workflow details:
   - **Targets**: Status group (agent0, engineer, max0)
   - **Mode**: Manual execution
5. **Trigger**: Click "Trigger Workflow" button
6. **Watch**: Real-time execution progress
7. **Review**: Click on execution to see agent responses

### Expected Result
- 3 participants: agent0, engineer, max0
- Status: pending → running → completed
- Execution time: 10-30 seconds per agent
- Agent responses visible in logs

---

## Troubleshooting

### Gateway Not Found
**Symptom**: "Gateway not configured for agent X"

**Fix**:
```bash
# Check shared gateway config
cat ~/.openclaw/openclaw.json | grep -A 10 gateway

# Verify gateway is running
lsof -ti:18889

# If not running, restart
openclaw gateway run &
```

### No Participants in Workflow
**Symptom**: Workflow execution shows 0 participants

**Fix**:
1. Check workflow targeting (YAML frontmatter)
2. Verify agents are in target group:
   ```bash
   cat ~/.openclaw/workspace/ORG/GROUPS.md | grep -A 5 "Status"
   ```
3. Ensure group members match: agent0, engineer, max0

### Workflow Times Out
**Symptom**: Agent status shows "failed" with timeout error

**Fix**:
1. Check agent is responsive (not stuck)
2. Increase timeout in workflow-cli.ts (currently 2 min)
3. Restart gateway and try again

### Dashboard Won't Load
**Symptom**: http://localhost:5173 doesn't respond

**Fix**:
```bash
cd ~/.openclaw/workspace/SYSTEM/dashboard

# Kill any stuck processes
pkill -f "ts-node server/index.ts"

# Restart
npm run dev
```

---

## Next Steps

### Weekend Testing Plan
1. **Saturday Morning**: Test Status Check workflow
2. **Saturday Afternoon**: Add Daily Standup workflow
3. **Sunday**: Record demo video, write blog post

See `WEEKEND_PLAN.md` for full schedule.

### Creating New Workflows
1. Go to Workflows page
2. Click "New Workflow"
3. Choose from templates:
   - Daily Standup
   - Weekly Status Report
   - Code Review Reminder
   - Sprint Planning
   - Security Audit
   - And more...

### Targeting Options
- **By Community**: Engineering Team, Product & Design
- **By Group**: Status, Daily check-ins, Legal
- **By Tags**: engineer, manager, qa, ceo
- **By Agent ID**: agent0, max0, engineer

---

## Key Files

### Configuration
- `~/.openclaw/openclaw.json` - Shared gateway config
- `~/.openclaw/workspace/ORG/GROUPS.md` - Group membership
- `~/.openclaw/workspace/ORG/COMMUNITIES.md` - Community structure

### Workflows
- `~/.openclaw/workspace/WORKFLOWS/` - Active workflows
- `~/.openclaw/workspace/WORKFLOWS/templates/` - Template library
- `~/.openclaw/workspace/WORKFLOWS/executions/` - Execution history

### Documentation
- `DEMO_PREP.md` - Demo preparation guide
- `CLAWMAX_FEATURES.md` - Comprehensive features
- `BLOG_POST_OUTLINE.md` - Blog post structure
- `WEEKEND_PLAN.md` - Weekend execution plan

---

## Support

**Issues**: https://github.com/Maximilien-ai/maxclaw/issues
**OpenClaw Docs**: https://openclaw.org

---

**Built with ❤️ by Maximilien.ai Team**
**Powered by OpenClaw**
