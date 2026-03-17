# ClawMax Feature Requests & Roadmap

**Last Updated**: 2026-03-15
**Current Version**: v1.1.0

This document tracks feature requests from users, talks, and community feedback.

---

## 🎯 High Priority (v1.0.x Quick Wins)

### 1. Simplified Test Template
**Source**: Internal cleanup
**Priority**: P0
**Effort**: 1 hour
**Status**: Planned for this weekend

**Description**: Simplify the test org template to be a minimal testing fixture:
- 2 agents (test1, test2)
- 1 group
- 1 community
- 1 workflow
- Named "test" or "test<n>" where n is integer

**Why**: Current test template is too complex and not useful as a minimal testing fixture.

### 2. Agent Template Cleanup & Expansion
**Source**: Internal cleanup + user feedback
**Priority**: P0
**Effort**: 2 hours
**Status**: Planned for this weekend

**Changes**:
- Delete `jim` agent template (redundant with `dave`)
- Keep `dave` as primary assistant template
- Add new role-based templates:
  - `golang-engineer` - Backend Go development
  - `typescript-engineer` - Frontend/Node.js development
  - `qa-engineer` - Testing and quality assurance
  - `project-manager` - Project coordination and planning

**Why**: Templates should match agents used in org templates (Small Startup, etc.)

### 3. Enhanced Small Startup Template
**Source**: User feedback from talk
**Priority**: P1
**Effort**: 2 hours
**Status**: Planned for this weekend

**Changes**:
- Expand from 3 to 6 agents:
  - CEO (existing)
  - Product Manager (existing)
  - 2x Engineer (new: engineer1, engineer2)
  - 1x QA Engineer (new)
  - 1x Project Manager (new)
- Add GitHub Triage workflow:
  - Product Manager triages issues
  - Decides on daily priorities
  - Posts to team group/community

**Why**: More realistic startup team structure, demonstrates workflow capabilities.

---

## 🚀 Medium Priority (v1.1.0 Features)

### 4. Workflow Constraints & Dependencies
**Source**: User request from Mar 14 talk
**Priority**: P1
**Effort**: 8 hours (design 2h, backend 3h, UI 3h)
**Status**: Design phase

**Description**:
Allow workflows to declare dependencies on other workflows. For example:
- "GitHub Triage" workflow can only run after "Daily Standup" and "Management Priorities" complete
- Ensures execution flow is predictable
- Prevents conflicts and ensures proper sequencing

**Implementation Ideas**:
```yaml
---
name: github-triage
depends_on:
  - daily-standup
  - management-priorities
constraint_type: all  # all | any
---
```

**UI Considerations**:
- Workflow editor shows dependency picker
- Visual workflow graph showing relationships
- Execution history shows constraint satisfaction
- Warning if circular dependencies detected

**Challenges**:
- How to handle workflow failures (retry? skip dependents?)
- Timezone handling for scheduled workflows
- UI complexity vs simplicity

### 5. Favorites Tab
**Source**: User request from Mar 14 talk
**Priority**: P1
**Effort**: 10 hours (backend 3h, UI 5h, template export 2h)
**Status**: Design phase

**Description**:
New "Favorites" tab that allows users to star/favorite any:
- Agents
- Groups
- Communities
- Workflows

**Features**:
- Quick access to frequently used items
- One-click template creation from favorites
- Export favorites as org template
- Organize workspace items without deleting unused ones

**Implementation**:
- Add `starred: boolean` to all entities
- `/api/favorites` endpoint aggregating starred items
- New `FavoritesPage.tsx` component
- "Export Favorites as Template" button
- Template includes only starred items (or subset via checkboxes)

**Why**: Workspaces can grow large; favorites provide organization and quick template creation.

---

## 💎 High Value (v1.1.0 - v1.2.0)

### 6. Personal Assistants Org Template
**Source**: User request from Mar 14 talk
**Priority**: P1
**Effort**: 6 hours
**Status**: Design phase
**Target**: v1.1.0

**Agents** (6-8 agents):
- `email-assistant` - Check, summarize, respond to emails
- `calendar-assistant` - Track events, send reminders, schedule meetings
- `todo-assistant` - Manage TODO lists, track progress
- `news-assistant` - Daily news digest on specific topics
- `meeting-assistant` - Create meetings, capture notes
- `personal-coordinator` - Main user-facing assistant that delegates

**Groups**:
- `status-group` - All assistants post status updates
- `sync-group` - Cross-assistant coordination

**Workflows**:
- `morning-briefing` - 8am daily: calendar + news + todos
- `email-digest` - Every 2 hours: summarize new emails
- `evening-wrap` - 6pm daily: summary of day, prep for tomorrow

**Why**: High-value use case for personal productivity, showcases multi-agent coordination.

