# 3-Day Sprint Plan — February 21-23, 2026

**Time Budget:** 2-4 hours total (weekend work)
**Status:** 🟢 Ready to execute
**Owner:** Dr. Maximilien

---

## 📅 Day-by-Day Breakdown

### **Friday, Feb 21** — Rest & Prep
- ✅ Planning complete
- ✅ Dashboard server running and healthy
- ✅ Multiagent group chat archived (completed)
- ✅ Weekend plan documented

**No coding today** — you've earned it! 🎉

---

### **Saturday, Feb 22** — Crash Protection + AGENTS.md Schema

#### Morning Session (15-20 min) — 🛡️ Crash Protection
**Goal:** Never lose crash diagnostics again

**Tasks:**
1. Create `server/logs/` directory with `.gitkeep`
2. Add error handlers to `server/index.ts`:
   ```typescript
   process.on('uncaughtException', (err) => {
     fs.appendFileSync('server/logs/crash.log',
       `[${new Date().toISOString()}] UNCAUGHT EXCEPTION\n${err.stack}\n\n`)
     process.exit(1)
   })

   process.on('unhandledRejection', (reason) => {
     fs.appendFileSync('server/logs/crash.log',
       `[${new Date().toISOString()}] UNHANDLED REJECTION\n${reason}\n\n`)
   })
   ```
3. Log server start/stop events
4. Test with intentional error
5. Commit: `feat(dashboard): Add crash logging and error handlers`

**Success:** Crashes are now logged to file with timestamps and stack traces

---

#### Main Session (1-1.5 hours) — 📋 AGENTS.md Schema

**Goal:** Validate agent configuration files to prevent broken agent discovery

**Schema Design:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["agents"],
  "properties": {
    "agents": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "status", "created"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$"
          },
          "name": { "type": "string", "minLength": 1 },
          "status": {
            "enum": ["active", "inactive", "archived"]
          },
          "created": {
            "type": "string",
            "format": "date-time"
          },
          "whatsapp_number": {
            "type": "string",
            "pattern": "^\\+[1-9]\\d{1,14}$"
          },
          "tags": {
            "type": "array",
            "items": { "type": "string" }
          },
          "model": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    }
  }
}
```

**Implementation Steps:**
1. Create `server/schemas/agents.schema.json`
2. Update `server/lib/validator.ts` to add `validateAgents()` function
3. Add validation to agent discovery in `server/lib/workspace.ts`
4. Update `GET /api/agents` to return validation warnings
5. Test with valid and invalid AGENTS.md files
6. Update dashboard UI to show validation errors in agent cards
7. Commit: `feat(schema): Add AGENTS.md validation`

**Success Criteria:**
- ✅ Invalid agent IDs rejected (e.g., starting with digit)
- ✅ Missing required fields caught
- ✅ Dashboard shows validation warnings
- ✅ Clear error messages guide fixes

---

### **Sunday, Feb 23** — TOOLS.md + SOUL.md Schemas

#### Session 1 (1 hour) — 🔧 TOOLS.md Schema

**Goal:** Validate tool configurations and prevent permission escalation

**Schema Design:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["tools"],
  "properties": {
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "enabled", "permission"],
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9-]*$"
          },
          "enabled": { "type": "boolean" },
          "permission": {
            "enum": ["read", "write", "admin"]
          },
          "description": { "type": "string" },
          "config": { "type": "object" }
        }
      }
    }
  }
}
```

**Implementation Steps:**
1. Create `server/schemas/tools.schema.json`
2. Add `validateTools()` to validator
3. Integrate with agent loading/editing
4. Test permission enforcement
5. Commit: `feat(schema): Add TOOLS.md validation`

**Success Criteria:**
- ✅ Tool names follow naming convention
- ✅ Invalid permissions rejected
- ✅ Required fields enforced

---

#### Session 2 (30-45 min) — 📖 SOUL.md Structure Validation

**Goal:** Ensure agents have proper instruction structure (soft validation)

