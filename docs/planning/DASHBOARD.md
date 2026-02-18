# ClawMax.ai Dashboard — Planning Document

_Status: PLAN · Last updated: 2026-02-17_

---

## Purpose

A web-based owner dashboard for the Maximilien.ai organization — providing a single pane of glass for the documents, agents, logs, and WhatsApp community that make up a ClawMax.ai deployment. The dashboard is itself a ClawMax.ai product: MIT-licensed, runnable locally, and reusable by any organization operating on the ClawMax.ai model.

---

## Design Principles

- **Owner-first UX.** The primary user is the human(s) accountable for the agent network. The interface should surface what they need to oversee, approve, and act — not everything that is happening.
- **Read before write.** Every destructive or irreversible action (delete agent, revoke WhatsApp pairing) requires an explicit confirmation step.
- **OpenClaw-native.** Use OpenClaw's existing runtime, credential store, and gateway APIs wherever possible rather than reinventing them.
- **Local-first.** The dashboard server runs on the same machine as the OpenClaw gateway. No cloud dependency required.
- **Secure by default.** Dashboard is localhost-only unless explicitly configured otherwise. Owner authentication via a local secret token.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Type safety across frontend + backend; aligns with OpenClaw's Node.js ecosystem |
| Backend | Node.js + Express (or Fastify) | Lightweight, familiar, easy to shell out to `setup.sh` and OpenClaw CLI |
| Frontend | React + Vite | Fast dev loop; no framework lock-in |
| Styling | Tailwind CSS | Utility-first; easy to keep minimal |
| Markdown rendering | `react-markdown` + `remark-gfm` | Render MASTER_PLAN.md and other docs in-browser |
| Markdown editing | CodeMirror or Monaco (markdown mode) | In-browser editing of workspace docs |
| Log streaming | Server-Sent Events (SSE) | Simple, no WebSocket overhead for log tailing |
| WhatsApp | Baileys (already in openclaw) | Reuse existing dep; read community/group structure |
| Process management | `child_process` / `execa` | Spawn `setup.sh`, read OpenClaw process state |
| Config | `.env` + `dashboard.config.json` | Workspace-relative config file |

---

## Feature Areas

### 1. Organization Overview

The landing page. Shows:
- Organization name and active agents count
- Quick links to key documents (MASTER_PLAN.md, ONBOARDING.md, SOUL.md)
- System health: OpenClaw gateway status, WhatsApp connection status
- Recent activity feed (last N agent log entries across all agents)

### 2. Document Hub

Browse, read, and edit workspace documents.

**Read view:**
- Renders any `.md` file in the workspace as formatted HTML
- Sidebar tree of `docs/`, root-level `.md` files, and per-agent `maxN/` docs
- MASTER_PLAN.md pinned at top

**Edit view:**
- In-browser markdown editor (CodeMirror)
- Save commits the change to git with an auto-generated commit message
- Diff preview before save
- Optionally push to remote on save (toggle in config)

**File tree coverage:**
```
MASTER_PLAN.md          ← pinned
ONBOARDING.md
docs/
  planning/
    DASHBOARD.md        ← this file
  ...
maxN/
  SOUL.md
  AGENTS.md
  TODOs.md
  memory/
  ...
```

### 3. Agent Roster

List of all agents discovered in the workspace (`max0/`, `max1/`, …).

Per agent card:
- Agent ID and display name (from `IDENTITY.md`)
- Status: `online` / `offline` / `unknown` (based on OpenClaw process / last heartbeat file timestamp)
- WhatsApp number linked (if any)
- Last heartbeat timestamp
- Links: View Logs | View Workspace | Edit SOUL | Edit TODOs

**Status detection:**
- Check if `openclaw gateway` process is running for that instance
- Read `HEARTBEAT.md` last-modified timestamp
- Read `workspace-state.json` if present

### 4. Agent Log Viewer

Per-agent streaming log view.

- Tails the openclaw process log for the selected agent
- SSE stream from backend — no polling
- Filter by log level (info / warn / error)
- Search / grep within log
- Download log as `.txt`
- Auto-scroll toggle

**Log sources (in priority order):**
1. OpenClaw gateway logs for the instance (via `openclaw logs <instance>` or process stdout)
2. Agent memory files (`maxN/memory/YYYY-MM-DD.md`) as a structured audit trail fallback

### 5. Agent Management

Actions available per agent:

| Action | Implementation | Confirmation required |
|---|---|---|
| Add new agent | Calls `./scripts/instances/setup.sh <name> [--whatsapp <num>]` | Form → dry-run preview → confirm |
| Delete agent | Removes `maxN/` directory, stops openclaw instance | Yes — irreversible warning |
| Connect WhatsApp | Runs pairing code flow (Baileys); displays code in UI | Standard QR/code flow |
| Disconnect WhatsApp | Removes credentials for instance | Yes |
| View SOUL | Opens `maxN/SOUL.md` in Document Hub | — |
| Edit TODOs | Opens `maxN/TODOs.md` in editor | — |
| Restart agent | Restarts openclaw gateway process for instance | Yes |

**Add Agent wizard (multi-step):**
1. Enter agent name (validated against `setup.sh` rules: letters/digits/dash/underscore, no leading digit)
2. Optional: enter WhatsApp number
3. Optional: choose model (default `openai/gpt-4o`), profile mode, port
4. Dry-run preview (calls `setup.sh --dry-run`, renders output)
5. Confirm → runs actual setup → streams output in real time
6. On completion: agent appears in roster

