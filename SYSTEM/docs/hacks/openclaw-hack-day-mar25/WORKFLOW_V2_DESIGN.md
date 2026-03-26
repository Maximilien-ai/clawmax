# Workflow v2 — Autonomous Multiagent Coordination

> Designed at OpenClaw Hack Day, March 25, 2026
> Based on real-world observation: RAG Team agents block waiting for input with no way to surface blockers or unblock each other.

## Problem Statement

Today's workflow system is **fire-and-forget cron**. Agents:
- Block waiting for human input with no way to signal it
- Can't communicate 1-1 with other agents to resolve dependencies
- Don't know what other agents are doing or waiting on
- Have no way to show progress or completion
- Require human to manually poll each agent/group for status

The result: a team of 6 agents mostly idle, waiting for someone to notice they're stuck.

## Design: Five Pillars

### 1. Agent Blocker Surfacing + Dynamic UI

**The killer feature.** When an agent is blocked, it should:
- Declare what it's blocked on (structured data, not just text)
- Surface the blocker as a notification with an **actionable dynamic UI**
- Allow human OR another agent to resolve the blocker inline

```
Notification: 🔴 data-engineer1 is blocked
  "Need confirmation: Use Milvus local or Weaviate Cloud for ingestion?"

  [Milvus Local]  [Weaviate Cloud]  [Let me specify...]
```

**Implementation:**
- Agents emit structured blocker events: `{ type: "choice", options: [...] }` or `{ type: "approval", action: "..." }` or `{ type: "input", prompt: "..." }`
- Notification center renders dynamic UI based on blocker type
- Human clicks a button → response sent back to agent automatically
- Other agents can also resolve blockers if they have the context

**Blocker types:**
| Type | UI | Example |
|------|-----|---------|
| `choice` | Radio buttons | "Which VDB?" → [Milvus] [Weaviate] [Qdrant] |
| `approval` | Yes/No | "Proceed with ingestion of 2,636 docs?" → [Approve] [Reject] |
| `input` | Text field | "Enter OpenAI API key" → [____] [Submit] |
| `delegation` | Agent picker | "Need search-engineer to test queries" → [Assign] |
| `waiting` | Status | "Waiting for data-pipeline to complete" → [Check Status] |

### 2. Agent-to-Agent Direct Communication

Agents need to talk to each other 1-1, not just via group broadcast:
- Agent A can send a message directly to Agent B
- Agent B receives it as a notification/prompt
- Response flows back to Agent A

**Use cases:**
- Planner asks Data Engineer: "How many docs ingested so far?"
- Eval Engineer tells Search Engineer: "Accuracy is low, try hybrid search"
- Ops Engineer asks Planner: "Ready to deploy? Eval results look good."

**Implementation:**
- `POST /api/agents/{fromId}/message/{toId}` — send direct message
- Recipient agent gets the message as next prompt via gateway
- Conversation history stored per agent-pair

### 3. Workflow Dependencies & Parallel Execution

Workflows need a DAG (directed acyclic graph), not just a flat list:

```yaml
workflows:
  - id: kickoff
    type: once          # Run once on template apply
    targets: planner

  - id: rag-setup
    depends_on: [kickoff]
    targets: planner

  - id: data-pipeline
    depends_on: [rag-setup]    # Sequential gate
    targets: data
    parallel: true              # N agents run concurrently

  - id: search-tuning
    depends_on: [rag-setup]    # Same gate — parallel with data-pipeline
    targets: search

  - id: eval-cycle
    depends_on: [data-pipeline]  # Waits for ingest to complete
    targets: eval

  - id: deploy
    depends_on: [eval-cycle]     # Only after evals pass
    targets: ops

  - id: completion
    depends_on: [deploy]
    type: completion            # Marks the pipeline as done
```

**Visualization:** Mermaid-style DAG in the Workflows page showing:
- Which workflows are pending/running/completed/blocked
- Arrows showing dependencies
- Color coding: green (done), blue (running), yellow (blocked), gray (pending)

### 4. Workflow Progress Tracking

Each workflow should report progress:

```
Data Pipeline: ████████░░ 80% (2,109 / 2,636 docs)
  data-engineer1: 1,200 docs ingested
  data-engineer2: 909 docs ingested

Search Tuning: ██░░░░░░░░ 20%
  search-engineer: Testing semantic mode (1/3 modes)

Eval Cycle: ░░░░░░░░░░ 0% (waiting on Data Pipeline)
```

**Implementation:**
- Agents report progress: `{ workflow: "data-pipeline", progress: 0.8, detail: "2109/2636 docs" }`
- Workflow page shows aggregate progress bar
- Progress feeds into dependency resolution (eval-cycle starts when data-pipeline hits 100%)

### 5. Lifecycle Workflows (Kickoff, Monitor, Completion)

Three special workflow types every org template should include:

#### Kickoff Workflow
- **Type:** `once` — runs exactly once when template is applied
- **Target:** planner/lead agent
- **Content:** Pre-built prompt with project context, team roster, and instructions
- **Replaces:** The manual "paste a big prompt to get started" step

#### Monitor Workflow
- **Type:** `recurring` — runs on cron (e.g., every 30 min or hourly)
- **Target:** all agents or planner
- **Content:** "Report current status, blockers, and progress percentage"
- **Output:** Aggregated status report in a dashboard widget

#### Completion Workflow
- **Type:** `conditional` — triggers when all dependencies are met
- **Target:** planner + human
- **Content:** Summary of what was accomplished, final metrics, next steps
- **Action:** Mark the project/pipeline as complete

## Template Integration

Org templates should include:

```json
{
  "lifecycle": {
    "kickoff": {
      "target": "planner",
      "prompt": "You are the lead planner for a RAG project. Your team: ..."
    },
    "monitor": {
      "schedule": "0 */1 * * *",
      "target": "all"
    },
    "completion": {
      "depends_on": ["deploy"],
      "target": "planner"
    }
  }
}
```

## Priority Order

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| P0 | Blocker surfacing + dynamic UI | Unblocks agents immediately | Medium |
| P0 | Kickoff workflow in templates | Eliminates manual prompt step | Small |
| P1 | Agent-to-agent messaging | Enables autonomous coordination | Medium |
| P1 | Workflow progress tracking | Visibility into what's happening | Medium |
| P2 | Workflow DAG + dependencies | Proper sequencing | Large |
| P2 | Monitor + completion workflows | Full lifecycle automation | Medium |
| P3 | DAG visualization in UI | Beautiful but not blocking | Medium |

## Success Metric

A RAG Team template that, after a single "kickoff" click:
1. Planner creates the plan autonomously
2. Agents execute in parallel where possible
3. Blockers surface as notifications with one-click resolution
4. Human sees progress without polling
5. Pipeline completes and reports results

Zero manual prompting after kickoff.
