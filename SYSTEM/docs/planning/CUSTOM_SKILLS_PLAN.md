# Custom Skills Import Plan

**Goal:** Allow users to import custom OpenClaw skills into agents via ClawMax dashboard

**Use Case:** MechDog hackathon - import `mechdog-control` skill and assign to agent

---

## 🎯 Current State

### How Skills Work Now
1. **Built-in Skills:** OpenClaw ships with 50+ skills (web search, file operations, etc.)
2. **Skills Discovery:** Dashboard reads from OpenClaw's skill registry via gateway
3. **Skills Assignment:** Dashboard can enable/disable built-in skills for agents
4. **Limitation:** No way to import custom skills from external repos/directories

### Skill Structure (OpenClaw)
```
skills/
└── mechdog/
    ├── skill.md       # Description, capabilities, usage
    └── index.ts       # Tool implementations (TypeScript)
```

---

## 🏗️ Proposed Solution

### Architecture

```
User uploads skill directory OR provides GitHub URL
    ↓
ClawMax Dashboard validates skill structure
    ↓
Skill copied to workspace SKILLS/ directory
    ↓
OpenClaw gateway detects new skill (watch mode or manual reload)
    ↓
Skill appears in dashboard Skills page
    ↓
User assigns skill to agents via dashboard
```

---

## 📂 Implementation Plan

### Phase 1: Workspace Skills Directory (30 min)
**Create skill storage location**

- [ ] Add `WORKSPACES/default/SKILLS/` directory
- [ ] Create `SKILLS/README.md` explaining custom skills
- [ ] Add `.gitkeep` to ensure directory exists

**Files:**
```
WORKSPACES/default/
├── AGENTS/
├── WORKFLOWS/
└── SKILLS/              # NEW
    ├── README.md
    └── custom/          # User-added skills
        └── mechdog/
            ├── skill.md
            └── index.ts
```

---

### Phase 2: Skills API Endpoints (1 hour)
**Backend API for skill management**

**New endpoints:**
- `GET /api/skills` - List all skills (built-in + custom)
- `GET /api/skills/:id` - Get skill details
- `POST /api/skills/upload` - Upload skill directory (multipart/form-data)
- `POST /api/skills/import-github` - Import from GitHub URL
- `DELETE /api/skills/:id` - Remove custom skill
- `POST /api/skills/:id/reload` - Reload skill in gateway

**Implementation:**
```typescript
// server/routes/skills.ts

// Upload skill directory
router.post('/upload', upload.single('skillDir'), async (req, res) => {
  const skillPath = path.join(getSkillsDir(), req.file.filename)

  // Validate skill structure (skill.md + index.ts exist)
  const valid = validateSkillStructure(skillPath)
  if (!valid) {
    return res.status(400).json({ error: 'Invalid skill structure' })
  }

  // Copy to SKILLS/custom/
  await fs.copy(skillPath, path.join(getSkillsDir(), 'custom', skillName))

  // Trigger OpenClaw reload (optional)
  await reloadGatewaySkills()

  res.json({ success: true, skillName })
})

// Import from GitHub
router.post('/import-github', async (req, res) => {
  const { url } = req.body // e.g., https://github.com/user/mechdog-skill

  // Clone repo to temp dir
  const tempDir = await cloneGitRepo(url)

  // Validate and copy
  const valid = validateSkillStructure(tempDir)
  if (!valid) {
    return res.status(400).json({ error: 'Invalid skill structure in repo' })
  }

  const skillName = path.basename(url, '.git')
  await fs.copy(tempDir, path.join(getSkillsDir(), 'custom', skillName))

  res.json({ success: true, skillName })
})
```

---

### Phase 3: Dashboard UI (1.5 hours)
**Add custom skill import UI**

**Location:** New "Custom Skills" section on Skills page

**Components:**

1. **Import Methods:**
   - Upload ZIP file
   - Import from GitHub URL
   - Import from local directory (future)

2. **Skills List:**
   - Built-in skills (read-only)
   - Custom skills (can delete)
   - Visual badge to distinguish

