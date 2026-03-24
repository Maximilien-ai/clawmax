# Next Week Brief — February 24-28, 2026

**Focus:** Agent Templates System (BIG FEATURE)
**Time Budget:** 3-4 hours
**Priority:** High
**Builds On:** Schema validation (completed this weekend)

---

## 🎯 The Big Picture

**What:** Template-based agent creation system — like GitHub repo templates, but for agents

**Why This Matters:**
- Makes agent creation **10x faster** (60 seconds vs. 10 minutes)
- Codifies organizational best practices
- Enables rapid scaling of agent teams
- Foundation for multiagent workflows
- Shareable across teams and organizations

**User Impact:**
```
WITHOUT Templates:
1. Create agent manually
2. Write SOUL.md from scratch
3. Configure IDENTITY.md
4. Set up TOOLS.md
5. Add tags, model, settings
6. Write initial TODOs.md
⏱️ Time: 10-15 minutes per agent

WITH Templates:
1. Click "Create from Template"
2. Choose "Customer Support Agent"
3. Customize name/description
4. Click "Create"
⏱️ Time: 60 seconds per agent
```

---

## 📋 Feature Overview

### Core Capabilities
1. **Template Library** — Browse built-in and custom templates
2. **Create from Template** — One-click agent creation with pre-filled configs
3. **Template Editor** — Create/edit custom templates
4. **Organization Templates** — Define entire team structures
5. **Import/Export** — Share templates across workspaces

### Built-In Templates (v1)
1. **Customer Support Agent**
   - Empathetic personality
   - Tools: knowledge-base, ticket-system
   - Tags: support, customer-facing

2. **Research Assistant**
   - Analytical personality
   - Tools: web-search, document-analysis
   - Tags: research, analysis

3. **Code Reviewer**
   - Detail-oriented personality
   - Tools: github, code-analysis
   - Tags: engineering, code-quality

4. **Product Manager**
   - Strategic personality
   - Tools: roadmap, user-feedback
   - Tags: product, planning

5. **QA Engineer**
   - Quality-focused personality
   - Tools: test-runner, bug-tracker
   - Tags: qa, testing

---

## 🏗️ Technical Architecture

### Template Format (JSON)
```json
{
  "template_id": "customer-support-agent",
  "name": "Customer Support Agent",
  "description": "Empathetic agent for customer inquiries",
  "version": "1.0.0",
  "author": "ClawMax.ai",
  "tags": ["support", "customer-facing"],

  "files": {
    "SOUL.md": {
      "template": "# Agent Soul\n\n## Purpose\n{{PURPOSE}}\n\n## Personality\nEmpathetic, patient, and solution-oriented...",
      "variables": ["PURPOSE"]
    },
    "IDENTITY.md": {
      "template": "# Agent Identity\n\nAgent ID: {{AGENT_ID}}\nName: {{AGENT_NAME}}...",
      "variables": ["AGENT_ID", "AGENT_NAME"]
    },
    "TOOLS.md": {
      "content": "# Tools\n\n- knowledge-base (read)\n- ticket-system (write)..."
    },
    "TODOs.md": {
      "content": "# Initial Tasks\n\n- [ ] Review knowledge base\n- [ ] Set up ticket integration..."
    }
  },

  "settings": {
    "model": "openai/gpt-4o",
    "default_tags": ["support", "customer-facing"],
    "tools": [
      {"name": "knowledge-base", "permission": "read"},
      {"name": "ticket-system", "permission": "write"}
    ]
  }
}
```

### Template Variables
- `{{AGENT_ID}}` — Generated or user-provided
- `{{AGENT_NAME}}` — User-provided display name
- `{{PURPOSE}}` — User-provided purpose description
- `{{DESCRIPTION}}` — User-provided agent description
- `{{CREATED_DATE}}` — Auto-generated timestamp
- `{{AUTHOR}}` — From workspace config

---

## 🗂️ Implementation Plan

### Phase 1: Template Engine (1-1.5 hours)
**Goal:** Core template loading and variable substitution

**Backend:**
1. Create template storage structure:
   ```
   SYSTEM/templates/
     agents/
       builtin/
         customer-support.json
         research-assistant.json
         code-reviewer.json
         product-manager.json
         qa-engineer.json
       custom/
         (user-created templates)
     orgs/
       (organizational structure templates)
   ```

