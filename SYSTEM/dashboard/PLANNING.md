# Dashboard Roadmap & Planning

## Completed

### v0.1.6 — Add/Delete Agent Management
- `AddAgentWizard` (4-step: Identity → Channel → Deployment → Provision)
- SSE-streamed setup.sh output in wizard
- `DeleteAgentPanel` with impact summary (TODOs, groups, WA number, state dir)
- `GET /api/agents/next`, `POST /api/agents/provision`, `DELETE /api/agents/:id`

### v0.1.7 — Clone From Agent
- "Clone from" dropdown in wizard Step 1 (copies SOUL, IDENTITY, TOOLS, USER, AGENTS, BOOTSTRAP)
- Server-side file copy before setup.sh runs (pre-populates workspace)

### v0.1.8 — SSE Keepalive + Provision Label
- SSE `: keepalive\n\n` comment every 2s to prevent Vite proxy idle timeout
- Step labels row switched to `justify-between` (no more "Provision" overflow)

### v0.1.9 — SIGTERM Fix + Clone Name Patch
- `req.on('close')` no longer kills setup.sh — agent always runs to completion
- `cloneAgentFiles` patches IDENTITY.md replacing source agent name with new name

### v0.7.0 — Skills & Tools Management Integration ✅
- Full Skills & Tools management UI integrated into dashboard
- Skills displayed on agent cards with click-to-manage functionality
- Advanced Skills page with searchable agent dropdown, usage tracking, and popularity stats
- Dynamic skill assignment with real-time validation and persistence
- Interactive stat cards for quick filtering (Total/Assigned/Available)
- Auto-filter to assigned skills when selecting an agent
- 5 Skills API endpoints: list, get, agent skills, update, validate
- Skills data read from `~/.openclaw/openclaw.json` per agent
- Skills displayed in agent detail panel with navigation to Skills page
- Comprehensive test suite: 67 tests passing (100%)
- SkillCard component with expandable details
- Most Popular Skills section
- **Released**: 2026-02-25

---

## In Progress / Next

### Development Roadmap — Weekend + Week Ahead
**Timeline**: Weekend (4 hours) + Next Week (40 hours) = 44 hours total
**Released**: v0.8.3 (2026-02-27)
**Strategy**: Balanced progress across multiple high-value features

---

#### **Weekend — Feb 28-Mar 1 (4 hours total: 2h/day)**

**Saturday (2 hours): WhatsApp Link Panel — v0.8.4**
- [ ] Implement backend SSE endpoint: `POST /api/agents/:id/whatsapp/pair`
  - Detect Baileys/Boom paths from pnpm store
  - Determine profile mode vs default credentials dir
  - Spawn whatsapp-pair.mjs and stream output
  - Parse pairing code and emit SSE events
- [ ] Integrate "Link WA" button in agent cards (when no phone number)
- [ ] Test end-to-end pairing flow
- [ ] **Deliverable**: v0.8.4 with WhatsApp pairing from dashboard

**Sunday (2 hours): Chat Backend Foundation — v0.8.5**
- [ ] Create `server/routes/chat.ts`
- [ ] Implement `GET /api/agents/:id/gateway` (returns port, token, availability)
- [ ] Implement `POST /api/agents/:id/chat` SSE proxy
  - Open WebSocket to agent gateway
  - Send chat.send RPC call
  - Relay delta events back as SSE
- [ ] Test with running agent gateway
- [ ] **Deliverable**: Chat API ready for frontend integration

---

#### **Next Week — Multi-Feature Sprint (40 hours)**

**Monday (8 hours): In-Dashboard Chat UI — v0.8.6**
- [ ] Create `AgentChatPanel.tsx` slide-out component
- [ ] Chat input + message history display
- [ ] Stream delta text with SSE connection
- [ ] Add "Chat" button to agent cards (show when gateway available)
- [ ] Session management (sessionId in React state)
- [ ] Polish chat UX (typing indicators, error states)
- [ ] **Deliverable**: v0.8.6 with working agent chat

**Tuesday (8 hours): Agent Status & Control — v0.8.7**
- [ ] Create `AgentStatusPage` component (new route: `/agents/:id/status`)
- [ ] Live log tail with SSE streaming from gateway
- [ ] Gateway status display (port, uptime, connection status)
- [ ] Start/stop gateway controls (if feasible)
- [ ] Add "Status" button to agent cards
- [ ] **Deliverable**: v0.8.7 with agent monitoring

