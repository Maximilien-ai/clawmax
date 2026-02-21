# Chat Memory Architecture

**Status:** Implemented
**Created:** 2026-02-20
**Owner:** ClawMax.ai Dashboard

---

## Overview

Chat memory system that makes conversation history **workspace-native** and **agent-accessible**. Agents can read their own chat history and group discussions to provide context-aware responses.

---

## Design Principles

1. **Workspace-Native** — Chat history lives in agent/community workspaces, not just dashboard
2. **Agent-Accessible** — Agents can read (not write) their conversation history
3. **Git-Trackable** — Markdown format enables version control
4. **Dual Storage** — JSON for dashboard performance, MD for agent access
5. **Symlink Sharing** — Agents access group chats via symlinks (no duplication)

---

## Architecture

### Storage Strategy: Dual Format

**Why Dual Storage?**
- **JSON** — Fast dashboard loading, caching, metadata (titles, timestamps)
- **Markdown** — Human-readable, agent-accessible, git-trackable

### Directory Structure

```
WORKSPACE/
├── AGENTS/
│   └── engineer/
│       ├── SOUL.md
│       ├── IDENTITY.md
│       ├── memory/                      # Daily journal (existing)
│       │   └── 2026-02-20.md
│       └── chat_history/                # NEW
│           ├── one-on-one/              # Direct user conversations
│           │   ├── 2026-02-20_14-30-00.md
│           │   └── 2026-02-20_15-45-12.md
│           └── groups/                  # Symlinks to communities
│               ├── engineering_team -> ../../../COMMUNITIES/engineering/chat_history/
│               └── product_team -> ../../../COMMUNITIES/product/chat_history/
│
├── COMMUNITIES/
│   └── engineering/
│       ├── COMMUNITY.md
│       ├── GROUPS.md
│       └── chat_history/                # NEW
│           ├── 2026-02-20_14-30-00.md
│           └── 2026-02-20_15-45-12.md
│
└── SYSTEM/
    ├── messages/                        # Dashboard archives (existing)
    │   ├── agents/
    │   │   └── engineer/
    │   │       └── archive/
    │   │           ├── 2026-02-20_14-30-00.json
    │   │           └── .titles.json     # AI-generated titles cache
    │   └── communities/
    │       └── engineering_team/
    │           └── archive/
    │               └── 2026-02-20_14-30-00.json
    │
    └── deleted/                         # Soft-delete archives (NEW)
        ├── agents/
        │   └── old-agent/
        │       ├── chat_history/
        │       ├── dashboard_archives/
        │       ├── deleted_at.txt
        │       └── metadata.json
        └── communities/
            └── old-community/
                ├── chat_history/
                ├── dashboard_archives/
                └── metadata.json
```

---

## File Formats

### Markdown Format (Agent-Readable)

**One-on-One Chat** (`AGENTS/engineer/chat_history/one-on-one/2026-02-20_14-30-00.md`)

```markdown
# Chat Archive: Code Review Discussion

**Archived:** 2026-02-20 14:30:00
**Participants:** User, engineer

---

## User (2026-02-20T14:30:15Z)

Can you review this TypeScript function?

\`\`\`typescript
function processData(data: any) {
  return data.map(x => x * 2)
}
\`\`\`

---

## engineer (2026-02-20T14:30:45Z)

I've reviewed your function. Here are my suggestions:

1. Add type safety - avoid `any`
2. Consider edge cases (null/undefined)
3. Add JSDoc comments

Here's an improved version:

\`\`\`typescript
/**
 * Doubles each number in the input array
 */
function processData(data: number[]): number[] {
  return data.map(x => x * 2)
}
\`\`\`

---
```

**Group Chat** (`COMMUNITIES/engineering/chat_history/2026-02-20_14-30-00.md`)

```markdown
# Group Chat Archive: Sprint Planning Discussion

**Archived:** 2026-02-20 14:30:00
**Community:** engineering
**Channel:** general
**Participants:** @engineer, @product-manager, @qa-engineer

---

## @product-manager (2026-02-20T14:30:00Z)

What should we prioritize for next sprint?

---

## @engineer (2026-02-20T14:30:30Z)

I recommend:
1. Fix authentication bug (high priority)
2. Add API rate limiting
3. Improve test coverage

---

## @qa-engineer (2026-02-20T14:31:00Z)

Agree with @engineer. The auth bug is blocking our release.

---
```

### JSON Format (Dashboard UI)

```json
{
  "messages": [
    {
      "id": "msg-1",
      "from": "User",
      "content": "Can you review this code?",
      "timestamp": 1708445415000,
      "mentions": []
    },
    {
      "id": "msg-2",
      "from": "engineer",
      "content": "I've reviewed your function...",
      "timestamp": 1708445445000,
      "mentions": []
    }
  ],
  "archived_at": "2026-02-20T14:30:00Z",
  "title": "Code Review Discussion"
}
```

---

## Data Flow

### Archive Flow

```
User archives chat in dashboard
         ↓
Dashboard calls API: POST /api/agents/:id/messages/archive
         ↓
Backend saves dual format:
  1. JSON → SYSTEM/messages/agents/:id/archive/
  2. MD → AGENTS/:id/chat_history/one-on-one/
         ↓
AI generates title → saves to both formats
         ↓
For group chats:
  - Update community chat_history/
  - Refresh symlinks for all agents in community
         ↓
Agent can now read chat history via workspace
```

### Agent Access Flow

```
Agent starts task
         ↓
OpenClaw loads agent workspace
         ↓
Agent SOUL.md instructs: "You can reference chat_history/"
         ↓
Agent reads:
  - chat_history/one-on-one/*.md (direct chats)
  - chat_history/groups/engineering_team/*.md (via symlink)
         ↓
Agent provides context-aware response
```

