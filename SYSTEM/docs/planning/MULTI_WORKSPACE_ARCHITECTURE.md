# Multi-Workspace Architecture Design

**Date**: Feb 26, 2026
**Status**: Design Phase
**Priority**: P0 (Critical - Demo Feedback #2)

---

## Problem Statement

Dashboard currently assumes a single workspace at `~/.openclaw/workspace`. This prevents:
- Managing multiple organizations (personal, work, client projects)
- Team collaboration (different teams = different workspaces)
- Consultant workflows (each client = separate workspace)
- Testing/staging environments

---

## Architecture Overview

### Current (Single Workspace)
```
~/.openclaw/
├── openclaw.json (config for all agents)
└── workspace/ (SINGLE workspace)
    ├── AGENTS/
    ├── ORG/
    └── SYSTEM/
```

### Proposed (Multi-Workspace)
```
~/.openclaw/
├── openclaw.json (global config)
├── dashboard-workspaces.json (workspace registry)
└── workspaces/
    ├── default/
    │   ├── AGENTS/
    │   ├── ORG/
    │   └── SYSTEM/
    ├── work/
    │   ├── AGENTS/
    │   ├── ORG/
    │   └── SYSTEM/
    └── client-acme/
        ├── AGENTS/
        ├── ORG/
        └── SYSTEM/
```

---

## Core Components

### 1. Workspace Registry (`dashboard-workspaces.json`)

```typescript
interface WorkspaceRegistry {
  version: string
  activeWorkspaceId: string
  workspaces: Workspace[]
}

interface Workspace {
  id: string  // unique identifier
  name: string  // display name
  path: string  // absolute path to workspace root
  createdAt: string  // ISO timestamp
  lastAccessedAt: string  // ISO timestamp
  agentCount?: number  // cached count
  color?: string  // UI color theme (optional)
  tags?: string[]  // organizational tags
}
```

**Location**: `~/.openclaw/dashboard-workspaces.json`

**Example**:
```json
{
  "version": "1.0.0",
  "activeWorkspaceId": "default",
  "workspaces": [
    {
      "id": "default",
      "name": "Personal",
      "path": "/Users/max/.openclaw/workspace",
      "createdAt": "2026-02-25T10:00:00Z",
      "lastAccessedAt": "2026-02-26T20:30:00Z",
      "agentCount": 15,
      "color": "#3B82F6",
      "tags": ["personal"]
    },
    {
      "id": "work",
      "name": "Work - ClawMax",
      "path": "/Users/max/.openclaw/workspaces/work",
      "createdAt": "2026-02-26T14:00:00Z",
      "lastAccessedAt": "2026-02-26T18:00:00Z",
      "agentCount": 8,
      "color": "#10B981",
      "tags": ["work", "company"]
    }
  ]
}
```

---

### 2. Backend Changes

#### 2.1 Workspace Manager (`server/lib/workspace-manager.ts`)

```typescript
export class WorkspaceManager {
  private registryPath: string
  private registry: WorkspaceRegistry

  constructor()

  // Registry operations
  loadRegistry(): WorkspaceRegistry
  saveRegistry(): void

  // Workspace CRUD
  listWorkspaces(): Workspace[]
  getWorkspace(id: string): Workspace | null
  createWorkspace(name: string, path: string): Workspace
  deleteWorkspace(id: string): void

  // Active workspace management
  getActiveWorkspace(): Workspace
  setActiveWorkspace(id: string): void

  // Path resolution
  resolveWorkspacePath(workspaceId: string): string

  // Validation
  validateWorkspacePath(path: string): boolean
  initializeWorkspaceStructure(path: string): void
}
```

#### 2.2 Updated `workspace.ts`

**Before**:
```typescript
export const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(HOME, '.openclaw', 'workspace')
export const AGENTS_DIR = path.join(WORKSPACE, 'AGENTS')
```

**After**:
```typescript
import { WorkspaceManager } from './workspace-manager'

const workspaceManager = new WorkspaceManager()

// Dynamic workspace resolution
export function getWorkspace(): string {
  return workspaceManager.getActiveWorkspace().path
}

export function getAgentsDir(): string {
  return path.join(getWorkspace(), 'AGENTS')
}

// All functions updated to use getWorkspace() instead of WORKSPACE constant
```

#### 2.3 Workspace API Routes (`server/routes/workspaces.ts`)

```typescript
// GET /api/workspaces - List all workspaces
router.get('/', (req, res) => {
  const workspaces = workspaceManager.listWorkspaces()
  res.json({ workspaces })
})

// POST /api/workspaces - Create new workspace
router.post('/', (req, res) => {
  const { name, path } = req.body
  const workspace = workspaceManager.createWorkspace(name, path)
  res.json({ workspace })
})

// GET /api/workspaces/active - Get active workspace
router.get('/active', (req, res) => {
  const workspace = workspaceManager.getActiveWorkspace()
  res.json({ workspace })
})

// PUT /api/workspaces/:id/activate - Switch active workspace
router.put('/:id/activate', (req, res) => {
  const { id } = req.params
  workspaceManager.setActiveWorkspace(id)
  res.json({ ok: true })
})

// DELETE /api/workspaces/:id - Delete workspace
router.delete('/:id', (req, res) => {
  const { id } = req.params
  workspaceManager.deleteWorkspace(id)
  res.json({ ok: true })
})
```

---

### 3. Frontend Changes

#### 3.1 Workspace Context (`client/src/contexts/WorkspaceContext.tsx`)

```typescript
interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean

  // Actions
  switchWorkspace: (id: string) => Promise<void>
  createWorkspace: (name: string, path: string) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  refreshWorkspaces: () => Promise<void>
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }>
export const useWorkspace: () => WorkspaceContextValue
```

#### 3.2 Workspace Switcher (`client/src/components/WorkspaceSwitcher.tsx`)

Located in app header, shows:
- Current workspace name
- Dropdown with all workspaces
- Quick switch functionality
- "Create Workspace" button

#### 3.3 Workspace Creation Dialog (`client/src/components/WorkspaceDialog.tsx`)

Form for creating new workspace:
- Name input (required)
- Path input (optional - auto-generated from name)
- Initialize with sample agents checkbox
- Validation and error handling

---

## Migration Strategy

### Phase 1: Backward Compatibility (Day 1)
1. Introduce workspace registry
2. Migrate current workspace as "default"
3. All existing code continues to work
4. New workspace manager returns current workspace if no active workspace set

### Phase 2: API Updates (Day 1)
1. Add workspace API endpoints
2. Update all routes to use dynamic workspace resolution
3. Add workspace context to API calls

### Phase 3: Frontend Integration (Day 1-2)
1. Add WorkspaceContext
2. Add workspace switcher UI
3. Add workspace creation dialog
4. Update all data fetching to use workspace context

### Phase 4: Testing & Polish (Day 2-3)
1. Test workspace creation
2. Test workspace switching
3. Test data isolation
4. UI polish and error handling

---

## Data Isolation

Each workspace maintains:
- **Separate agent lists** (`~/.openclaw/openclaw.json` has global agents, but workspace shows filtered view)
- **Separate ORG docs** (each workspace has its own ORG/ structure)
- **Separate SYSTEM docs** (workspace-specific documentation)
- **Separate message archives** (per-workspace chat history)

---

## OpenClaw CLI Compatibility

The default workspace (`~/.openclaw/workspace`) remains the OpenClaw CLI's default. Dashboard workspaces are an additional layer:

```
OpenClaw CLI:
  Uses: ~/.openclaw/workspace (always)

Dashboard:
  Default workspace: ~/.openclaw/workspace (same as CLI)
  Additional workspaces: ~/.openclaw/workspaces/name/
```

Users can still use `openclaw` commands which target the default workspace, or specify workspace via env var:
```bash
OPENCLAW_WORKSPACE=~/.openclaw/workspaces/work openclaw agents list
```

---

## Storage Considerations

### Option A: Separate openclaw.json per workspace ⭐ **RECOMMENDED**
Each workspace has its own `openclaw.json` at the workspace root:
```
~/.openclaw/workspaces/work/openclaw.json
~/.openclaw/workspaces/client-acme/openclaw.json
```

**Pros**:
- True isolation
- Can use openclaw CLI with each workspace
- Cleaner architecture
- Easier backup/restore per workspace

**Cons**:
- More config files to manage
- Need to sync global settings manually

### Option B: Single openclaw.json with workspace namespacing
All workspaces in `~/.openclaw/openclaw.json`:
```json
{
  "workspaces": {
    "default": { "agents": { "list": [...] } },
    "work": { "agents": { "list": [...] } },
  }
}
```

**Pros**:
- Single config file
- Easy global settings

**Cons**:
- Breaks OpenClaw CLI compatibility
- Confusing namespace management
- Harder data isolation

**DECISION**: Use Option A (separate openclaw.json per workspace)

---

## Implementation Checklist

### Backend
- [ ] Create `WorkspaceManager` class
- [ ] Create `dashboard-workspaces.json` registry
- [ ] Migrate current workspace as "default"
- [ ] Update `workspace.ts` to use dynamic resolution
- [ ] Create workspace API routes
- [ ] Update all routes to use `getWorkspace()`
- [ ] Add workspace validation
- [ ] Add workspace initialization logic

### Frontend
- [ ] Create `WorkspaceContext`
- [ ] Create `useWorkspace` hook
- [ ] Create `WorkspaceSwitcher` component
- [ ] Create `WorkspaceDialog` component
- [ ] Update `App.tsx` to wrap with `WorkspaceProvider`
- [ ] Update all data fetching to use workspace context
- [ ] Add workspace indicator in header
- [ ] Handle workspace switching (reload data)

### Testing
- [ ] Test workspace creation
- [ ] Test workspace switching
- [ ] Test data isolation
- [ ] Test backward compatibility
- [ ] Test OpenClaw CLI integration
- [ ] Test concurrent workspace operations
- [ ] Add automated tests

---

## Future Enhancements

### Phase 2 Features (Post-MVP)
- **Workspace templates**: Pre-configured workspace structures
- **Workspace cloning**: Duplicate workspace structure
- **Workspace export/import**: Backup/restore workspaces
- **Workspace settings**: Per-workspace configurations
- **Workspace analytics**: Usage tracking per workspace
- **Workspace sharing**: Multi-user collaboration (long-term)

---

## Success Criteria

✅ **Must Have (MVP)**:
- Create multiple workspaces
- Switch between workspaces seamlessly
- Data completely isolated per workspace
- Default workspace maintains OpenClaw CLI compatibility
- UI clearly shows current workspace
- All existing features work in any workspace

🎯 **Nice to Have**:
- Workspace templates
- Workspace color themes
- Quick switch keyboard shortcut (Cmd+K → workspace switcher)
- Workspace usage analytics

---

## Timeline

- **Day 1 (4 hours)**: Backend + API
- **Day 2 (4 hours)**: Frontend context + basic UI
- **Day 3 (4 hours)**: UI polish + testing

**Total**: 12 hours over 3 days

---

## Related Documents

- `DEMO_FEEDBACK_FEB26.md` - Original demo feedback
- `TOMORROW_WEEKEND_PLAN.md` - Detailed implementation timeline