3. **Import Dialog:**
   ```tsx
   <ImportSkillDialog>
     <Tab label="Upload ZIP">
       <input type="file" accept=".zip" />
       <button>Upload & Install</button>
     </Tab>

     <Tab label="GitHub">
       <input placeholder="https://github.com/user/skill-name" />
       <button>Clone & Install</button>
     </Tab>
   </ImportSkillDialog>
   ```

4. **Custom Skill Card:**
   ```tsx
   <SkillCard skill={skill} isCustom={true}>
     <Badge>Custom</Badge>
     <button onClick={deleteSkill}>Remove</button>
     <button onClick={reloadSkill}>Reload</button>
   </SkillCard>
   ```

---

### Phase 4: OpenClaw Integration (1 hour)
**Connect to OpenClaw gateway**

**Options:**

**A. Watch Mode (Automatic)**
- OpenClaw gateway watches `SKILLS/` directory
- Auto-reloads when new skills added
- Requires OpenClaw feature (check if exists)

**B. Manual Reload (Fallback)**
- Dashboard calls OpenClaw gateway API to reload skills
- User clicks "Reload" after adding skill
- More reliable, requires user action

**Recommended: Hybrid Approach**
- Try watch mode first
- Fall back to manual reload button
- Show toast: "New skill detected, reloading..."

---

### Phase 5: Validation & Testing (30 min)

**Validation Rules:**
- [ ] `skill.md` must exist
- [ ] `index.ts` must exist
- [ ] Skill name must be valid (a-z0-9-_)
- [ ] No name conflicts with built-in skills
- [ ] TypeScript syntax check (optional, nice-to-have)

**Test Cases:**
- [ ] Upload valid skill (mechdog)
- [ ] Upload invalid skill (missing skill.md)
- [ ] Import from GitHub (valid repo)
- [ ] Import from GitHub (invalid repo)
- [ ] Delete custom skill
- [ ] Assign custom skill to agent
- [ ] Agent can use custom skill in chat

---

## 🚀 MVP for MechDog Hackathon

**Minimal viable implementation (can be done in 1 hour):**

### Quick & Dirty Approach
1. **Manual file copy:** User manually copies skill to `WORKSPACES/default/SKILLS/custom/mechdog/`
2. **Dashboard detects:** GET /api/skills scans `SKILLS/custom/` directory
3. **Skills page shows:** Custom badge on mechdog skill
4. **Assign to agent:** Standard skill assignment flow
5. **Gateway reload:** Manual reload button or restart gateway

**This works TODAY with minimal code changes!**

---

## 📊 Full Implementation Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | Workspace SKILLS/ directory | 30 min |
| 2 | API endpoints (upload + GitHub) | 1 hour |
| 3 | Dashboard UI | 1.5 hours |
| 4 | OpenClaw integration | 1 hour |
| 5 | Validation & testing | 30 min |
| **Total** | | **4.5 hours** |

---

## 🎯 Recommendation for Today

### For MechDog Hackathon (NOW):
**Use MVP approach:**
1. Manually copy mechdog skill to `SKILLS/custom/mechdog/`
2. Add quick scan in `GET /api/skills` to include custom skills
3. Assign to agent via existing UI
4. Total time: **30 minutes**

### For Week Plan (Monday):
**Implement full solution:**
- Add to Monday's bug fixes + foundation work
- Complete Phase 1-5 in 4.5 hours
- Ship in v1.1.0 as bonus feature

---

## 📝 File Structure

```
WORKSPACES/default/
├── SKILLS/
│   ├── README.md
│   └── custom/
│       ├── mechdog/
│       │   ├── skill.md
│       │   └── index.ts
│       └── another-skill/
│           ├── skill.md
│           └── index.ts
├── AGENTS/
└── WORKFLOWS/
```

---

## 🔮 Future Enhancements

- **Skill marketplace:** Browse and install skills from community
- **Skill versioning:** Track skill versions, update mechanism
- **Skill dependencies:** Declare npm/python dependencies
- **Skill templates:** Scaffold new skills from templates
- **Skill testing:** Built-in test runner for skills
- **Skill sharing:** Export skills as templates

---

**Status:** Plan created, ready for review
**Next Step:** Choose MVP or full implementation based on time constraints
