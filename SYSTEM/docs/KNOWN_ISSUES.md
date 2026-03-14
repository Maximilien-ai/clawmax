# ClawMax Known Issues & Limitations

**Last Updated**: 2026-03-15
**Current Version**: v1.0.0

This document tracks known issues, limitations, and their workarounds.

---

## 🔴 Critical Issues

### 1. Old Agent Compatibility - Missing Module Error
**Severity**: Medium
**Status**: Open
**Identified**: 2026-03-13

**Description**: Legacy agents created before v1.0.0 may respond with "missing module" errors when receiving chat messages.

**Workaround**:
1. Delete old agent from `AGENTS/` directory
2. Remove from workspace via dashboard
3. Recreate from template
4. New agent will work correctly

**Details**: See [BUGS.md](./BUGS.md#old-agents---missing-module-error)

---

## ⚠️ Setup & Installation Issues

### 2. Manual Installation Complexity
**Severity**: High
**Status**: Planned fix in v1.0.1
**Target**: Mar 17, 2026

**Description**:
Current installation requires multiple manual steps:
1. Install OpenClaw separately
2. Clone ClawMax repo
3. Run `npm install` in correct directory
4. Configure workspace path
5. Create dashboard token
6. Start dashboard

**Problems**:
- Users make mistakes in manual steps
- Version mismatches between OpenClaw and ClawMax
- Unclear where to create workspace

**Planned Solution**:
Create `setup.sh` that automates:
- Prerequisite checks (Node.js, git)
- OpenClaw installation (pinned version)
- ClawMax installation
- Workspace structure creation
- Token generation
- Dashboard startup

**Workaround**: Follow [README.md](../../README.md) carefully, ensure correct directory for `npm install`.

---

### 3. OpenClaw Version Compatibility
**Severity**: High
**Status**: Fixed in v1.0.1
**Fixed**: Mar 15, 2026

**Description**:
ClawMax v1.0.1 is tested with a specific version of OpenClaw. Newer OpenClaw versions may introduce breaking changes.

**Solution**:
- ✅ Documented tested OpenClaw version in README.md
- ✅ `setup.sh` checks OpenClaw version and warns if mismatch
- ✅ Version compatibility documented

**Tested Version**:
- OpenClaw commit: `55c2aaf` (March 13, 2026)
- OpenClaw version: v0.3.0

**Setup Check**: Run `./setup.sh` to verify your OpenClaw version is compatible.

**Manual Check**:
```bash
cd ~/github/maximilien/openclaw
git rev-parse --short HEAD
# Should show: 55c2aaf
```

---

### 4. Workspace Directory Structure
**Severity**: Medium
**Status**: Fixed in v1.0.2
**Fixed**: Mar 14, 2026

**Description**:
Workspace location was unclear. Users could place workspaces anywhere on the filesystem, making it hard to manage multiple environments.

**Solution** (v1.0.2):
Implemented standardized `WORKSPACES/` directory structure:
```
clawmax/
├── WORKSPACES/             # All workspaces in one place
│   ├── default/            # Created by setup.sh
│   │   ├── AGENTS/
│   │   ├── WORKFLOWS/
│   │   ├── ORG/
│   │   └── TEMPLATES/
│   ├── demo/               # Demo workspace
│   └── test/               # Test workspace
├── SYSTEM/
├── TEMPLATES/
└── README.md
```

**Benefits**:
- ✅ All workspaces in one place
- ✅ Clear separation from system files
- ✅ Easy to find, backup, and share
- ✅ Backward compatible via `OPENCLAW_WORKSPACE` override

**Migration**:
- `setup.sh` now creates `WORKSPACES/default` by default
- `start.sh` defaults to `WORKSPACES/default`
- Can override with: `export OPENCLAW_WORKSPACE=/custom/path`

**Status**: ✅ Implemented in v1.0.2

---

## 🟡 UI/UX Issues

### 5. Empty Workspace - Skills Page Loading
**Severity**: Low
**Status**: Fixed in v1.0.0
**Identified**: 2026-03-14

**Description**: When workspace has no agents, Skills page would show infinite "Loading skills..." state.

**Fix**: Added empty state UI with message "No Agents in Workspace - Create an agent to start assigning skills".

**Status**: ✅ Resolved in v1.0.0

---

### 6. Agent Dropdown Clipping (Single Agent Search)
**Severity**: Low
**Status**: Fixed in v1.0.0
**Identified**: 2026-03-14

**Description**: When searching for a single agent, the actions dropdown menu would be clipped at bottom of viewport.

**Fix**: Changed dropdown position from `mt-1` (below) to `bottom-full mb-1` (above button).

**Status**: ✅ Resolved in v1.0.0

---

## 🔵 Feature Limitations

### 7. No Workflow Dependencies
**Severity**: Medium
**Status**: Feature request (v1.1.0)
**Target**: End of March

**Description**:
Workflows cannot declare dependencies on other workflows. For example, "GitHub Triage" cannot specify it must run after "Daily Standup" completes.

**Impact**:
- Workflows may execute in unpredictable order
- Manual coordination required
- Risk of conflicts (e.g., triage before priorities set)

**Workaround**:
- Use workflow descriptions to document dependencies
- Schedule workflows with time gaps (e.g., Standup at 9am, Triage at 10am)
- Disable workflows manually when needed

**Planned**: See [FEATURES.md](./FEATURES.md#4-workflow-constraints--dependencies)

---

### 8. No Favorites/Bookmarks System
**Severity**: Low
**Status**: Feature request (v1.1.0)
**Target**: End of March

**Description**:
Large workspaces become hard to navigate. No way to star/favorite frequently used agents, workflows, etc.

**Impact**:
- Hard to find frequently used items
- No quick template creation from subset of workspace
- Manual organization required

**Workaround**:
- Use search/filter functionality
- Create smaller, focused workspaces
- Use tags to organize agents

**Planned**: See [FEATURES.md](./FEATURES.md#5-favorites-tab)

---

## 🟢 Performance & Scalability

### 9. Workspace Switching Performance
**Severity**: Low
**Status**: Monitored

**Description**:
Switching between workspaces with many agents (50+) can take 2-3 seconds to reload all data.

**Impact**: Minor UX delay, not blocking

**Workaround**: Keep workspaces focused and under 30 agents when possible.

**Future Optimization**:
- Lazy loading of agent details
- Caching workspace metadata
- Progressive rendering

---

### 10. Large Workflow Execution History
**Severity**: Low
**Status**: Monitored

**Description**:
Workflows with many executions (500+) can slow down workflow detail panel loading.

**Impact**: Rare, only affects high-frequency workflows after weeks of runtime

**Workaround**: Limit execution history display to last 50 executions (already implemented)

**Future Enhancement**:
- Pagination for execution history
- Archive old executions
- Configurable history retention

---

## 📋 Reporting New Issues

Found a new issue? Please report it:

1. **GitHub Issues**: https://github.com/Maximilien-ai/clawmax/issues
2. **Email**: support@clawmax.ai
3. **Include**:
   - ClawMax version (`cat SYSTEM/dashboard/package.json | grep version`)
   - OpenClaw version (`openclaw --version`)
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if UI issue

---

## 🔄 Issue Lifecycle

- **Open**: Issue identified, workaround available
- **Planned**: Fix scheduled for specific version
- **In Progress**: Actively being worked on
- **Fixed**: Resolved in a release
- **Wontfix**: Not planned to fix (by design or limitation)

---

**For bug tracking**, see [BUGS.md](./BUGS.md)
**For feature requests**, see [FEATURES.md](./FEATURES.md)
**For roadmap**, see [ROADMAP.md](./ROADMAP.md)
