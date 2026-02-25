# Days 3-4 Execution Plan: Skills & Demo Prep

**Created:** February 24, 2026 (Evening)
**Demo:** Thursday, February 27, 2026
**Focus:** Skills Management + Organization Templates Demo

---

## Tonight (Day 2 Evening) - Feb 24, 6pm-10pm

**Goal:** Foundation work for Skills UI - backend only, no UI yet

### Session 1: Skills Backend (2 hours)

**Tasks:**
1. Install `gray-matter` dependency
   ```bash
   cd SYSTEM/dashboard
   npm install gray-matter
   ```

2. Create `server/lib/skills.ts` - OpenClaw skills loader
   - `listAvailableSkills()` - scan OpenClaw repo + ~/.openclaw/skills
   - `parseSkillFile()` - parse SKILL.md with gray-matter
   - `getSkillById(id)` - lookup skill by name
   - `getAgentSkills(agentId)` - read from openclaw.json
   - `setAgentSkills(agentId, skillIds)` - write to openclaw.json

3. Create `server/routes/skills.ts` - API endpoints
   - `GET /api/skills` - list all available skills
   - `GET /api/skills/:skillId` - get skill details
   - `GET /api/agents/:id/skills` - get agent's assigned skills
   - `PUT /api/agents/:id/skills` - update agent skills
   - `POST /api/skills/validate` - validate skills exist

4. Test API endpoints with curl
   ```bash
   curl http://localhost:3001/api/skills
   curl http://localhost:3001/api/skills/github
   curl http://localhost:3001/api/agents/engineer/skills
   ```

**Deliverable:** Working skills API returning 53 OpenClaw skills

### Session 2: OpenClaw Config Integration (1.5 hours)

**Tasks:**
1. Update `server/lib/agents.ts` to read/write skills from `openclaw.json`
   - Load `~/.openclaw/openclaw.json`
   - Find agent by ID in `agents.list[]`
   - Add `skills?: { allowBundled?: string[] }` to agent config
   - Save changes back to openclaw.json

2. Create helper functions
   ```typescript
   function loadOpenClawConfig(): OpenClawConfig
   function saveOpenClawConfig(config: OpenClawConfig): void
   function getAgentFromConfig(agentId: string): AgentConfig | null
   function updateAgentSkills(agentId: string, skills: string[]): void
   ```

3. Test writing skills to openclaw.json
   ```bash
   curl -X PUT http://localhost:3001/api/agents/engineer/skills \
     -H "Content-Type: application/json" \
     -d '{"skills": ["github", "git", "golang"]}'

   # Verify in openclaw.json:
   cat ~/.openclaw/openclaw.json | jq '.agents.list[] | select(.id=="engineer")'
   ```

**Deliverable:** Skills persist to openclaw.json correctly

### Session 3: Testing & Validation (30 min)

**Tasks:**
1. Manual testing checklist:
   - ✓ GET /api/skills returns 53 skills
   - ✓ Skills have name, description, emoji
   - ✓ PUT updates openclaw.json
   - ✓ GET reads skills back correctly
   - ✓ Skills validation endpoint works

2. Error handling:
   - Invalid agent ID returns 404
   - Invalid skill ID returns 400 with error message
   - openclaw.json parsing errors handled gracefully

**Deliverable:** Backend fully tested and working

**Tonight Total:** ~4 hours
**Commit:** "feat(skills): Add OpenClaw skills API backend"

---

## Tomorrow (Day 3) - Feb 25, Full Day

**Goal:** Complete Skills UI + Agent Detail integration

### Morning Session 1: Skills Components (2 hours, 9am-11am)

**Tasks:**
1. Create `client/src/components/SkillCard.tsx`
   - Display skill name, emoji, description
   - Show "bundled" badge
   - Show requirements (bins, config) if any
   - Click to expand for installation instructions

2. Create `client/src/components/AddSkillsModal.tsx`
   - Grid layout of all skills (4 cols)
   - Multi-select with checkboxes
   - Search/filter by name
   - Category filter (all, development, communication, etc.)
   - Selected count badge
   - "Add Selected" and "Cancel" buttons

3. Create `client/src/components/SkillsPanel.tsx`
   - Section in Agent Detail page
   - Show assigned skills as badges with emoji
   - "➕ Add Skills" button
   - Remove skill button (× on each badge)
   - Empty state: "No skills assigned"

**Deliverable:** 3 working components in isolation

### Morning Session 2: Agent Detail Integration (1.5 hours, 11am-12:30pm)

**Tasks:**
1. Update `client/src/pages/AgentDetail.tsx`
   - Add "Skills & Tools" tab (between General and Communities)
   - Render SkillsPanel component
   - Load agent skills on mount: `GET /api/agents/:id/skills`
   - Handle add/remove skills with optimistic updates

