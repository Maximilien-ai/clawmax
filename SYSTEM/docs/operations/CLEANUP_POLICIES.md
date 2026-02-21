# Cleanup & Deletion Policies

**Status:** Implemented
**Created:** 2026-02-20

---

## Overview

Deletion policies for agents and communities, including chat history cleanup, symlink removal, and soft-delete recovery.

---

## Agent Deletion

### What Gets Deleted

When you delete an agent:

1. **Workspace Files:**
   - `AGENTS/{agent_id}/` directory (SOUL, IDENTITY, TOOLS, memory, etc.)
   - Symlinks in `chat_history/groups/` (prevents broken links)

2. **Chat History:**
   - Moved to `SYSTEM/deleted/agents/{agent_id}/chat_history/`
   - Dashboard archives moved to `SYSTEM/deleted/agents/{agent_id}/dashboard_archives/`
   - **NOT permanently deleted** (can recover for 30 days)

3. **Community Membership:**
   - Agent removed from all community `AGENTS.md` files
   - Symlinks to group chats removed from agent workspace

### Deletion Options

**Keep Archives (Recommended):**
```bash
DELETE /api/agents/{id}?keepArchives=true
```
- Moves archives to `deleted/` folder
- Can restore later
- 30-day retention before auto-purge

**Permanent Delete:**
```bash
DELETE /api/agents/{id}?keepArchives=false
```
- Archives moved to `deleted/` but marked for immediate purge
- Use only if you're certain

### UI Flow

1. User clicks "Delete Agent"
2. Modal shows:
   - Agent workspace path
   - Community memberships (will be removed)
   - Chat archive count
   - Option: "Keep archives in deleted/ folder"
3. User confirms deletion
4. Agent deleted, archives moved to `deleted/`

---

## Community Deletion

### Safety Checks

**Cannot delete community if:**
- ❌ Active agents still exist in community
- ❌ User doesn't explicitly confirm agent deletion

**Must choose:**
- **Option A:** Delete agents first, then delete community
- **Option B:** Check "Delete all agents in community" (destructive)

### What Gets Deleted

1. **Community Workspace:**
   - `COMMUNITIES/{community}/` directory
   - COMMUNITY.md, GROUPS.md

2. **Chat History:**
   - Moved to `SYSTEM/deleted/communities/{community}/chat_history/`
   - Dashboard archives moved to `deleted/`

3. **Agent Symlinks:**
   - All agent symlinks to this community removed
   - Prevents broken links

4. **Agents (if deleteAgents=true):**
   - All agents in community deleted using agent deletion flow
   - Agent archives moved to `deleted/`

### Deletion Options

**Community Only (Requires No Agents):**
```bash
DELETE /api/communities/{name}?deleteAgents=false
```
- Fails if agents exist
- Only works for empty communities

**Community + All Agents (Destructive):**
```bash
DELETE /api/communities/{name}?deleteAgents=true&keepHistory=true
```
- Deletes all agents in community
- Moves all archives to `deleted/`
- Shows warning with agent count

### UI Flow

1. User clicks "Delete Community"
2. Modal shows:
   - Community workspace path
   - Agent count and names
   - **Warning:** "This will delete X agents!"
   - Checkbox: "Delete all X agents in this community"
   - Checkbox: "Keep chat history in deleted/ folder"
3. Delete button **disabled** unless checkbox checked (if agents exist)
4. User confirms (types community name to confirm)
5. Community and optionally agents deleted

---

## Soft Delete Structure

### Deleted Items Directory

```
SYSTEM/deleted/
├── agents/
│   └── {agent_id}/
│       ├── chat_history/               # Workspace markdown archives
│       ├── dashboard_archives/          # JSON archives
│       ├── deleted_at.txt              # Deletion timestamp
│       └── metadata.json               # Agent snapshot
│           {
│             "agent_id": "engineer",
│             "name": "Senior Engineer",
│             "deleted_at": "2026-02-20T18:00:00Z",
│             "deleted_by": "user@example.com",
│             "communities": ["engineering", "backend"],
│             "archive_count": 42
│           }
└── communities/
    └── {community_name}/
        ├── chat_history/
        ├── dashboard_archives/
        ├── deleted_at.txt
        ├── metadata.json
        │   {
        │     "community": "engineering",
        │     "deleted_at": "2026-02-20T18:00:00Z",
        │     "agent_count": 5,
        │     "agents": ["engineer", "qa-engineer", ...],
        │     "archive_count": 128
        │   }
        └── agents/                     # If deleteAgents=true
            ├── engineer/
            └── qa-engineer/
```

