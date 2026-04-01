# ClawMax Known Issues & Limitations

**Last Updated**: 2026-04-01
**Current Version**: main

---

## Active Issues

### 1. Gateway process management
**Severity**: High
**Status**: Documented, needs CLI team fix

`SYSTEM/stop.sh` kills the shared gateway (port 18789), leaving agents unable to communicate. Agents show offline even though config is fine. Workaround: `openclaw gateway restart` after stop/start.

**Fix needed**: Process supervisor (pm2/systemd), stop.sh should not kill gateway, start.sh should verify gateway.

---

### 2. Compact dashboard upward reorder
**Severity**: Medium
**Status**: Known bug

In compact dashboard layout editing, dragging a section downward or across columns works, but dragging a tile upward within the same column is still unreliable.

**Workaround**: Drag downward first, or move the card across columns and back.

---

### 3. Agent chat requires ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION
**Severity**: Low
**Status**: By design

Agent execution (chat, workflows) requires either BYOK keys, `USER_*` defaults, or `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true` in `.env`. Without this, agents fail with "No execution API keys configured".

---

### 4. DAG connector lines overlap nodes on complex layouts
**Severity**: Low (cosmetic)
**Status**: Known limitation

SVG bezier curves can pass through nodes when the layout has many parallel workflows at different vertical positions. Planned fix: route lines around node bounding boxes.

---

## Resolved Recently (v1.1.16–v1.1.20)

- **.toFixed() crashes** — guarded all undefined access across Activity, Agents, Workflows pages
- **OAuth button when not configured** — shows setup instructions instead of broken button
- **System.* null access in TopBar** — all system fields use optional chaining
- **Agent import without files** — generates IDENTITY.md from template data
- **Workflow creation for managed mode** — auto-assigns owner
- **Dismissed notifications reappearing** — dedup now includes dismissed
- **Agent status offline for shared gateway** — probes port 18789 as fallback
- **AI generator with Anthropic-only keys** — auto-detects provider, maps models

## Source of Truth

- Active backlog: [BACKLOG.md](./BACKLOG.md)
- Current state: [STATUS.md](./STATUS.md)
- Testing: [TESTING_GUIDE.md](./TESTING_GUIDE.md)
