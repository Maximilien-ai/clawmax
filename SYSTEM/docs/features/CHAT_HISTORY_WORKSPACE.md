# Chat History in Workspace - Feature Guide

**Status:** Implemented
**Created:** 2026-02-20

---

## Overview

Chat history is now **workspace-native** — stored as markdown files in agent and community workspaces, making it accessible to agents for context-aware responses.

---

## User Features

### Archiving Chats

**One-on-One Chats:**
1. Open chat with any agent
2. Click "Archive" button
3. Chat saved to:
   - Dashboard: `SYSTEM/messages/agents/{agent}/archive/{timestamp}.json`
   - Workspace: `AGENTS/{agent}/chat_history/one-on-one/{timestamp}.md`

**Group Chats:**
1. Open community chat
2. Click "Archive" button
3. Chat saved to:
   - Dashboard: `SYSTEM/messages/communities/{community}/archive/{timestamp}.json`
   - Workspace: `COMMUNITIES/{community}/chat_history/{timestamp}.md`
   - All agents in community get access via symlinks

### Viewing Archives

**Dashboard UI:**
- Click "History" button in chat panel
- View all archived conversations
- AI-generated titles for easy browsing
- Download, copy, or delete archives

**Workspace Files:**
- Browse `AGENTS/{agent}/chat_history/` in file explorer
- Read markdown files directly
- Git history shows conversation evolution

---

## Agent Context

### How Agents Use Chat History

Agents can read their chat history to provide better responses:

```markdown
# Agent SOUL.md includes:

## Memory & Context

You have access to:
- `memory/` - Your daily journal entries
- `chat_history/one-on-one/` - Past user conversations
- `chat_history/groups/` - Community discussions (read-only)

Reference past conversations to provide context-aware help.
```

### Example Agent Workflow

**User:** "Remember that bug we discussed yesterday?"

**Agent reads:** `chat_history/one-on-one/2026-02-19_*.md`

**Agent responds:** "Yes! The authentication timeout issue. We decided to increase the session TTL to 24 hours. Have you deployed that fix yet?"

---

## File Locations

### Agent Chat History
```
AGENTS/{agent_id}/
└── chat_history/
    ├── one-on-one/
    │   ├── 2026-02-20_14-30-00.md
    │   └── 2026-02-20_15-45-12.md
    └── groups/                 # Symlinks to communities
        ├── engineering_team -> ../../../COMMUNITIES/engineering/chat_history/
        └── product_team -> ../../../COMMUNITIES/product/chat_history/
```

### Community Chat History
```
COMMUNITIES/{community_name}/
└── chat_history/
    ├── 2026-02-20_14-30-00.md
    └── 2026-02-20_15-45-12.md
```

---

## Markdown Format

Chat archives are saved as clean, readable markdown:

```markdown
# Chat Archive: Code Review Discussion

**Archived:** 2026-02-20 14:30:00
**Participants:** User, engineer

---

## User (2026-02-20T14:30:15Z)

Can you help me review this code?

---

## engineer (2026-02-20T14:30:45Z)

Of course! I'll review it now...

---
```

---

## Git Integration

Chat history is tracked in git for:
- ✅ Version control
- ✅ Backup and recovery
- ✅ Conversation evolution tracking
- ✅ Team collaboration

**Tip:** Use `git log AGENTS/engineer/chat_history/` to see agent's conversation history over time.

---

## API Reference

### Archive Agent Chat
```
POST /api/agents/:id/messages/archive
Body: { messages: Message[] }
Response: { jsonPath, workspacePath, title }
```

### Archive Community Chat
```
POST /api/channels/:community/:channel/archive
Body: { messages: Message[] }
Response: { jsonPath, workspacePath, title }
```

### List Archives
```
GET /api/agents/:id/messages/archive
Response: { archives: Archive[] }
```

---

## Troubleshooting

**Q: Agent can't access group chat history?**
- Check symlink exists: `ls -la AGENTS/{agent}/chat_history/groups/`
- Verify agent is in community: Check `COMMUNITIES/{community}/AGENTS.md`
- Refresh symlinks: Delete and re-archive a group chat

**Q: Markdown files missing?**
- Check dashboard archives exist first
- Run migration: `npm run migrate:chat-history`
- Verify workspace permissions

---

**See Also:**
- Architecture: `SYSTEM/docs/architecture/CHAT_MEMORY.md`
- Operations: `SYSTEM/docs/operations/CLEANUP_POLICIES.md`