**Wednesday (8 hours): Workflows Backend Foundation**
- [ ] Create WORKFLOWS directory structure and validation schema
- [ ] Implement `server/lib/workflows.ts`:
  - Workflow file parser with YAML frontmatter (gray-matter)
  - CRUD operations (create, read, update, delete)
  - TypeScript interfaces (Workflow, WorkflowMetadata)
  - Agent participation resolution (groups + tags + IDs)
- [ ] Create `server/routes/workflows.ts` with 6 endpoints
- [ ] **Deliverable**: Workflows backend API complete

**Thursday (8 hours): Workflows UI — Core**
- [ ] Create `WorkflowsPage.tsx` (new top-level tab)
- [ ] Build `WorkflowCard` component (name, schedule, participants)
- [ ] Build `WorkflowDetailPanel` slide-out
- [ ] Create `WorkflowEditorDialog` for create/edit
- [ ] Basic markdown editor + YAML frontmatter fields
- [ ] Agent targeting UI (communities, groups, tags, IDs)
- [ ] **Deliverable**: Working workflows CRUD UI

**Friday (8 hours): Workflows Completion + Release — v0.9.0**
- [ ] Build `CronScheduleBuilder` component (visual + raw input)
- [ ] Integrate workflows into AgentDetailPanel
- [ ] Integrate workflows into Groups/Communities panels
- [ ] Add workflows to organization template export/import
- [ ] Test full workflow lifecycle (create → assign → export → import)
- [ ] Polish UI (loading states, error handling, empty states)
- [ ] Comprehensive testing across all new features
- [ ] **Deliverable**: v0.9.0 with 5 major features complete

---

#### **Weekly Release Cadence**
- **v0.8.4** (Saturday): WhatsApp Link Panel
- **v0.8.5** (Sunday): Chat Backend
- **v0.8.6** (Monday): Chat UI
- **v0.8.7** (Tuesday): Agent Status & Control
- **v0.9.0** (Friday): Workflows + Multi-feature release

---

#### **Backlog for Later**
- [ ] Multi-agent broadcast (send message to all agents)
- [ ] Agent templates library (SYSTEM/templates/)
- [ ] Workflow execution engine (cron scheduler)
- [ ] Workflow analytics dashboard
- [ ] Browser relay bug fix (Chrome CDP session issue)

### v0.2.0 — WhatsApp Link Panel

**Goal**: Allow linking/re-linking WhatsApp post-creation from the agent card.

**UX:**
- Agent cards without a WhatsApp number show a "Link WA" button
- Clicking opens `LinkWhatsAppPanel` modal
- User enters phone number (international format, no +)
- Panel runs `whatsapp-pair.mjs` via SSE and streams output
- Detects `PAIRING CODE: XXXX-XXXX` in output → shows the code prominently
  in a styled callout box ("Enter this code on your phone")
- Shows success when `✅ Linked!` appears, refreshes agent list

**Backend** (`server/routes/agents.ts`):
- `POST /api/agents/:id/whatsapp/pair` — SSE endpoint
  - Body: `{ phone: string }`
  - Detects Baileys/Boom paths from pnpm store
  - Determines credentials dir: `~/.openclaw/credentials/whatsapp/default` (default)
    or `~/.openclaw-<id>/credentials/whatsapp/default` (profile mode)
  - Spawns `whatsapp-pair.mjs` and streams stdout/stderr
  - Parses `PAIRING CODE: ...` line → emits `{ type: 'code', data: 'XXXX-XXXX' }` SSE event
  - Parses `✅ Linked!` → emits `{ type: 'done', data: 'ok' }`

**Config/detection:**
- Profile mode detection: check if `~/.openclaw-<id>/` exists
- Baileys path: glob `~/{HOME}/github/maximilien/openclaw/node_modules/.pnpm/@whiskeysockets+baileys*/node_modules/@whiskeysockets/baileys`
- Boom path: same pattern with `@hapi+boom`

**Frontend** (`LinkWhatsAppPanel.tsx`):
- Same SSE stream pattern as provision wizard
- Special `code` event type → renders prominent styled code display
- Instructions: "On your phone: WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead"