---

## Symlink Strategy

### Why Symlinks?

**Problem:** Group chats involve multiple agents. Storing copies in each agent = duplication.

**Solution:** Community stores canonical history, agents link to it.

```
COMMUNITIES/engineering/chat_history/2026-02-20.md  ← Canonical source
              ↑
              └─ symlink ─ AGENTS/engineer/chat_history/groups/engineering_team/
              └─ symlink ─ AGENTS/qa-engineer/chat_history/groups/engineering_team/
              └─ symlink ─ AGENTS/product-manager/chat_history/groups/engineering_team/
```

**Benefits:**
- ✅ Single source of truth
- ✅ No duplication
- ✅ Updates propagate automatically
- ✅ Symlinks removed when agent leaves community

**Fallback (Windows):**
- If symlink creation fails, copy files
- Refresh on archive (eventual consistency)

---

## Cleanup & Deletion

### Agent Deletion

When agent deleted:
1. Remove symlinks to all group chats
2. Move `chat_history/` to `SYSTEM/deleted/agents/:id/`
3. Update community membership (remove from AGENTS.md)
4. Move dashboard JSON archives to deleted/

**Soft Delete:**
- Data moved to `deleted/`, not permanently removed
- 30-day retention (configurable)
- Can restore via dashboard UI

### Community Deletion

When community deleted:
1. Check for active agents → **block if agents exist** (unless force delete)
2. Remove all agent symlinks to community
3. Optionally delete all agents in community
4. Move `chat_history/` to `SYSTEM/deleted/communities/:name/`
5. Move dashboard JSON archives to deleted/

**Warnings:**
- UI shows agent count and names
- Requires explicit confirmation
- Option to delete agents or keep them

---

## Git Integration

### What's Tracked?

**Committed to Git:**
- ✅ `AGENTS/*/chat_history/**/*.md` — Agent conversation history
- ✅ `COMMUNITIES/*/chat_history/**/*.md` — Group chat history
- ✅ `SYSTEM/deleted/**/metadata.json` — Deletion metadata

**Ignored (.gitignore):**
- ❌ `SYSTEM/messages/*/archive/*.json` — Dashboard runtime cache
- ❌ `SYSTEM/messages/*/archive/.titles.json` — AI title cache
- ❌ `SYSTEM/deleted/**/chat_history/` — Deleted archives (too large)

**Why Commit Markdown?**
- Human-readable diffs in git history
- Track conversation evolution over time
- Review agent learnings and improvements
- Backup and disaster recovery

---

## Performance Considerations

### Dashboard Loading

**Optimization:** Load from JSON (faster) for UI

```typescript
// Fast path: Load JSON for dashboard display
const archives = await loadArchivesFromJSON(agentId)

// Slow path: Parse markdown only if JSON missing
if (!archives.length) {
  archives = await loadArchivesFromMarkdown(agentId)
}
```

### Agent Context Loading

**Optimization:** Agents read markdown directly (already in workspace)

```typescript
// Agent reads local files (no API call needed)
const oneonone = await fs.readdir('chat_history/one-on-one')
const groups = await fs.readdir('chat_history/groups/engineering_team')
```

### Symlink Performance

- **Fast:** Symlinks are filesystem-level pointers (no copy)
- **Fallback:** If Windows or symlink fails, copy files (slower)
- **Refresh:** Update copies on archive only (not real-time)

---

## Migration Strategy

### Existing Archives

For existing JSON archives in `SYSTEM/messages/`:

```bash
# One-time migration script
npm run migrate:chat-history
```

**Process:**
1. Find all `*.json` archives
2. Convert to markdown format
3. Save to appropriate workspace location
4. Create symlinks for group chats
5. Validate both formats match

---

## Security & Permissions

### Read/Write Permissions

**Agents:**
- ✅ **Read** their own `chat_history/one-on-one/`
- ✅ **Read** group chats via `chat_history/groups/` symlinks
- ❌ **Cannot write** to chat history (append-only from dashboard)

**Dashboard:**
- ✅ **Write** new archives to both JSON and MD
- ✅ **Delete** archives (soft delete to `deleted/`)
- ✅ **Restore** from `deleted/`

**Communities:**
- Canonical storage for group chats
- Agents access via symlinks (read-only)

---

## Benefits

### For Agents
✅ Access to conversation history
✅ Context-aware responses
✅ Learn from past interactions
✅ Reference group discussions

### For Users
✅ Git-tracked conversation archives
✅ Human-readable markdown format
✅ Easy local search/grep
✅ Backup and version control

### For System
✅ Workspace-native architecture
✅ No dashboard dependency
✅ Efficient symlink sharing
✅ Clean separation of concerns

---

## Future Enhancements

### V2: Advanced Features
- **Semantic Search** — Vector embeddings for chat history
- **Auto-Summarization** — Periodic chat summaries for agents
- **Cross-Agent Learning** — Shared knowledge base from conversations
- **Conversation Analytics** — Track topics, sentiment, patterns

### V3: Collaboration
- **Agent-to-Agent Chats** — Agents discuss without user
- **Threaded Conversations** — Reply threads in group chats
- **Reactions & Annotations** — Agents can mark important messages

---

## API Reference

See `SYSTEM/docs/features/CHAT_HISTORY_WORKSPACE.md` for user-facing API.

See `SYSTEM/docs/operations/CLEANUP_POLICIES.md` for deletion procedures.

---

**Status:** ✅ Implemented
**Last Updated:** 2026-02-20
**Maintained By:** ClawMax.ai Dashboard Team