### 7. Deep Research Org Template
**Source**: User request from Mar 14 talk
**Priority**: P1
**Effort**: 8 hours
**Status**: Design phase
**Target**: v1.2.0

**Agents** (5-7 agents):
- `research-coordinator` - User-facing, captures requirements
- `web-researcher` - Searches web for data (3x agents for parallelism)
- `data-synthesizer` - Compiles research into draft
- `editor` - Final polish and formatting

**Groups**:
- `research-team` - All researchers + synthesizer
- `publication-team` - Synthesizer + editor

**Communities**:
- `research-project` - All agents for cross-communication

**Workflows**:
- `research-kickoff` - Coordinator posts requirements to research-team
- `synthesis-trigger` - After 24h, synthesizer compiles data
- `final-review` - Editor reviews and publishes

**Why**: Demonstrates advanced multi-agent collaboration, high-value for content/marketing teams.

---

## 🔧 Infrastructure & Quality of Life (v1.0.x - v1.1.0)

### 8. setup.sh - Automated Installation
**Source**: User feedback from talk
**Priority**: P0
**Effort**: 6 hours
**Status**: Planned for Monday
**Target**: v1.0.1

**Description**:
One-command setup script that:
1. Checks prerequisites (Node.js, git, OpenClaw)
2. Installs specific OpenClaw version (pinned/tested)
3. Clones ClawMax repo
4. Runs `npm install`
5. Creates default workspace structure
6. Initializes dashboard token
7. Starts dashboard

**Usage**:
```bash
curl -fsSL https://clawmax.ai/install.sh | bash
# or
./setup.sh
```

**Why**: Removes manual setup errors, ensures version compatibility.

### 9. OpenClaw Version Pinning
**Source**: Compatibility issues
**Priority**: P0
**Effort**: 2 hours
**Status**: Planned for this weekend
**Target**: v1.0.1

**Description**:
- Document tested OpenClaw version in README.md
- setup.sh installs specific version
- Add version check on dashboard startup (warn if mismatch)

**Why**: Avoid breaking changes from OpenClaw updates.

### 10. Workspaces Directory Structure
**Source**: User feedback
**Priority**: P1
**Effort**: 4 hours
**Status**: Design phase
**Target**: v1.1.0

**Proposal**:
```
clawmax/
├── workspaces/
│   ├── README.md           # Explains structure
│   ├── default/            # Default workspace (created by setup.sh)
│   │   ├── AGENTS/
│   │   ├── WORKFLOWS/
│   │   ├── GROUPS/
│   │   └── COMMUNITIES/
│   ├── demo/               # User-created workspace
│   └── production/         # User-created workspace
├── SYSTEM/
└── README.md
```

**Benefits**:
- All workspaces in one place
- Easy to find and manage
- Clear separation from system files
- Optional: users can override with OPENCLAW_WORKSPACE env var

**Implementation**:
- setup.sh creates workspaces/default/
- Dashboard UI shows workspaces/* as available workspaces
- Backward compatible: supports existing workspace paths

---

## 📊 Testing & Quality (Ongoing)

### 11. Test Coverage for New Features
**Priority**: P0
**Effort**: Ongoing
**Status**: Continuous

**Scope**:
- Add tests for all new API endpoints
- Add tests for new UI components
- Integration tests for workflow constraints
- E2E tests for favorites feature
- Template validation tests

**Goal**: Maintain 92/92 test pass rate, expand coverage as features are added.

---

## 🔄 Release Strategy

### v1.0.1 (Target: Mar 17-18)
**Quick wins and setup improvements**
- ✅ setup.sh automated installation
- ✅ OpenClaw version pinning
- ✅ Simplified test template
- ✅ Agent template cleanup & expansion
- ✅ Enhanced Small Startup template

### v1.1.0 (Target: End of March)
**Major features**
- ✅ Workflow constraints & dependencies
- ✅ Favorites tab
- ✅ Personal Assistants org template
- ✅ Workspaces directory structure
- ✅ Comprehensive test coverage

### v1.2.0 (Target: April)
**Advanced features**
- ✅ Deep Research org template
- ✅ Workflow execution analytics
- ✅ Agent performance metrics
- ✅ Bulk operations (multi-agent actions)

---

## 📝 Notes

- **Time Budget**:
  - Sat Mar 15: 4 hours
  - Sun Mar 16: 2 hours
  - Mon Mar 17: 10 hours
  - Total: 16 hours

- **Priority Focus**:
  - Saturday: Templates (#1, #2, #3)
  - Sunday: Documentation + design (#4, #5)
  - Monday: setup.sh (#8) + start favorites (#5)

- **Sync Strategy**: Test features in private repo, sync to public repo as completed, release v1.0.x incrementally.

---

**For bug tracking**, see [BUGS.md](./BUGS.md)
**For known issues**, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