---

### v0.2.1 — In-Dashboard Chat

**Goal**: Chat with any running agent directly from the dashboard.

**Architecture (confirmed from codebase exploration):**

The openclaw gateway exposes:
- **Primary**: WebSocket `ws://127.0.0.1:<port>` with RPC method `chat.send`
  - Auth: Bearer token from `~/.openclaw/openclaw.json` → `gateway.auth.token`
  - WS events: `{ type: 'chat', state: 'delta'|'final', text: '...' }`
- **Secondary (if enabled)**: `POST /v1/chat/completions` — OpenAI-compatible streaming

Config location:
- Default: `~/.openclaw/openclaw.json` → `gateway.port` + `gateway.auth.token`
- Profile: `~/.openclaw-<id>/openclaw.json`

**Backend** (`server/routes/chat.ts`):
- `GET /api/agents/:id/gateway` — returns `{ port, token, available: bool }`
  Reads agent state dir config, checks if gateway port is listening
- `POST /api/agents/:id/chat` — SSE proxy
  - Body: `{ message: string, sessionId?: string }`
  - Opens WS to `ws://127.0.0.1:<port>` with gateway token auth
  - Sends `chat.send` RPC call
  - Relays `chat` delta events back as SSE: `{ type: 'delta', data: '...' }`
  - Relays `chat` final event: `{ type: 'done' }`
  - `GET /api/agents/:id/chat/history` — fetches via WS `chat.history` method

**Frontend** (`AgentChatPanel.tsx`):
- Slide-out panel from agent card (similar to AgentDetailPanel)
- Chat input at bottom, message history above
- "Chat" button on agent card (only shown when gateway is available/port known)
- Each agent maintains its session via `sessionId` stored in React state
- Streams delta text with cursor animation
- History loaded on open via `chat.history`

**WS RPC protocol** (to be confirmed when gateway is running):
- Request: `{ jsonrpc: '2.0', id: <uuid>, method: 'chat.send', params: { message, sessionId? } }`
- Response events: `{ type: 'chat', state: 'delta'|'final', text: '...', sessionId: '...' }`
- Auth likely in WS URL: `ws://127.0.0.1:<port>?token=<token>` or first WS message

**TODO before implementing chat:**
- [ ] Start the max0 or max01 gateway and probe the WS format
- [ ] Confirm auth mechanism (URL param vs first WS message vs HTTP upgrade header)
- [ ] Install `ws` npm package in dashboard server if not present

---

## Backlog

### Workflows - Coordinated Agent Tasks

**Goal**: Define recurring work patterns for groups of agents with specific roles/tags within communities.

**Concept:**
Workflows define periodic, coordinated work that agents execute based on their community/group membership and tags. They're cron-scheduled tasks with natural language descriptions, enabling systematic operations like daily standups, security monitoring, release processes, etc.

**Example Use Cases:**
- **Engineering/Support**: Daily security monitoring (check GH issues, scan for CVEs, notify release team)
- **Engineering/Review**: Weekly code review rotation
- **Product/Planning**: Monday sprint planning
- **Operations/Monitoring**: Hourly system health checks

**Data Model** (`WORKFLOWS.md` or `WORKFLOWS/*.md`):
```yaml
---
name: daily-security-scan
description: Monitor repository for security issues and CVEs
schedule: "0 9 * * *"  # Daily at 9am (cron format)
community: Engineering  # Optional: limit to specific community
groups:  # Agents in these groups participate
  - Support
  - Security
tags:  # OR agents with these tags (regardless of group)
  - security-lead
  - oncall
agents:  # OR specific agents by ID
  - security-bot-01
---

# Daily Security Scan Workflow

## Objective
Monitor the project repository and broader ecosystem for security vulnerabilities, new CVEs, and critical issues.

## Tasks
1. **GitHub Repository Scan**
   - Check open issues labeled `security`, `vulnerability`, `cve`
   - Review Dependabot alerts
   - Check for new security advisories

2. **CVE Database Check**
   - Browse NVD, GitHub Advisory Database for new CVEs related to our stack
   - Cross-reference with project dependencies
   - Note any critical (CVSS >= 9.0) or high (>= 7.0) severity issues

3. **Reporting**
   - Summarize findings in #security channel
   - Tag release manager if immediate action needed
   - Create GitHub issues for any new vulnerabilities found
   - Update security tracking board

## Expected Output
- Daily summary message in #security
- GitHub issues for actionable items
- Escalation to release manager if critical
```

