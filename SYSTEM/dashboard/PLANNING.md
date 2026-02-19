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

---

## In Progress / Next

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

### Templates
- `SYSTEM/templates/` directory for reusable agent templates
- Replace/augment "Clone from" dropdown with template selector

### Agent Status Page
- Live log tail from gateway
- Start/stop agent gateway from UI

### Multi-agent Broadcast
- Send a message to all agents simultaneously
- Useful for "good morning" / daily briefing scenarios