---

## Recovery

### Restore Deleted Agent

**UI:** Dashboard > Deleted Items > Agents > Restore

**API:**
```bash
POST /api/agents/restore/{id}
```

**Process:**
1. Move `deleted/agents/{id}/` back to `AGENTS/{id}/`
2. Restore chat history to agent workspace
3. Recreate symlinks to communities (if communities still exist)
4. Restore dashboard archives

**Limitations:**
- Communities must still exist to restore symlinks
- If community deleted, agent restored without group chat access

### Restore Deleted Community

**UI:** Dashboard > Deleted Items > Communities > Restore

**API:**
```bash
POST /api/communities/restore/{name}?restoreAgents=true
```

**Process:**
1. Move `deleted/communities/{name}/` back to `COMMUNITIES/{name}/`
2. Restore chat history
3. Optionally restore agents (if they were deleted with community)
4. Recreate symlinks for all restored agents

---

## Auto-Purge

### Retention Policy

**Default:** 30 days

**Configurable:**
```json
// dashboard.config.json
{
  "deletion": {
    "retention_days": 30,
    "auto_purge": true,
    "purge_schedule": "0 0 * * *"  // Daily at midnight
  }
}
```

### Purge Process

**Cron Job:** Runs daily
1. Find all items in `deleted/` older than retention period
2. Permanently delete archives and metadata
3. Log purged items to `SYSTEM/logs/purge.log`

**Manual Purge:**
```bash
npm run purge:deleted -- --older-than 30
```

---

## Best Practices

### Before Deleting Agents

✅ Archive important chats
✅ Review community memberships
✅ Download workspace files if needed
✅ Check for active tasks/TODOs
✅ Enable "Keep archives" option

### Before Deleting Communities

✅ Warn all users in community
✅ Archive important group discussions
✅ Consider moving agents to other communities
✅ Export community metadata
✅ Use "Keep history" option

### Preventing Accidents

✅ Require typing community/agent name to confirm
✅ Show clear warnings with consequences
✅ Default to soft-delete (can recover)
✅ Log all deletions with metadata
✅ Notify admins of deletions

---

## Symlink Cleanup

### When Symlinks Are Removed

**Agent leaves community:**
- Remove `AGENTS/{agent}/chat_history/groups/{community}` symlink

**Agent deleted:**
- Remove all symlinks in `chat_history/groups/`

**Community deleted:**
- Remove all agent symlinks pointing to `COMMUNITIES/{community}/chat_history/`

### Orphaned Symlink Detection

**Check for broken symlinks:**
```bash
npm run check:symlinks
```

**Auto-fix broken symlinks:**
```bash
npm run fix:symlinks
```

**Process:**
1. Find all symlinks in agent `chat_history/groups/`
2. Test if target exists
3. Remove broken symlinks
4. Log results

---

## Troubleshooting

**Q: Can't delete community - says agents exist, but I don't see them?**
- Check `COMMUNITIES/{community}/AGENTS.md`
- Run: `npm run audit:communities`
- Manually edit AGENTS.md if needed

**Q: Deleted agent by mistake, how to recover?**
- Go to Dashboard > Deleted Items
- Find agent in list
- Click "Restore"
- Verify symlinks recreated

**Q: Old deleted items taking up space?**
- Check retention policy: `dashboard.config.json`
- Manually purge: `npm run purge:deleted --older-than 7`
- Enable auto-purge if disabled

**Q: Symlinks not working on Windows?**
- Symlinks require admin privileges on Windows
- System falls back to copying files
- Update on each archive (eventual consistency)

---

## API Reference

### Delete Agent
```
DELETE /api/agents/:id?keepArchives=true
Response: { deleted, archived, symlinksRemoved }
```

### Delete Community
```
DELETE /api/communities/:name?deleteAgents=true&keepHistory=true
Response: { deleted, agentsDeleted, archived }
```

### Restore Agent
```
POST /api/agents/restore/:id
Response: { restored, symlinksCreated }
```

### Restore Community
```
POST /api/communities/restore/:name?restoreAgents=true
Response: { restored, agentsRestored }
```

### List Deleted Items
```
GET /api/deleted/agents
GET /api/deleted/communities
Response: { items: DeletedItem[] }
```

---

**See Also:**
- Architecture: `SYSTEM/docs/architecture/CHAT_MEMORY.md`
- Features: `SYSTEM/docs/features/CHAT_HISTORY_WORKSPACE.md`