**Schema Validation:**
- `name`: Required, unique identifier (alphanumeric + dash/underscore)
- `description`: Required, brief summary
- `schedule`: Required, valid cron expression
- `community`: Optional string
- `groups`: Optional array of group names
- `tags`: Optional array of agent tags  - `agents`: Optional array of agent IDs
- At least one of: `groups`, `tags`, or `agents` must be specified
- Content: Free-form markdown with task description

**Storage:**
- **Option A**: Single `WORKFLOWS.md` file (similar to GROUPS.md/COMMUNITIES.md)
- **Option B**: `WORKFLOWS/` directory with one markdown file per workflow
- **Recommendation**: Option B for better organization and git history

**Organization Templates:**
- Workflows MUST be included when exporting organization templates
- Template should include directory structure: `WORKFLOWS/*.md`
- During template import, workflows are created alongside communities/groups

**UI Requirements:**
1. **Workflows Tab** (new top-level page)
   - List all workflows with name, description, schedule, assigned agents count
   - Create/Edit/Delete workflow dialogs
   - Schedule editor (cron builder UI + raw cron input)
   - Agent assignment interface (by group, tag, or ID)
   - Markdown editor for workflow content

2. **Agent Detail Panel**
   - Show "Participating Workflows" section
   - List workflows this agent is part of (via group, tag, or direct assignment)
   - Click to navigate to workflow detail

3. **Groups/Communities Detail**
   - Show workflows that target this group/community
   - Quick-add agent to workflow

**Backend API:**
- `GET /api/workflows` - List all workflows with participant counts
- `GET /api/workflows/:name` - Get workflow details + full participant list
- `POST /api/workflows` - Create new workflow (validate schema)
- `PUT /api/workflows/:name` - Update workflow
- `DELETE /api/workflows/:name` - Delete workflow
- `GET /api/agents/:id/workflows` - Get workflows this agent participates in
- Workflow resolution logic: Compute agent list from groups, tags, agents fields

**Execution** (Future - out of scope for now):
- Cron daemon/scheduler to trigger workflows on schedule
- When workflow triggers, send task description to all participating agents
- Agents execute via their normal gateway/chat interface
- Track execution history, results, failures

**Initial Implementation Scope:**
- [ ] Schema design + validation for WORKFLOWS/*.md files
- [ ] Backend CRUD API for workflows
- [ ] Workflows tab UI (list, create, edit, delete)
- [ ] Cron schedule builder component
- [ ] Agent participation resolution (groups + tags + direct IDs)
- [ ] Show workflows in agent/group detail panels
- [ ] Include workflows in organization template export/import

**Future Enhancements:**
- Execution engine (cron scheduler)
- Workflow execution history/logs
- Success/failure tracking
- Agent rotation within workflows
- Workflow dependencies (workflow A must complete before workflow B)
- Conditional execution based on agent availability

### Browser Relay Bug (Known Issue)
- Chrome extension relay (`cdpPort` 18892) connects successfully but Playwright's `browserContext.newCDPSession()` calls `Target.attachToBrowserTarget` which Chrome rejects with `"Not allowed"` from a tab-level debugger session
- Workaround applied in `background.js`: intercepts `Target.attachToBrowserTarget` and returns the active tab's session ID; also added `Target.getTargets` synthetic handler
- Extension still not working end-to-end — the gateway logs still show the error even after extension reload
- Root cause: Chrome's extension debugger API only supports tab-level sessions; browser-level CDP requires `--remote-debugging-port` on Chrome startup
- Next steps to investigate: (1) check if Playwright's `connectOverCDP` can work with tab-level sessions, (2) test if the `background.js` patch is actually being loaded by Chrome, (3) consider launching Chrome with `--remote-debugging-port=9222` as an alternative

### Templates
- `SYSTEM/templates/` directory for reusable agent templates
- Replace/augment "Clone from" dropdown with template selector

### Agent Status Page
- Live log tail from gateway
- Start/stop agent gateway from UI

### Multi-agent Broadcast
- Send a message to all agents simultaneously
- Useful for "good morning" / daily briefing scenarios
