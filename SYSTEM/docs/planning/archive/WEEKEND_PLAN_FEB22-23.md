# Weekend Development Plan — February 22-23, 2026

**Time Budget:** 2-4 hours
**Focus:** Schema Validation Infrastructure + WhatsApp Integration (if time permits)

---

## 🎯 Primary Goal: Schema Validation Expansion

Building on existing validation for COMMUNITIES.md, GROUPS.md, and IDENTITY.md.

### Saturday Focus (1.5-2 hours)

#### Task 1: AGENTS.md Schema Validation (1-1.5 hours)
**Why Critical:** Controls which agents exist and are active in the system. Invalid data breaks dashboard agent discovery.

**Schema Requirements:**
- Agent ID format validation (alphanumeric + dash/underscore, no leading digit)
- Status field: `active` | `inactive` | `archived`
- Required fields:
  - `id` (string)
  - `name` (string)
  - `status` (enum)
  - `created` (ISO date)
- Optional fields:
  - `whatsapp_number` (E.164 format)
  - `tags` (array of strings)
  - `model` (string)
  - `description` (string)

**Files to Modify:**
- Create `SYSTEM/dashboard/server/schemas/agents.schema.json`
- Update `SYSTEM/dashboard/server/lib/schema-validator.ts` (if needed)
- Add validation endpoint or file-watch validation

**Success Criteria:**
- ✅ Invalid AGENTS.md entries are caught on save/load
- ✅ Clear error messages guide users to fix issues
- ✅ Dashboard agent roster shows validation warnings

---

### Sunday Focus (1-2 hours)

#### Task 2: TOOLS.md Schema Validation (1 hour)
**Why Critical:** Defines agent capabilities. Invalid tool configs = broken agents or security issues.

**Schema Requirements:**
- Tool name format (lowercase-with-dashes)
- Permission levels: `read` | `write` | `admin`
- Required fields:
  - `name` (string)
  - `enabled` (boolean)
  - `permission` (enum)
- Optional fields:
  - `description` (string)
  - `config` (object, freeform)

**Files to Modify:**
- Create `SYSTEM/dashboard/server/schemas/tools.schema.json`
- Add validation to dashboard tool management UI (if exists)

**Success Criteria:**
- ✅ Invalid tool configurations rejected
- ✅ Permission escalation prevented
- ✅ Tools page shows validation status

#### Task 3: SOUL.md Basic Structure Validation (30-45 min - Optional)
**Why Useful:** Ensures agents have proper instructions, though mostly free-form.

**Schema Requirements:**
- Required sections (presence check only):
  - `## Purpose`
  - `## Personality`
  - `## Instructions`
- Minimum content length per section (e.g., 50 chars)
- No deep validation of content (stays free-form)

**Files to Modify:**
- Create `SYSTEM/dashboard/server/schemas/soul.schema.json`
- Add section presence validator

**Success Criteria:**
- ✅ SOUL.md without required sections shows warning
- ✅ Agent creation wizard enforces structure

---

## 🛡️ Quick Win: Dashboard Crash Protection (15-20 min)

**Why Critical:** Server went down today with no crash logs. Need resilience + diagnostics.

**Implementation:**
- Add uncaught exception handler to `server/index.ts`
- Write errors to `server/logs/crash.log`
- Add process.on('unhandledRejection') handler
- Log server start/stop events with timestamps
- Optional: Add PM2 config for auto-restart

**Files to Modify:**
- `SYSTEM/dashboard/server/index.ts` (add error handlers)
- Create `SYSTEM/dashboard/server/logs/` directory
- Optional: `SYSTEM/dashboard/ecosystem.config.js` (PM2 config)

**Success Criteria:**
- ✅ Crashes logged to file with stack traces
- ✅ Server lifecycle events tracked
- ✅ Can diagnose future crashes easily

---

## 🚢 Stretch Goals (if time permits)

### Option A: Logs & Status Page (1-1.5 hours)
**Prerequisite:** Crash protection complete ✅
**Priority:** High user value

**What:** Dedicated Logs & Status page in dashboard

**Features:**
- View dashboard server crash logs in UI
- Tail agent logs (from memory files or OpenClaw)
- System status overview (server uptime, memory, agent counts)
- Process list and management (optional)

**Implementation:**
1. Backend API (30-45 min):
   - `GET /api/logs/server` — Crash log viewer
   - `GET /api/logs/agents/:id` — Agent logs
   - `GET /api/status` — System metrics
2. Frontend UI (30-45 min):
   - `client/src/pages/Logs.tsx` with tabs
   - Server logs tab, Agent logs tab, Status tab
   - Auto-refresh, download logs

**Success Criteria:**
- ✅ View crash logs in dashboard
- ✅ Select and view agent logs
- ✅ See system health at a glance

