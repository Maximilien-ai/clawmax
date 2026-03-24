# Multiagent Group Chat Feature

**Status:** ✅ COMPLETED (Archived 2026-02-20)
**Priority:** High
**Estimated Effort:** 1.5-2 hours
**Created:** 2026-02-19
**Completed:** 2026-02-19

**Implementation:**
- Commit `83fe654`: Complete group chat with incremental typing indicators, history & export
- Commit `7052600`: Add group chat with @mentions and agent responses
- File: `SYSTEM/dashboard/client/src/components/GroupChatPanel.tsx`
- Features: Multiagent @mentions, typing indicators, message history, export functionality

## Overview

Enable users to chat with **multiple agents simultaneously** in the ClawMax dashboard, seeing all their responses in a unified chat interface - like a group chat where each agent responds independently.

## Problem Statement

Currently, users can chat with agents:
- One-on-one in the dashboard
- Via WhatsApp groups (requires phone number per agent)

**Challenge:** Provisioning WhatsApp numbers for many agents is expensive and doesn't scale.

**Opportunity:** Enable group orchestration directly in the dashboard without requiring phone numbers.

## Key Benefits

- ✅ **No WhatsApp cost** - Chat with unlimited agents without phone numbers
- ✅ **Orchestrate specialists** - Get multiple expert perspectives on one problem
- ✅ **Compare approaches** - See different agent strategies side-by-side
- ✅ **Collaborative solving** - Agents work independently on the same task
- ✅ **Scalable** - Works for 2 agents or 20 agents

## Use Cases

### 1. Product Planning
**Scenario:** User asks "What should our Q1 roadmap focus be?"
**Group:** product-manager, product-owner, engineer, qa-engineer
**Value:** Get strategic, technical, and quality perspectives in one conversation

### 2. Code Review
**Scenario:** User shares code snippet for review
**Group:** senior-engineer, security-engineer, performance-engineer
**Value:** Comprehensive multi-angle code analysis

### 3. Technical Design
**Scenario:** "How should we architect the new payment system?"
**Group:** backend-engineer, devops-engineer, security-engineer
**Value:** Holistic architecture discussion

### 4. Bug Triage
**Scenario:** Production issue investigation
**Group:** engineer, qa-engineer, devops-engineer
**Value:** Parallel investigation from different expertise areas

## Proposed UX/UI

### 1. Group Selection Flow

```
┌─────────────────────────────────────────────┐
│ Create Group Chat                         × │
├─────────────────────────────────────────────┤
│                                             │
│ Select Agents:                              │
│ ☐ Select All (8 agents)                    │
│                                             │
│ Filter by tag: [All ▼]                     │
│                                             │
│ ☑ engineer           [engineering]         │
│ ☑ product-manager    [product]             │
│ ☑ qa-engineer        [engineering, qa]     │
│ ☐ release-engineer   [engineering]         │
│ ☐ max0               [assistant]           │
│                                             │
│ Quick selections:                           │
│ [All Engineering] [Product Team] [All]     │
│                                             │
│ Save as preset: [____________]  [Save]     │
│                                             │
│         [Cancel]  [Start Chat (3 agents)]  │
└─────────────────────────────────────────────┘
```

### 2. Group Chat Interface

```
┌──────────────────────────────────────────────┐
│ 💬 Group Chat: Product Team (3)           × │
│ engineer • product-manager • qa-engineer     │
├──────────────────────────────────────────────┤
│                                              │
│ 👤 You                            10:23 AM  │
│ ┌──────────────────────────────────────┐   │
│ │ What's our Q1 roadmap priority?      │   │
│ └──────────────────────────────────────┘   │
│                                              │
│ 🤖 product-manager                10:23 AM  │
│ ┌──────────────────────────────────────┐   │
│ │ Based on market analysis, I recommend │   │
│ │ focusing on mobile app performance.   │   │
│ │ Our user surveys show 67% experience  │   │
│ │ lag on older devices...               │   │
│ └──────────────────────────────────────┘   │
│ ✓ Complete                                  │
│                                              │
│ 🤖 engineer                       10:23 AM  │
│ ┌──────────────────────────────────────┐   │
│ │ From a technical perspective, we need │   │
│ │ to address our database bottlenecks... │   │
│ └──────────────────────────────────────┘   │
│ ⟳ Responding...                             │
│                                              │
│ 🤖 qa-engineer                    10:23 AM  │
│ ⟳ Thinking...                               │
│                                              │
├──────────────────────────────────────────────┤
│ Type a message...                    [Send] │
└──────────────────────────────────────────────┘
```