### 6. WhatsApp Community View

Shows the WhatsApp group/community structure for the organization.

- List all groups the linked WhatsApp account is a member of
- For each group: name, participant count, last message timestamp
- Highlight groups where an agent is the sender (match by agent phone number)
- Show message count per agent in each group (last 24h / 7d)
- Read-only — no sending from dashboard

**Implementation:** Reuse Baileys connection from the openclaw gateway (or open a read-only connection using stored credentials).

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                  │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐ │
│  │  Org     │  │  Doc Hub  │  │  Agents  │  │  WA    │ │
│  │  Overview│  │  (md r/w) │  │  Roster  │  │  View  │ │
│  └──────────┘  └───────────┘  └──────────┘  └────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + SSE
┌──────────────────────▼──────────────────────────────────┐
│  Dashboard Server (Express / TypeScript)                  │
│                                                          │
│  /api/docs         → read/write workspace .md files      │
│  /api/agents       → list, status, add, delete           │
│  /api/agents/:id/logs → SSE log stream                   │
│  /api/whatsapp     → group/community structure           │
│  /api/system       → gateway health, git status          │
└──────┬─────────────────────────┬────────────────────────┘
       │                         │
       ▼                         ▼
~/.openclaw/workspace/    OpenClaw gateway process(es)
  maxN/ dirs               Baileys WhatsApp connections
  *.md files               openclaw CLI
  scripts/instances/
```

---

## Phases

### Phase 1 — Foundation (v0.1) · _Start here_

Goal: working local server with document hub and agent roster.

- [ ] Scaffold: TypeScript + Express backend, React + Vite frontend, Tailwind
- [ ] `/api/docs` — list, read, write `.md` files in workspace
- [ ] Document Hub UI — file tree, markdown render, basic editor
- [ ] `/api/agents` — discover `maxN/` directories, read `IDENTITY.md` + `HEARTBEAT.md`
- [ ] Agent Roster UI — cards with name, status, last heartbeat
- [ ] Auth: local secret token in `Authorization` header
- [ ] `npm run dev` and `npm start` scripts
- [ ] `dashboard/` lives at root of maxclaw repo

### Phase 2 — Agent Ops (v0.2)

- [ ] `/api/agents/:id/logs` — SSE log streaming from openclaw process stdout
- [ ] Log Viewer UI — streaming, filter, search, download
- [ ] Add Agent wizard — form → dry-run preview → streaming setup output → done
- [ ] Delete Agent — confirmation modal, stop process, remove directory
- [ ] Restart Agent — signal openclaw process

### Phase 3 — WhatsApp (v0.3)

- [ ] `/api/whatsapp` — read group list from Baileys via stored credentials
- [ ] WhatsApp Community view — groups, participants, per-agent message counts
- [ ] Connect WhatsApp wizard — pairing code flow, display code in UI, poll for linked status

### Phase 4 — Git + Polish (v0.4)

- [ ] Doc edits commit to git automatically (configurable: auto-push or manual)
- [ ] Diff preview before saving a document
- [ ] Recent activity feed on org overview (across all agent logs)
- [ ] System health panel: gateway processes, disk, last git push
- [ ] Mobile-responsive layout

---

## Directory Layout (proposed)

```
maxclaw/
  dashboard/
    package.json
    tsconfig.json
    vite.config.ts
    server/
      index.ts          ← Express entry point
      routes/
        docs.ts
        agents.ts
        logs.ts
        whatsapp.ts
        system.ts
      lib/
        workspace.ts    ← reads ~/.openclaw/workspace
        openclaw.ts     ← shells out to openclaw CLI
        git.ts          ← git operations on workspace
        baileys.ts      ← WhatsApp read connection
    client/
      src/
        App.tsx
        pages/
          Overview.tsx
          DocHub.tsx
          Agents.tsx
          LogViewer.tsx
          WhatsApp.tsx
        components/
          AgentCard.tsx
          MarkdownEditor.tsx
          LogStream.tsx
          ...
      index.html
    dashboard.config.json.example
```

---

## Open Questions

1. **Auth model**: Single local secret token is simple but not multi-user. Do we need role separation (owner vs. read-only observer)?
2. **Remote access**: Should the dashboard support SSH tunnel / ngrok / Tailscale for remote owner access, or stay localhost-only for v1?
3. **Multi-machine**: When max1 (Mac mini) is online, how does the dashboard aggregate across machines? Options: (a) one dashboard per machine, (b) a primary dashboard that SSHes into secondaries, (c) agents push state to a shared store.
4. **Notifications**: Should the dashboard push browser notifications for agent errors, failed heartbeats, or WhatsApp disconnects?
5. **OpenClaw API surface**: Need to audit what OpenClaw exposes via CLI vs. what requires reading files directly. Prefer CLI where stable.

---

## Related Files

- `scripts/instances/setup.sh` — agent provisioning (called by Phase 2 Add Agent)
- `scripts/instances/lib/whatsapp-pair.mjs` — WhatsApp pairing (reused in Phase 3)
- `MASTER_PLAN.md` — pinned in Document Hub
- `ONBOARDING.md` — linked from org overview
- `maxN/SOUL.md`, `maxN/IDENTITY.md` — per-agent config, editable in dashboard

---

_Owner: Dr. Maximilien · Next action: begin Phase 1 scaffold when ready to build_