**Full Spec:** See `LOGS_STATUS_PAGE.md`

---

### Option B: WhatsApp Channel Integration (1-2 hours)

**Prerequisite:** Schema validation complete OR skipped
**Time:** 1-2 hours

### Task 4: Use `groups.fetchAll` in Dashboard
**Context:** You already implemented `groups.fetchAll` gateway method in OpenClaw (branch: `feat/whatsapp-groups-fetch-all`)

**Implementation:**
- Create `/api/whatsapp/groups` endpoint in dashboard server
- Call OpenClaw gateway `groups.fetchAll` method
- Populate Communication page with real WhatsApp groups
- Display group metadata (name, participants, parent/community relationships)
- Cache groups data (5-minute TTL)

**Files to Modify:**
- `SYSTEM/dashboard/server/routes/whatsapp.ts` (new or extend existing)
- `SYSTEM/dashboard/client/src/pages/Communication.tsx`
- `SYSTEM/dashboard/server/lib/whatsapp.ts` (gateway integration)

**Success Criteria:**
- ✅ Dashboard shows live WhatsApp groups
- ✅ Groups auto-refresh on sync button click
- ✅ Community/channel hierarchy displayed correctly

---

## 📋 Implementation Checklist

### Saturday Morning (Crash Protection - 15-20 min)
- [ ] Create `server/logs/` directory
- [ ] Add uncaught exception handler to `server/index.ts`
- [ ] Add unhandled rejection handler
- [ ] Log server start/stop events
- [ ] Test crash logging (throw test error)
- [ ] Commit with message: `feat(dashboard): Add crash logging and error handlers`

### Saturday (AGENTS.md Schema - 1-1.5 hours)
- [ ] Create `schemas/agents.schema.json`
- [ ] Implement validation logic in schema validator
- [ ] Add validation to agent discovery/loading
- [ ] Test with valid and invalid AGENTS.md files
- [ ] Update dashboard UI to show validation errors
- [ ] Commit with message: `feat(schema): Add AGENTS.md validation`

### Sunday (TOOLS.md + SOUL.md Schemas)
- [ ] Create `schemas/tools.schema.json`
- [ ] Implement tool validation logic
- [ ] Test tool permission enforcement
- [ ] (Optional) Create `schemas/soul.schema.json`
- [ ] (Optional) Add section presence validator
- [ ] Commit with message: `feat(schema): Add TOOLS.md and SOUL.md validation`

### Stretch: WhatsApp Integration
- [ ] Create `/api/whatsapp/groups` endpoint
- [ ] Integrate with OpenClaw gateway `groups.fetchAll`
- [ ] Update Communication page UI
- [ ] Test with live WhatsApp account
- [ ] Add loading states and error handling
- [ ] Commit with message: `feat(dashboard): Integrate WhatsApp groups.fetchAll`

---

## 🎯 Success Metrics

**Must Have:**
- ✅ Crash logging and error handlers in place
- ✅ AGENTS.md schema validation working
- ✅ TOOLS.md schema validation working
- ✅ Clear error messages for invalid configs
- ✅ No breaking changes to existing functionality

**Nice to Have:**
- ✅ SOUL.md structure validation
- ✅ WhatsApp groups displayed in dashboard
- ✅ Documentation updated in SCHEMA_VALIDATION_EXPANSION.md

---

## 🔄 Next Week Preview: Agent & Org Templates

**Big Feature:** Reusable agent templates for faster agent creation

**Planned Work (Next Week):**
1. **Template System Architecture**
   - Template storage format (JSON or YAML)
   - Template discovery/loading
   - Template variables/placeholders

2. **Core Templates**
   - "Customer Support Agent"
   - "Research Assistant"
   - "Code Reviewer"
   - "Product Manager"
   - "QA Engineer"

3. **Dashboard Integration**
   - Template library browser
   - "Create from Template" wizard
   - Template editor (advanced)
   - Organization-level templates (shared across agents)

4. **Template Features**
   - Pre-populated SOUL.md, IDENTITY.md, TODOs.md
   - Default tags, tools, model settings
   - Customization during agent creation
   - Import/export templates

**Why Big:** Makes agent creation 10x faster, enables best practices, foundation for multi-agent workflows

---

## 📝 Notes

- **Focus on quality over quantity** — better to finish AGENTS.md + TOOLS.md well than rush all three
- **Test thoroughly** — schema validation bugs can break agent discovery
- **Document as you go** — update SCHEMA_VALIDATION_EXPANSION.md with completion status
- **Commit frequently** — one commit per schema is fine

---

**Status:** 🟢 Ready to start Saturday morning
**Owner:** Dr. Maximilien
**Last Updated:** 2026-02-20