2. Add skills state management
   ```typescript
   const [assignedSkills, setAssignedSkills] = useState<string[]>([])
   const [allSkills, setAllSkills] = useState<OpenClawSkill[]>([])
   const [showAddModal, setShowAddModal] = useState(false)

   const handleAddSkills = async (skillIds: string[]) => {
     await fetch(`/api/agents/${id}/skills`, {
       method: 'PUT',
       body: JSON.stringify({ skills: [...assignedSkills, ...skillIds] })
     })
     setAssignedSkills(prev => [...prev, ...skillIds])
   }
   ```

3. Wire up AddSkillsModal
   - Open on "➕ Add Skills" click
   - Filter out already-assigned skills
   - Call handleAddSkills on confirm

**Deliverable:** Skills tab working in Agent Detail page

### Lunch Break (30 min, 12:30pm-1pm)

### Afternoon Session 1: Templates Integration (2 hours, 1pm-3pm)

**Tasks:**
1. Update template schemas to include skills
   - Agent template: add `skills?: string[]` to agent objects
   - Org template: same for each agent
   - Update TypeScript types

2. Update `server/lib/templates.ts`
   - `exportAgentAsTemplate()` - include agent's skills array
   - `exportOrganizationTemplate()` - include skills for all agents
   - `importAgentTemplate()` - validate skills exist, apply to agent
   - `importOrganizationTemplate()` - validate skills for all agents

3. Update `SaveAsTemplatePanel.tsx`
   - Show skills count in template metadata
   - Preview skills in template confirmation

4. Update `ApplyOrgTemplateModal.tsx`
   - Show skills that will be assigned
   - Show warning if skills missing (but allow continue)

**Deliverable:** Templates include and restore skills

### Afternoon Session 2: Polish & UX (1.5 hours, 3pm-4:30pm)

**Tasks:**
1. Skills UI polish:
   - Add loading states (skeleton cards)
   - Add error handling (skill load failed)
   - Add toast notifications ("Skills updated successfully")
   - Add skill categories for filtering (infer from skill metadata)

2. Agent Detail improvements:
   - Show skill count in tab label: "Skills & Tools (3)"
   - Add tooltips on skill badges (show full description)
   - Add "View all 53 skills" link → opens AddSkillsModal

3. Visual design:
   - Consistent badge styling (match communities/groups)
   - Skill emoji size/alignment
   - Grid responsive (4 cols desktop, 2 cols tablet, 1 col mobile)

**Deliverable:** Polished, production-ready Skills UI

### Afternoon Session 3: Testing & Bug Fixes (1 hour, 4:30pm-5:30pm)

**Tasks:**
1. E2E testing workflow:
   - Create new agent → assign skills → verify in Agent Detail
   - Save agent as template → verify skills in template.json
   - Import template → verify skills restored
   - Export org template → import to new agents → verify skills

2. Edge case testing:
   - Agent with no skills
   - Assign 10+ skills (UI overflow)
   - Remove all skills
   - Invalid skill ID (should show error)

3. Cross-browser testing (Chrome, Safari)

**Deliverable:** No critical bugs, smooth UX

### Evening: Commit & Prepare Demo (1 hour, 5:30pm-6:30pm)

**Tasks:**
1. Commit all work:
   ```bash
   git add .
   git commit -m "feat(skills): Add Skills & Tools management UI

   - Skills browser with 53 OpenClaw bundled skills
   - Add/remove skills from agents via UI
   - Skills included in agent/org templates
   - Skills persist to openclaw.json
   "
   ```

2. Create demo script (DEMO_SCRIPT.md):
   - Scenario 1: Browse skills library
   - Scenario 2: Assign skills to engineer agent
   - Scenario 3: Save agent as template with skills
   - Scenario 4: Export org → import with skills

3. Test demo scenarios end-to-end

**Tomorrow Total:** ~8 hours
**Deliverable:** Complete Skills & Tools management system

---

## Thursday (Day 4) - Feb 27, Demo Day

**Goal:** Final polish, testing, demo prep

### Morning Session: Final Polish (2 hours, 9am-11am)

**Tasks:**
1. UI/UX final pass:
   - Fix any visual inconsistencies
   - Ensure all loading states work
   - Check error messages are user-friendly
   - Test all toast notifications

2. Performance check:
   - Skills load quickly (cache if needed)
   - Agent Detail page responsive
   - No console errors

3. Documentation:
   - Update README with Skills section
   - Add screenshots to docs
   - Update CHANGELOG.md

**Deliverable:** Production-ready UI

### Mid-Morning: Demo Dry Run #1 (1 hour, 11am-12pm)

**Tasks:**
1. Run through full demo script
2. Time each scenario (aim for 2-3 min each)
3. Note any hiccups or awkward moments
4. Prepare talking points for each feature

**Deliverable:** Smooth demo flow

### Lunch Break (1 hour, 12pm-1pm)

### Afternoon Session 1: Organization Overview Enhancements (2 hours, 1pm-3pm)