2. Implement template engine:
   - `server/lib/templates.ts`:
     - `loadTemplate(templateId)` — Load template JSON
     - `listTemplates()` — Get all available templates
     - `renderTemplate(template, variables)` — Substitute variables
     - `validateTemplate(template)` — Check against schema
     - `createAgentFromTemplate(templateId, variables)` — Full creation flow

3. Create API endpoints:
   - `GET /api/templates` — List available templates
   - `GET /api/templates/:id` — Get template details
   - `POST /api/templates/:id/create` — Create agent from template
   - `POST /api/templates` — Create custom template
   - `DELETE /api/templates/:id` — Delete custom template

**Success Criteria:**
- ✅ Templates load from file system
- ✅ Variable substitution works
- ✅ Template validation against schemas (from weekend work)

---

### Phase 2: Dashboard UI (1-1.5 hours)
**Goal:** Template library browser and creation wizard

**Components:**

1. **TemplateBrowser.tsx** — Template library view
   - Grid of template cards
   - Filter by tags/category
   - Search templates
   - Preview template details
   - "Use Template" button

2. **CreateFromTemplateModal.tsx** — Wizard modal
   - Step 1: Choose template
   - Step 2: Customize variables (agent name, purpose, etc.)
   - Step 3: Review generated files
   - Step 4: Confirm and create
   - Progress indicator

3. **TemplateCard.tsx** — Single template preview
   - Template name and description
   - Author and version
   - Tags
   - File preview (what gets created)
   - Use/Preview buttons

**Integration Points:**
- Add "Create from Template" button to Agents page header
- Show template library in modal overlay
- After creation, navigate to new agent detail view

**Success Criteria:**
- ✅ User can browse templates
- ✅ Creation wizard works end-to-end
- ✅ New agents created with all files populated
- ✅ Variables properly substituted

---

### Phase 3: Built-In Templates (30-45 min)
**Goal:** Create 5 production-ready templates

**Tasks:**
1. Write `customer-support.json` template
2. Write `research-assistant.json` template
3. Write `code-reviewer.json` template
4. Write `product-manager.json` template
5. Write `qa-engineer.json` template

**Template Quality Standards:**
- Complete SOUL.md with personality, purpose, instructions
- Valid IDENTITY.md structure
- Realistic TOOLS.md configuration
- Helpful TODOs.md starter tasks
- Passes all schema validation (from weekend work)

**Success Criteria:**
- ✅ 5 templates available in library
- ✅ Each template creates valid agent
- ✅ All schemas pass validation
- ✅ Templates are useful and realistic

---

### Phase 4: Custom Templates (30-45 min - Optional)
**Goal:** Allow users to create their own templates

**Features:**
1. **Template Creator UI**
   - Form to define template metadata
   - File editors for SOUL, IDENTITY, TOOLS, TODOs
   - Variable marker insertion (`{{VAR_NAME}}`)
   - Save to custom templates directory

2. **Template Management**
   - Edit existing custom templates
   - Delete custom templates
   - Export template as JSON
   - Import template from JSON

**Success Criteria:**
- ✅ Users can create custom templates
- ✅ Custom templates appear in library
- ✅ Templates can be edited/deleted
- ✅ Import/export works

---

## 📋 Week-by-Week Checklist

### Monday, Feb 24 (1.5 hours)
**Focus:** Template Engine Backend

- [ ] Create `SYSTEM/templates/` directory structure
- [ ] Create `server/lib/templates.ts` with core functions
- [ ] Implement `loadTemplate()`, `listTemplates()`, `renderTemplate()`
- [ ] Add schema validation integration
- [ ] Create API endpoints for templates
- [ ] Test template loading and variable substitution
- [ ] Commit: `feat(templates): Add template engine and API`

**Milestone:** Template engine functional, can load and render templates

---

### Tuesday, Feb 25 (1.5 hours)
**Focus:** Dashboard UI

- [ ] Create `TemplateBrowser.tsx` component
- [ ] Create `CreateFromTemplateModal.tsx` wizard
- [ ] Create `TemplateCard.tsx` component
- [ ] Add "Create from Template" button to Agents page
- [ ] Wire up state management
- [ ] Test end-to-end creation flow
- [ ] Commit: `feat(templates): Add template browser and creation wizard UI`

**Milestone:** Users can create agents from templates via UI

---

### Wednesday, Feb 26 (45 min)
**Focus:** Built-In Templates (Part 1)

- [ ] Write `customer-support.json` template
- [ ] Write `research-assistant.json` template
- [ ] Write `code-reviewer.json` template
- [ ] Test templates create valid agents
- [ ] Commit: `feat(templates): Add Customer Support, Research Assistant, and Code Reviewer templates`

