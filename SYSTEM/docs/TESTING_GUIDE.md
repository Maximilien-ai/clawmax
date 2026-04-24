# ClawMax Testing Guide

> Last updated: April 2, 2026 (v1.2.1)

## Quick Start

```bash
# 1. Setup
./setup.sh

# 2. Configure keys in SYSTEM/dashboard/.env
#    SYSTEM_OPENAI_API_KEY=sk-...
#    SYSTEM_ANTHROPIC_API_KEY=sk-ant-...
#    ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true

# 3. Start dashboard + gateway
./SYSTEM/start.sh
openclaw gateway restart

# 4. Run tests
./SYSTEM/test.sh                # Unit + API tests (fast, no LLM cost)
./SYSTEM/test.sh integration    # + live agent tests (~$0.03, requires keys)

# Optional: custom ports
DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test.sh integration --with-validation
```

## Test Types

| Type | Command | Tests | Duration | LLM Cost |
|------|---------|-------|----------|----------|
| **Unit** | `./SYSTEM/test.sh` | 150+ | ~30-60s | $0 |
| **Integration** | `./SYSTEM/test.sh integration` | 170+ | ~2-4 min | ~$0.01-0.05 |
| **Manual** | Dashboard UI | varies | varies | varies |

## Unit Tests (Section 0)

Run standalone from `SYSTEM/dashboard/`:

```bash
npx ts-node --transpileOnly server/lib/skills.test.ts          # 17 tests
npx ts-node --transpileOnly server/lib/templates.test.ts       # 35+ tests
npx ts-node --transpileOnly server/lib/notifications.test.ts   # 15 tests
npx ts-node --transpileOnly server/lib/workflows.test.ts       # 24+ tests
npx ts-node --transpileOnly server/lib/validator.test.ts       #  9 tests
npx ts-node --transpileOnly server/lib/safe-env.test.ts        #  8 tests
npx ts-node --transpileOnly server/lib/agent-config-validation.test.ts  # 6 tests
npx ts-node --transpileOnly server/lib/agent-model.test.ts     #  3 tests
npx ts-node --transpileOnly server/lib/agent-execution.test.ts #  2 tests
npx ts-node --transpileOnly server/lib/workspace-export.test.ts # workspace export
npx ts-node --transpileOnly server/lib/cron-next-run.test.ts   #  5 tests
npx ts-node --transpileOnly test/workspace-order.test.ts       #  6 tests
```

### Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| skills.ts | 17 | CRUD, validation, import, workspace/bundled |
| templates.ts | 35+ | CRUD, TEMPLATE.md parse/serialize, cross-validation, categories, kickoff |
| notifications.ts | 15 | Create, dedup, dismiss, resolve, actions, blockers, severity |
| workflows.ts | 24+ | CRUD, cron, WORKFLOW.md, DAG engine, deps, complete, advance |
| validator.ts | 9 | Schema validation, required fields, managed mode, types |
| safe-env.ts | 8 | BYOK key handling, env safety |
| agent-config-validation.ts | 6 | Agent config structure |
| agent-model.ts | 3 | Model resolution |
| agent-execution.ts | 2 | Execution runtime |
| cron-next-run.ts | 5 | Cron scheduling |
| workspace-order.ts | 6 | Workspace ordering |

## API Tests (Sections 1-26)

Run with `./SYSTEM/test.sh` (requires dashboard running):

| Section | Tests | Description |
|---------|-------|-------------|
| 1 | 6 | Health & System APIs |
| 2 | 10 | Agent APIs |
| 3-6 | skipped | Validation tests (`--with-validation` to run) |
| 7 | 4 | Document APIs |
| 8 | 4 | Channel APIs |
| 9 | 7 | Group Chat APIs |
| 10 | 5 | Activity Feed |
| 11 | varies | WhatsApp Integration |
| 12 | 2 | MANDATE.md Schema |
| 13 | 5 | DocHub Search |
| 14 | 18 | Skills & Tools APIs (incl. bulk assign) |
| 15 | varies | Gateway RPC Compatibility |
| 16 | 19 | Workflows APIs |
| 17 | 8 | Custom Skills Import |
| 18 | 6 | Notification APIs (incl. actions, blockers) |
| 19 | 4 | Per-Agent Cost Limits |
| 20 | 2 | Bulk Model Change |
| 21 | 3 | Available Models API |
| 22 | 3 | Template Categories & TEMPLATE.md |
| 23 | 2 | Shipables Registry API |
| 24 | 1 | Workflow Content Overrides |
| 25 | 7 | Workflow v2 APIs (progress, deps, blockers) |
| 26 | 3 | Template/Workflow Import/Export MD |

## Integration Tests (Live Agents)

Run with `./SYSTEM/test.sh integration`

### ClawMax System Test Template

The integration tests use a dedicated template: `TEMPLATES/organizations/clawmax-system-test/template.json`