**Optional (if time permits):**
1. Add skills visualization to Organization Overview page:
   - Show skill distribution across agents
   - "Skills Matrix" view (agents × skills grid)
   - Most used skills chart

2. Add org-level skills summary:
   - "This organization uses 12 skills across 11 agents"
   - Top 5 most used skills with counts

**Deliverable:** Enhanced org visualization (optional)

### Afternoon Session 2: Demo Dry Run #2 (1 hour, 3pm-4pm)

**Tasks:**
1. Full demo rehearsal with enhancements
2. Practice transitions between scenarios
3. Prepare for Q&A:
   - "How do skills get executed?" → OpenClaw handles that
   - "Can I add custom skills?" → Yes, via ~/.openclaw/skills
   - "How do I install missing skills?" → UI shows install commands

**Deliverable:** Confident demo delivery

### Pre-Demo: Final Checks (30 min, 30 min before demo)

**Tasks:**
1. Restart dev servers (clean state)
2. Clear browser cache
3. Reset test data (known good state)
4. Have backup plan ready (screenshots if live demo fails)
5. Open demo script in separate window

**Deliverable:** Ready for showtime

---

## Demo Structure (10-15 minutes)

### Act 1: Organization Templates (5 min)
1. **Show Organization Overview**
   - "We have 11 agents across 4 communities and 9 groups"
   - Expand/collapse to show structure
   - "This is the Maximilien.ai organization"

2. **Export as Template**
   - Click "Export as Template" button
   - Show modal with metadata (name, description, tags)
   - Save template
   - Switch to Templates page → show new org template

3. **Apply Template**
   - Click on template → "Apply Template"
   - Show customization modal (prefix/suffix for agent IDs)
   - Preview: "engineer → test-engineer"
   - Apply → creates 11 new agents instantly

### Act 2: Skills & Tools (5 min)
1. **Skills Library**
   - "OpenClaw has 53 bundled skills"
   - Browse skills grid: github 🐙, slack 💬, notion, etc.
   - Click on github skill → show description, requirements

2. **Assign Skills to Agent**
   - Open engineer agent → Skills & Tools tab
   - Click "Add Skills"
   - Select: github, git, golang, docker
   - Show assigned skills with emoji badges

3. **Skills in Templates**
   - Save engineer as template
   - Show template includes skills
   - Import template → skills automatically assigned

### Act 3: Complete Workflow (3 min)
1. **Build Organization from Scratch**
   - Start with empty workspace (or use test workspace)
   - Import organization template
   - All agents created with:
     - ✓ Communities and groups
     - ✓ Skills and tools
     - ✓ Configurations
   - "5 seconds to deploy a whole team"

2. **What's Next**
   - Multi-workspace support (in progress)
   - Template marketplace
   - Skills execution engine

### Q&A (2 min)

---

## Success Metrics

**Must Have (Demo Blockers):**
- ✅ 53 skills load from OpenClaw
- ✅ Can assign skills to agents via UI
- ✅ Skills persist to openclaw.json
- ✅ Skills included in templates
- ✅ Organization export/import works
- ✅ No critical bugs during demo

**Nice to Have:**
- Skills categories/filtering
- Skills installation UI
- Org-level skills visualization
- Template validation warnings

**Known Limitations (Call Out During Demo):**
- Skills are assigned but not executed (OpenClaw handles execution)
- Multi-workspace coming in Phase 4
- Template marketplace is future work

---

## Contingency Plans

**If Skills API Fails:**
- Fall back to showing mock data in UI
- Focus demo on org templates (already working)

**If Demo Environment Breaks:**
- Have screenshots ready
- Narrate with visual aids
- Show code/architecture instead

**If Time Runs Short:**
- Skip Skills section, focus on org templates
- Or skip org templates, focus on skills (less impressive)

**If Questions Go Deep:**
- "Great question! Let's discuss after the demo"
- Defer to design doc for details

---

## Post-Demo (After Thursday)

**Immediate (Friday):**
1. Gather feedback from demo
2. Create GitHub issues for bugs found
3. Update roadmap based on feedback

**Week 2 (Days 5-7):**
1. Organization metadata persistence (ORGANIZATION.md)
2. Workspace-aware API refactoring
3. Begin multi-workspace foundation

**Week 3 (Days 8-10):**
1. Multi-workspace implementation
2. Workspace switcher UI
3. Migration script

**Week 4 (Days 11-12):**
1. Polish and testing
2. Documentation
3. Production deployment

---

## Time Tracking

| Session | Estimated | Actual | Notes |
|---------|-----------|--------|-------|
| Tonight Backend | 4h | | |
| Tomorrow AM Components | 3.5h | | |
| Tomorrow PM Templates | 3.5h | | |
| Thursday Polish | 5h | | |
| **Total** | **16h** | | |

---

**Ready to Execute! 🚀**

*Last Updated: Feb 24, 2026 7:00 PM*