### 3. Response Display Options

**Sort by:**
- ⏱ Chronological (default) - As responses arrive
- 🔤 Alphabetical - By agent name
- 🏷 By tag - Grouped by agent tags

**Actions per response:**
- 📋 Copy response
- 💬 Reply to this agent only
- 👁 Hide/show this agent going forward

## Technical Architecture

### Backend API

#### Endpoint: `POST /api/agents/group-chat/messages`

**Request:**
```json
{
  "agentIds": ["engineer", "product-manager", "qa-engineer"],
  "message": "What's our Q1 roadmap priority?",
  "sessionId": "group-chat-uuid-123" // optional, auto-generated if not provided
}
```

**Response:** Server-Sent Events (SSE) stream
```
data: {"type":"start","agentId":"engineer"}
data: {"type":"chunk","agentId":"engineer","text":"From a technical"}
data: {"type":"chunk","agentId":"engineer","text":" perspective..."}
data: {"type":"done","agentId":"engineer"}

data: {"type":"start","agentId":"product-manager"}
data: {"type":"chunk","agentId":"product-manager","text":"Based on"}
...
```

**Implementation:**
```typescript
router.post('/group-chat/messages', async (req, res) => {
  const { agentIds, message, sessionId } = req.body

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const groupSessionId = sessionId || generateUUID()

  // Spawn parallel openclaw agent calls
  const agentProcesses = agentIds.map(agentId => {
    return spawnAgentChat(agentId, message, groupSessionId, (event) => {
      res.write(`data: ${JSON.stringify({...event, agentId})}\n\n`)
    })
  })

  await Promise.all(agentProcesses)
  res.end()
})
```

#### Endpoint: `GET /api/agents/group-chat/history/:sessionId`

**Response:**
```json
{
  "sessionId": "group-chat-uuid-123",
  "agentIds": ["engineer", "product-manager"],
  "messages": [
    {
      "role": "user",
      "content": "What's our Q1 priority?",
      "timestamp": "2026-02-19T10:23:00Z"
    },
    {
      "role": "assistant",
      "agentId": "engineer",
      "content": "From technical perspective...",
      "timestamp": "2026-02-19T10:23:05Z"
    }
  ]
}
```

### Frontend Components

#### 1. `SelectGroupModal.tsx`
- Agent multi-select with checkboxes
- Tag-based filtering
- Quick selection buttons
- Save/load group presets (localStorage)

**State:**
```typescript
interface GroupSelectionState {
  selectedAgentIds: Set<string>
  filterTag: string | null
  presetName: string
}
```

#### 2. `GroupChatPanel.tsx`
- Multiagent chat interface
- SSE streaming integration
- Per-agent loading states
- Response sorting/filtering

**State:**
```typescript
interface GroupChatState {
  sessionId: string
  agentIds: string[]
  messages: GroupMessage[]
  loadingAgents: Set<string>
  hiddenAgents: Set<string>
  sortBy: 'chronological' | 'alphabetical' | 'tag'
}

interface GroupMessage {
  role: 'user' | 'assistant'
  agentId?: string
  content: string
  timestamp: string
  status?: 'thinking' | 'responding' | 'complete' | 'error'
}
```

### Session Storage

**Group chat sessions stored per-agent:**
```
~/.openclaw/agents/{agentId}/sessions/group-chat-{groupSessionId}.jsonl
```

