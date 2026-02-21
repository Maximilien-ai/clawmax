# 3-Day Sprint Plan — February 21-23, 2026 (UPDATED)

**Time Budget:** 2-4 hours total (weekend work)
**Status:** 🟢 In Progress
**Owner:** Dr. Maximilien
**Updated:** 2026-02-21 10:00 AM PT

---

## ✅ Friday, Feb 21 — COMPLETED

**Dashboard Polish Session (2.5 hours)**

### Completed Features:
1. ✅ Fixed scrolling on all dashboard pages (`flex-1 overflow-auto`)
2. ✅ Fixed typing indicators in group chat (state closure bug)
3. ✅ Fixed gateway detection (`openclaw` CLI vs `openclaw-gateway`)
4. ✅ Fixed wizard hesitation on clone (skip initial fetch)
5. ✅ Added agent debug viewer modal (Health + Gateway Status tabs)
6. ✅ Added system logs streaming modal (Activity page)
7. ✅ Added human-friendly health display with JSON toggle
8. ✅ Added document navigation from Activity tab
9. ✅ Verified crash protection already in place (server/index.ts:16-58)

### Commits: 6 feature/fix commits
- `fix(dashboard): Fix scrolling, typing indicators, and gateway detection`
- `feat(dashboard): Add agent debug viewer and fix wizard hesitation`
- `refactor(dashboard): Improve agent debug UX with system logs and friendly health view`
- `feat(dashboard): Add document navigation from Activity tab`
- `fix(dashboard): Move system logs endpoint to main server`

**Result:** Dashboard is now production-ready with excellent UX ✨

---

## 📅 Saturday, Feb 22 — Schema Validation + Group Management UI

**Estimated Time:** 2-2.5 hours total

---

### Session 1: AGENTS.md Schema (1 hour)

**Goal:** Validate agent configuration to prevent broken discovery

**Tasks:**
1. Create `server/schemas/agents.schema.json`
   - Validate agent ID format (`^[a-zA-Z][a-zA-Z0-9_-]*$`)
   - Require: id, name, status, created
   - Optional: whatsapp_number, tags, model, description
2. Add `validateAgents()` to `server/lib/validator.ts`
3. Integrate validation in `server/lib/workspace.ts` agent discovery
4. Update `GET /api/agents` to return validation warnings
5. Show validation errors in agent cards (dashboard UI)
6. Test with invalid AGENTS.md (bad IDs, missing fields)

**Success Criteria:**
- ✅ Invalid agent IDs rejected (e.g., starting with digit)
- ✅ Missing required fields caught
- ✅ Dashboard shows validation warnings
- ✅ Clear error messages guide fixes

**Commit:** `feat(schema): Add AGENTS.md validation`

---

### Session 2: Community/Group Management UI (1-1.5 hours)

**Goal:** Add/remove agents from communities/groups via dashboard UI (no manual file editing)

**Design:**
- Similar to tag management popup
- Shows agent's current communities/groups
- Multi-select dropdown or tag-style chips
- Real-time validation against COMMUNITIES.md/GROUPS.md

**Implementation:**
1. **Backend Routes:**
   ```typescript
   // GET /api/agents/:id/communities
   // Returns: { communities: string[], groups: string[] }

   // POST /api/agents/:id/communities
   // Body: { communities: string[], groups: string[] }
   // Updates COMMUNITIES.md and GROUPS.md
   ```

2. **Frontend Component:**
   - Create `CommunitiesManager.tsx` modal component
   - Show current memberships as removable chips
   - Dropdown to add new communities/groups
   - Validate against existing communities/groups
   - Real-time preview of changes

3. **File Update Logic:**
   - Parse COMMUNITIES.md and GROUPS.md
   - Add/remove agent ID from `members` arrays
   - Write back to files
   - Trigger agent list refresh

4. **UI Integration:**
   - Add "🏘 Communities" button to agent detail dropdown
   - Same pattern as "🏷 Tags" button
   - Show membership count badge on agent cards

**Success Criteria:**
- ✅ Add agent to community via UI
- ✅ Remove agent from community via UI
- ✅ Changes persist to COMMUNITIES.md/GROUPS.md
- ✅ Validation prevents invalid memberships
- ✅ Real-time UI updates

**Commit:** `feat(dashboard): Add community/group management UI for agents`

---

## 📅 Sunday, Feb 23 — TOOLS.md + SOUL.md Schemas

**Estimated Time:** 1.5-2 hours total

---

### Session 1: TOOLS.md Schema (1 hour)

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

**Tasks:**
1. Create `server/schemas/tools.schema.json`
2. Add `validateTools()` to validator.ts
3. Parse TOOLS.md and validate on agent load
4. Show validation warnings in agent debug modal
5. Test permission enforcement

**Commit:** `feat(schema): Add TOOLS.md validation`

---