**Schema Design:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["sections"],
  "properties": {
    "sections": {
      "type": "object",
      "required": ["purpose", "personality", "instructions"],
      "properties": {
        "purpose": {
          "type": "string",
          "minLength": 50
        },
        "personality": {
          "type": "string",
          "minLength": 50
        },
        "instructions": {
          "type": "string",
          "minLength": 100
        }
      }
    }
  }
}
```

**Implementation Steps:**
1. Create `server/schemas/soul.schema.json`
2. Add markdown section parser to validator
3. Validate section presence and minimum length
4. Show warnings (not errors) for missing sections
5. Commit: `feat(schema): Add SOUL.md structure validation`

**Success Criteria:**
- ✅ Missing required sections flagged
- ✅ Agent creation wizard enforces structure
- ✅ Warnings don't block agent creation (soft validation)

---

#### Stretch Goal (1-2 hours) — 📱 WhatsApp Groups Integration

**Only if time permits after schema work**

**Goal:** Display live WhatsApp groups in dashboard

**Implementation:**
1. Create `GET /api/whatsapp/groups` endpoint
2. Integrate with OpenClaw `groups.fetchAll` gateway method
3. Update Communication page to display groups
4. Add group metadata (name, participants, community hierarchy)
5. Implement 5-minute cache
6. Commit: `feat(dashboard): Integrate WhatsApp groups.fetchAll`

**Success Criteria:**
- ✅ Live WhatsApp groups displayed
- ✅ Sync button refreshes data
- ✅ Community/channel hierarchy shown

---

## 📋 Implementation Checklist

### Saturday Morning ☀️
- [ ] Create `server/logs/` directory
- [ ] Add uncaught exception handler
- [ ] Add unhandled rejection handler
- [ ] Log server lifecycle events
- [ ] Test crash logging
- [ ] ✅ Commit crash protection

### Saturday Main 🔨
- [ ] Create `schemas/agents.schema.json`
- [ ] Implement `validateAgents()` function
- [ ] Add validation to agent discovery
- [ ] Test with invalid AGENTS.md
- [ ] Update UI for validation warnings
- [ ] ✅ Commit AGENTS.md schema

### Sunday Session 1 🌅
- [ ] Create `schemas/tools.schema.json`
- [ ] Implement `validateTools()` function
- [ ] Test permission validation
- [ ] ✅ Commit TOOLS.md schema

### Sunday Session 2 ☁️
- [ ] Create `schemas/soul.schema.json`
- [ ] Build section parser
- [ ] Add soft validation warnings
- [ ] ✅ Commit SOUL.md schema

### Sunday Stretch 🚀
- [ ] Create `/api/whatsapp/groups` endpoint
- [ ] Integrate `groups.fetchAll`
- [ ] Update Communication page UI
- [ ] Test with live account
- [ ] ✅ Commit WhatsApp integration

---

## 🎯 Weekend Success Metrics

**Must Have (Required):**
- ✅ Crash logging and error handlers working
- ✅ AGENTS.md schema validation complete
- ✅ TOOLS.md schema validation complete
- ✅ Clear error messages for validation failures
- ✅ No breaking changes to existing features

**Nice to Have (Bonus):**
- ✅ SOUL.md structure validation
- ✅ WhatsApp groups integration
- ✅ Updated schema validation docs

**Failure Modes to Avoid:**
- ❌ Schema validation breaking existing agents
- ❌ Error handlers causing server crashes
- ❌ Validation too strict (blocking legitimate configs)

---

## 💡 Implementation Tips

### Schema Validation Best Practices
1. **Test with real data first** — Use existing AGENTS.md files
2. **Start permissive** — Add strictness incrementally
3. **Clear error messages** — Include fix suggestions
4. **Non-blocking warnings** — Don't break existing agents

### Error Handling Best Practices
1. **Always log stack traces** — Critical for debugging
2. **Include timestamps** — Know when crashes happened
3. **Don't swallow errors** — Let them crash (after logging)
4. **Test error paths** — Intentionally trigger errors

### Time Management
- **Timebox each task** — Don't perfectionate
- **Commit frequently** — One feature per commit
- **Skip stretch goals if behind** — Schema validation is priority

---

## 🔄 What Happens After Weekend

**Monday-Friday, Feb 24-28:** Agent Templates (BIG FEATURE)
- See `NEXT_WEEK_BRIEF.md` for details
- Builds on schema validation completed this weekend
- 3-4 hour implementation
- Enables 10x faster agent creation

---

## 📁 Files to Create This Weekend

**New Files:**
- `server/logs/.gitkeep`
- `server/schemas/agents.schema.json`
- `server/schemas/tools.schema.json`
- `server/schemas/soul.schema.json`
- `server/logs/crash.log` (auto-generated)

**Modified Files:**
- `server/index.ts` (error handlers)
- `server/lib/validator.ts` (new validators)
- `server/lib/workspace.ts` (validation integration)
- `server/routes/agents.ts` (validation warnings)
- `client/src/pages/Agents.tsx` (display warnings)
- Optional: `server/routes/whatsapp.ts` (stretch goal)

---

## 🎉 Expected Outcomes

**By Sunday Evening:**
1. **Production-ready error handling** — Never lose crash data
2. **3 new schema validators** — AGENTS, TOOLS, SOUL
3. **Safer agent management** — Invalid configs caught early
4. **Foundation for templates** — Templates validate against schemas
5. **Optional: WhatsApp integration** — Live group data in dashboard

**Code Quality:**
- ~300-400 new lines (schemas + validators)
- 3-5 commits (one per feature)
- 100% backward compatible
- Well-tested with edge cases

**Developer Experience:**
- Clear validation errors guide fixes
- Dashboard shows validation status
- Documentation updated in SCHEMA_VALIDATION_EXPANSION.md

---

**Status:** 🟢 Ready to execute Saturday morning
**Next Review:** Sunday evening — assess progress, plan Monday start
**Owner:** Dr. Maximilien
**Created:** 2026-02-20
