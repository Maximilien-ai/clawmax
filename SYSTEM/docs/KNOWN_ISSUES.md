# ClawMax Known Issues & Limitations

**Last Updated**: 2026-03-29
**Current Version**: v1.1.20

---

## Active Issues

### 1. Gateway process management
**Severity**: High
**Status**: Documented, needs CLI team fix

`SYSTEM/stop.sh` kills the shared gateway (port 18789), leaving agents unable to communicate. Agents show offline even though config is fine. Workaround: `openclaw gateway restart` after stop/start.

**Fix needed**: Process supervisor (pm2/systemd), stop.sh should not kill gateway, start.sh should verify gateway.

---

### 2. Workflow import doesn't use template's ID field
**Severity**: Medium
**Status**: Known bug

When importing a template, workflow IDs are auto-generated from names instead of using the template's `id` field. This breaks `dependsOn` references if the generated ID differs from the template ID (e.g., `coding` → `coding-sprint`).

**Workaround**: Ensure template workflow IDs match what the name-to-ID generator produces (kebab-case of name).

---

### 3. DAG dependencies not persisted during template import
**Severity**: Medium
**Status**: Known bug

`dependsOn` and `type` fields from template workflows are not passed through to `createWorkflow()` during import. Dependencies must be set manually after apply.

**Workaround**: Set dependencies via API or DAG edit mode after template apply.

---

### 4. Agent chat requires ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION
**Severity**: Low
**Status**: By design

Agent execution (chat, workflows) requires either BYOK keys, `USER_*` defaults, or `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true` in `.env`. Without this, agents fail with "No execution API keys configured".

---

### 5. DAG connector lines overlap nodes on complex layouts
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