### Session 2: SOUL.md Structure Validation (30-45 min)

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
        "purpose": { "type": "string", "minLength": 50 },
        "personality": { "type": "string", "minLength": 50 },
        "instructions": { "type": "string", "minLength": 100 }
      }
    }
  }
}
```

**Tasks:**
1. Create `server/schemas/soul.schema.json`
2. Build markdown section parser
3. Validate section presence and minimum length
4. Show warnings (not errors) for missing sections
5. Agent creation wizard enforces structure

**Commit:** `feat(schema): Add SOUL.md structure validation`

---

### Stretch Goal: WhatsApp Groups Integration (Optional, 1 hour)

**Only if time permits**

**Goal:** Display live WhatsApp groups in dashboard Communication tab

**Tasks:**
1. Create `GET /api/whatsapp/groups` endpoint
2. Integrate with OpenClaw `groups.fetchAll` gateway method
3. Update Communication page to display groups
4. Add group metadata (name, participants, community hierarchy)
5. Implement 5-minute cache
6. Add sync button

**Commit:** `feat(dashboard): Integrate WhatsApp groups.fetchAll`

---

## 📋 Implementation Checklist

### ✅ Friday (DONE)
- [x] Fix scrolling issues
- [x] Fix typing indicators
- [x] Fix gateway detection
- [x] Add agent debug viewer
- [x] Add system logs modal
- [x] Human-friendly health display
- [x] Document navigation from Activity

### Saturday Morning ☀️
- [ ] Create `schemas/agents.schema.json`
- [ ] Implement `validateAgents()` function
- [ ] Add validation to agent discovery
- [ ] Test with invalid AGENTS.md
- [ ] Update UI for validation warnings
- [ ] ✅ Commit AGENTS.md schema

### Saturday Afternoon 🌤️
- [ ] Create `GET /api/agents/:id/communities` endpoint
- [ ] Create `POST /api/agents/:id/communities` endpoint
- [ ] Build `CommunitiesManager.tsx` component
- [ ] Add communities button to agent dropdown
- [ ] Test add/remove agent from communities
- [ ] ✅ Commit community management UI

### Sunday Session 1 🌅
- [ ] Create `schemas/tools.schema.json`
- [ ] Implement `validateTools()` function
- [ ] Parse and validate TOOLS.md
- [ ] Test permission validation
- [ ] ✅ Commit TOOLS.md schema

### Sunday Session 2 ☁️
- [ ] Create `schemas/soul.schema.json`
- [ ] Build section parser
- [ ] Add soft validation warnings
- [ ] Update agent creation wizard
- [ ] ✅ Commit SOUL.md schema

### Sunday Stretch 🚀 (Optional)
- [ ] Create `/api/whatsapp/groups` endpoint
- [ ] Integrate `groups.fetchAll`
- [ ] Update Communication page UI
- [ ] Test with live account
- [ ] ✅ Commit WhatsApp integration

---

## 🎯 Weekend Success Metrics

**Must Have (Required):**
- ✅ AGENTS.md schema validation complete
- ✅ Community/group management UI working
- ✅ TOOLS.md schema validation complete
- ✅ SOUL.md structure validation complete
- ✅ No breaking changes to existing features

**Nice to Have (Bonus):**
- ✅ WhatsApp groups integration
- ✅ Updated schema validation docs
- ✅ Agent template prep work

**Failure Modes to Avoid:**
- ❌ Schema validation breaking existing agents
- ❌ Community updates corrupting COMMUNITIES.md
- ❌ Validation too strict (blocking legitimate configs)

---

## 💡 New Feature: Community Management UI

### User Flow
1. Click agent card → dropdown menu
2. Click "🏘 Communities" button
3. Modal shows:
   - Current communities (as removable chips)
   - Current groups (as removable chips)
   - Dropdown to add new memberships
4. Changes preview before save
5. Save → Updates COMMUNITIES.md and GROUPS.md
6. Success notification + UI refresh

### Technical Details
- **File Updates:** Atomic writes to prevent corruption
- **Validation:** Must belong to valid communities/groups
- **Rollback:** On error, revert file changes
- **Real-time:** WebSocket updates for multi-user scenarios (future)

---

## 📁 Files to Create This Weekend

**New Files:**
- `server/schemas/agents.schema.json`
- `server/schemas/tools.schema.json`
- `server/schemas/soul.schema.json`
- `client/src/components/CommunitiesManager.tsx`

**Modified Files:**
- `server/lib/validator.ts` (3 new validators)
- `server/lib/workspace.ts` (validation integration + community updates)
- `server/routes/agents.ts` (communities endpoints)
- `client/src/pages/Agents.tsx` (communities button + validation warnings)

---

## 🔄 What Happens Next Week

**Monday-Friday, Feb 24-28: Agent Templates (BIG FEATURE)**

**Goal:** 1-click agent creation from templates

**Features:**
1. Template library (built-in + custom)
2. Template editor in dashboard
3. Metadata: name, description, tags, model
4. Pre-filled SOUL.md, TOOLS.md, IDENTITY.md
5. Validation against schemas
6. Clone & customize workflow

**Time Estimate:** 3-4 hours
**Builds On:** Weekend schema validation work
**Impact:** 10x faster agent creation

---

## 🎉 Expected Outcomes

**By Sunday Evening:**
1. ✅ **3 schema validators** — AGENTS, TOOLS, SOUL
2. ✅ **Community management UI** — No more manual file editing
3. ✅ **Safer agent management** — Invalid configs caught early
4. ✅ **Foundation for templates** — Templates validate against schemas
5. ✅ **Optional: WhatsApp groups** — Live group data in dashboard

**Code Quality:**
- ~500-600 new lines (schemas + validators + UI)
- 5-6 commits (one per feature)
- 100% backward compatible
- Well-tested with edge cases

**Developer Experience:**
- Clear validation errors guide fixes
- Dashboard shows validation status
- Community membership management is intuitive
- Documentation updated

---

**Status:** 🟢 Friday completed, Saturday ready to start
**Next Review:** Sunday evening — assess progress, plan Monday
**Owner:** Dr. Maximilien
**Created:** 2026-02-20
**Updated:** 2026-02-21
