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

### DEMO DAY PREP (Tomorrow)
**Priority**: Polish and test core features for demo

**Tonight (2-3 hours):**
- [ ] Review all pages for visual consistency
- [ ] Test full agent lifecycle: create → assign skills → chat (if available)
- [ ] Verify all tests pass with `./test.sh`
- [ ] Prepare demo script/talking points
- [ ] Check for any console errors or warnings

**Demo Day:**
- [ ] Morning: Final smoke test of all features
- [ ] Demo script ready with backup scenarios
- [ ] Server/client running and stable

**Post-Demo (Rest of Week):**
- [ ] Gather feedback from demo
- [ ] Fix any bugs discovered during demo
- [ ] Prioritize next features based on feedback

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