**Agents**:
- `test-lead` — test orchestrator
- `test-agent1`, `test-agent2` — scalable worker agents (1-10 via parameters)

**Workflows** (DAG):
```
test-kickoff
  → test-filesystem
    → test-communications
      → test-github
      → test-dag-parallel-a
      → test-dag-parallel-b
        → test-report
```

**Communication:**
- Community: Test Team
- Groups: Test Status, Test Chat, Test Work

### What the Integration Tests Cover

| Test | What it verifies |
|------|-----------------|
| **Workspace setup** | Creates/activates system-test workspace |
| **Template apply** | Applies system-test template with agent scaling |
| **Agent creation** | All 3 agents exist with correct IDs |
| **Workflow creation** | All 5 workflows exist |
| **Communities/Groups** | Communication channels created |
| **Agent chat (1-1)** | Send message to test-lead, verify response |
| **Group messaging** | Post to Test Chat group |
| **DAG config** | Set dependencies between workflows |
| **Workflow trigger** | Trigger kickoff with BYOK keys |
| **Kickoff execution** | Wait for agent to complete (120s timeout) |
| **DAG progression** | Verify workflows advance through pipeline |
| **Notifications** | Endpoint returns active notifications |
| **Progress API** | Report and verify progress 0-100% |
| **Complete + advance** | Mark complete, verify dependents unlocked |

### Cost Estimation

The integration suite uses the server-selected cost-efficient default model:
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens
- Typical test run: ~3 agent calls × ~500 tokens = ~$0.01-0.05

### Known State

The integration test runner:
1. Resolves and activates the dedicated `ClawMax System Test` workspace
2. Recreates a fresh clean state for the system-test template
3. Re-applies the `ClawMax System Test` template
4. Recreates the clean workspace again after the run

Users can manually test in this workspace, but the next integration run will reset it back to a known state.

## Manual Testing Guide

### Templates
- Templates page: category filters (Business/Technical/Personal)
- Create Template wizard: 5-step flow with AI Generate
- Apply Template: dynamic form fields, GitHub coordination, workflow customization
- Export .md: download TEMPLATE.md from detail view

### Workflows
- DAG view (◇ button): dependency lines, progress bars, status colors
- Edit Dependencies: click "Edit Dependencies", connect/disconnect nodes
- Trigger: "Run Now" button, verify execution in history
- Export .md: download WORKFLOW.md from detail panel

### Notifications
- Create test notifications via API (see below)
- Verify: approval buttons, choice pills, input fields, delegation picker
- Dismiss, search, restart/pause actions

```bash
# Create test notifications of all types
curl -X POST http://localhost:3001/api/workflows/<id>/blocker \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"test","blockerType":"approval","title":"Test approval","message":"Approve?"}'
```

### Shipables Registry
- Skills page → Import → Shipables Registry tab
- Search, browse categories, install

## CI/CD

GitHub Actions: `.github/workflows/ci.yml`
- Runs on: PR to `main`, push to `main`, `v*` tags
- Steps: setup Node/Go, install OpenClaw, `./setup.sh`, start dashboard, `./SYSTEM/test.sh`
- Integration tests (`./SYSTEM/test.sh integration`) are NOT run in CI because they require live model access and keys
- The remaining clean-room gap is still a truly fresh-machine run with no prior OpenClaw or ClawMax state

### Clean-Room Setup Validation

For a repeatable fresh-state bootstrap check, use:

```bash
./SYSTEM/scripts/setup-contract-test.sh
```

This verifies the setup contract on a fresh copied repo + fresh `HOME`:
- `setup.sh --non-interactive` completes
- generated `.env` respects overridden dashboard ports/URLs
- OTP subject output is shell-safe
- the canonical dashboard token is written to `SYSTEM/dashboard/.dashboard-token`
- the legacy workspace token copy still matches for compatibility

For a heavier isolation path, there is also a Podman harness:

```bash
./SYSTEM/scripts/cleanroom-podman-setup-test.sh
```

That script is intended to exercise the same setup/start/test contract inside a disposable Linux container instead of the current host environment.

## Pre-flight Checks

`test.sh` validates before running:
- Node.js 18+
- Dashboard dependencies installed
- OpenClaw CLI available
- OpenClaw config exists
- Dashboard server running on the configured `DASHBOARD_PORT` (default `3001`)
- Auth token available

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Tests hang | Check dashboard: `./SYSTEM/status.sh` |
| HTTP 401 | Set `BYPASS_OAUTH=true` in `.env`, restart |
| Agent chat fails | Set `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true` in `.env` |
| Gateway RPC fails | Run `openclaw gateway restart` |
| Kickoff timeout | Check gateway running, verify API keys configured |
| Unit tests fail | Run `npm install` in `SYSTEM/dashboard/` |