**Milestone:** 3 production templates available

---

### Thursday, Feb 27 (45 min)
**Focus:** Built-In Templates (Part 2) + Testing

- [ ] Write `product-manager.json` template
- [ ] Write `qa-engineer.json` template
- [ ] Test all 5 templates thoroughly
- [ ] Validate against schemas
- [ ] Fix any validation issues
- [ ] Commit: `feat(templates): Add Product Manager and QA Engineer templates`

**Milestone:** 5 complete templates, all validated

---

### Friday, Feb 28 (Optional - 1 hour)
**Focus:** Custom Templates + Polish

- [ ] (Optional) Create template editor UI
- [ ] (Optional) Add import/export functionality
- [ ] Update documentation in AGENT_TEMPLATES.md
- [ ] Add screenshots/examples
- [ ] Create user guide for templates
- [ ] Commit: `feat(templates): Add custom template creator and documentation`

**Milestone:** Feature complete with documentation

---

## 🎯 Success Metrics

**Must Have (Core Feature):**
- ✅ Template engine loads and renders templates
- ✅ 5 built-in templates available
- ✅ Dashboard UI for browsing and creating from templates
- ✅ Agents created from templates pass schema validation
- ✅ End-to-end flow works (browse → customize → create)

**Nice to Have (Enhancements):**
- ✅ Custom template creator
- ✅ Import/export templates
- ✅ Template versioning
- ✅ Organization-level templates

**Stretch Goals (Future):**
- Template marketplace (share across orgs)
- Template analytics (most used, success rates)
- Multiagent templates (create teams, not just individuals)

---

## 🔗 Integration Points

### Dependencies (from weekend)
- **Schema Validation** — Templates must validate against AGENTS.md, TOOLS.md, SOUL.md schemas
- **Agent Creation** — Reuses existing Add Agent wizard backend
- **File System** — Uses workspace file management utilities

### Future Connections
- **Multiagent Workflows** — Templates for entire teams
- **WhatsApp Integration** — Templates with pre-configured groups
- **Analytics** — Track which templates are most successful

---

## 💡 Design Decisions

### Why JSON for Templates?
- Easy to parse and validate
- Supports nested structures
- JSON Schema validation built-in
- Human-readable and editable
- Works with existing tools

### Why Variable Substitution?
- Flexibility without complexity
- Users customize key parts
- Keeps templates DRY
- Easy to understand (`{{VAR}}` syntax)

### Why Built-In + Custom?
- Built-in: Fast start for common use cases
- Custom: Flexibility for unique needs
- Best of both worlds

---

## 📊 Expected Impact

**Before Templates:**
- Average time to create agent: 10-15 minutes
- Agent quality: Varies (depends on user effort)
- Onboarding friction: High (need to learn all configs)
- Scaling: Linear (each agent takes same time)

**After Templates:**
- Average time to create agent: **60 seconds**
- Agent quality: **Consistent** (follows best practices)
- Onboarding friction: **Low** (pick template, customize name)
- Scaling: **Exponential** (create 10 agents as fast as 1)

**Organizational Impact:**
- **Spin up entire departments** in minutes
- **Share proven configurations** across teams
- **Iterate faster** on agent designs
- **Lower barrier to entry** for new users

---

## 🎉 What Success Looks Like

**By End of Week:**

1. **Template Library Live**
   - 5 built-in templates
   - Clean, browsable UI
   - Search and filter working

2. **One-Click Agent Creation**
   - User clicks "Create from Template"
   - Customizes 2-3 fields
   - Agent created in <60 seconds
   - All files populated correctly

3. **Quality Assurance**
   - All templates pass schema validation
   - Generated agents work immediately
   - No manual file editing needed

4. **Foundation for Future**
   - Custom template support ready
   - Organization templates possible
   - Template versioning planned

---

## 📚 Reference Documents

- `AGENT_TEMPLATES.md` — Full feature spec (updated with schedule)
- `SCHEMA_VALIDATION_EXPANSION.md` — Schema integration
- `3DAY_PLAN_FEB21-23.md` — Weekend schema work (prerequisite)
- `WEEKEND_WORK_SUMMARY.md` — Context on recent work

---

**Status:** 🟢 Ready to start Monday, Feb 24
**Prerequisite:** Complete weekend schema validation
**Owner:** Dr. Maximilien
**Created:** 2026-02-20