Each agent maintains their own conversation thread, linked by the shared `groupSessionId`.

## Implementation Plan

### Phase 1: Core Backend (30 min)
- [ ] Create `/api/agents/group-chat/messages` endpoint with SSE
- [ ] Implement parallel agent chat spawning
- [ ] Add session ID tracking and storage
- [ ] Test with 2-3 agents in parallel

### Phase 2: Core Frontend (45 min)
- [ ] Create `SelectGroupModal.tsx` component
- [ ] Create `GroupChatPanel.tsx` component
- [ ] Integrate SSE streaming client
- [ ] Add "Group Chat" button to agents header
- [ ] Wire up state management
- [ ] Test end-to-end flow

### Phase 3: Enhanced Features (30 min - Optional)
- [ ] Response sorting options (chronological/alphabetical/tag)
- [ ] Per-agent hide/show toggles
- [ ] Group presets save/load
- [ ] Session history list
- [ ] Retry failed agent calls
- [ ] Copy individual responses
- [ ] "Reply to agent only" follow-ups

### Phase 4: Polish & Safety (15 min)
- [ ] Add max agent limit warning (suggest 10)
- [ ] Loading states and error handling
- [ ] Empty states and help text
- [ ] Mobile responsive layout

## Edge Cases & Considerations

### 1. Agent Failures
**Problem:** What if one agent fails while others succeed?
**Solution:** Show error state for that agent, allow retry, continue with others

### 2. Response Ordering
**Problem:** Responses arrive out of order
**Solution:**
- Default: Show in arrival order (most exciting)
- Option: Re-sort by agent name or tag
- Timestamp each response

### 3. Session Management
**Problem:** How to persist group chats across page refreshes?
**Solution:** Store sessionId in component state, allow "reopen" from history

### 4. Cost Awareness
**Problem:** User sends to 20 agents, high token cost
**Solution:**
- Show warning when selecting >10 agents
- Display estimated token cost (optional)
- "Are you sure?" confirmation for large groups

### 5. Agent Context Isolation
**Problem:** Should agents see each other's responses?
**Solution for v1:** No - each agent responds independently
**Future:** Add "collaborative mode" where agents see context

### 6. Concurrent Messages
**Problem:** User sends second message while first still streaming
**Solution:** Queue messages or disable input until complete

## Success Metrics

- [ ] Users create at least one group chat per session
- [ ] Average group size: 3-5 agents
- [ ] Group chats become primary interaction mode for complex tasks
- [ ] 60%+ of multiagent tasks use dashboard vs WhatsApp

## Open Questions

1. **Context sharing:** Should agents see each other's responses in same session?
   - **Recommendation:** No for v1 (simpler), add as "collaborative mode" later

2. **Cost awareness:** Show estimated cost per message (tokens × agent count)?
   - **Recommendation:** Optional, add in Phase 3

3. **Response synthesis:** Add "Summarize all responses" button using one agent?
   - **Recommendation:** Great for Phase 3 enhancement

4. **Max group size:** Hard limit or soft warning?
   - **Recommendation:** Soft warning at 10, hard limit at 20

5. **Group persistence:** Auto-save group compositions for reuse?
   - **Recommendation:** Yes, as "presets" in localStorage

## Future Enhancements

### V2: Collaborative Mode
- Agents see each other's responses in context
- Enable agent-to-agent discussion
- User can moderate/guide the conversation

### V3: Workflows
- Define multi-step group workflows
- Sequential vs parallel execution
- Conditional routing based on responses

### V4: Analytics
- Track most effective agent combinations
- Response quality metrics
- Collaboration patterns

## References

- Existing single-agent chat: `client/src/components/ChatPanel.tsx`
- SSE implementation: `server/routes/agents.ts` (WhatsApp pairing flow)
- Agent list UI: `client/src/pages/Agents.tsx`

---

**Ready to implement when greenlit!** 🚀
