# Workspace Summary Dashboard - Feature Spec

**Status:** V1 Implemented, Follow-up Iteration Needed
**Created:** 2026-03-31
**Priority:** High

---

## Overview

The Workspace Summary Dashboard is a **shareable, read-mostly, one-page dashboard** for a single workspace.

It is designed for **consumers of a workspace's output**, not just workspace builders. The goal is to let non-operator stakeholders understand what an agent team is doing, what it has produced, what is running now, and whether attention is needed, without requiring them to learn the full ClawMax dashboard.

Examples:
- marketing team reviewing an agent-run campaign workspace
- execs or investors checking current autonomous work
- clients reviewing results, costs, and current activity
- collaborators who need visibility without needing full operator access

---

## Problem

Today, ClawMax exposes the raw operator dashboard, but that view is optimized for building and debugging workspaces.

Important consumers need:
- a single shareable URL
- a visual summary at a glance
- live status without deep dashboard navigation
- read-only visibility into active work, outputs, and recent results
- a curated subset of workspace data, not the full operator surface

---

## Goals

1. Provide a one-page live summary of a workspace.
2. Make the page understandable to non-builders.
3. Support selective sharing of workspace sections.
4. Expose outputs and result links in a way that is useful immediately.
5. Preserve a strong distinction between read-only summary access and full ClawMax operator access.

---

## Non-Goals For V1

- Full operator control from the summary dashboard
- Workflow editing, agent editing, or admin controls
- Per-widget custom layout builder
- Cross-workspace portfolio dashboards
- Public anonymous internet indexing
- Fine-grained row/field-level ACLs beyond v1 link ownership + selected sections

---

## Primary Users

### 1. Workspace creators

They generate and manage the dashboard link.

Needs:
- choose what to expose
- copy/share/delete the link
- regenerate later if needed

### 2. Workspace consumers

They use the dashboard to understand what the workspace is doing.

Needs:
- quick summary
- recent outputs
- live activity
- confidence that data is current

---

## Core V1 UX

### Creation Flow

Add a `Generate Dashboard` action from the workspace list / workspace switcher context.

When clicked, show a modal with:
- dashboard name
- description / audience label
- section toggles
- optional expiration
- optional password / access mode if added in v1.1

Default selected sections:
- overview
- costs and budget
- agent status
- active notifications
- workflow status
- kickoff inputs
- recent results
- group chats

Optional hidden sections:
- budget
- notifications
- kickoff inputs
- execution history

### Generated Output

After generation:
- create a unique dashboard record bound to `workspace + creator + token`
- return a shareable link
- show `Copy link`
- show `Open`
- persist dashboard entry in workspace list / workspace settings

Stored dashboard actions:
- copy link
- open link
- edit visible sections
- regenerate token
- delete dashboard

---

## Information Architecture

The page should be a **single responsive dashboard page** with classic summary widgets and charts.

### V1 Sections

#### 1. Header

Show:
- workspace name
- summary title
- last refreshed timestamp
- live status indicator
- optional CTA links:
  - Open in ClawMax
  - Open workspace in ClawMax

#### 2. Overview Cards

Show:
- total agents
- online agents
- paused agents
- running workflows
- active notifications
- current workspace spend

#### 3. Cost + Budget

Show:
- current spend
- workspace budget
- remaining budget
- usage percentage
- simple time-series graph if cheap to implement

V1 graph options:
- sparkline of spend over time
- bar chart by day

#### 4. Agent Status

Show:
- agents with health chips:
  - online
  - paused
  - failing
  - budget-risk
- optional per-agent spend if enabled

Design:
- compact table or card grid
- colored health badges
- hover tooltip with last activity / current cost / limit

#### 5. Active Notifications

Show only unresolved notifications.

Examples:
- workflow failed
- agent blocked
- budget warning
- agent budget critical

This is read-only in v1.

#### 6. Workflow Status

Show:
- workflows running now
- next run schedule
- most recent status
- recent execution history

For each workflow:
- current state
- last run
- next run
- recent result summary

#### 7. Kickoff Input / Start Context

Show the input that started a workflow or latest run.

Examples:
- kickoff prompt
- selected template inputs
- repo / campaign / target context

This is important because consumers need to know what the system is responding to.

#### 8. Results / Outputs

Show recent outputs per run.

Examples:
- PR links
- GitHub issue links
- generated files
- downloadable artifacts
- external result links

This section is one of the main reasons the dashboard exists.

#### 9. Group Chats

Show recent workspace conversation surfaces that help consumers understand what is happening behind the scenes.

V1 shows:
- groups and communities with recent activity
- message counts
- latest message preview
- member counts
- simple unread/active indicator

This gives non-operators lightweight visibility into ongoing work without exposing the full chat UI.

---

## Current V1 Implementation

Implemented on `main`:
- shareable token-based workspace summary dashboard links
- per-workspace dashboard records with create/edit/regenerate/delete
- section selection during dashboard generation
- multiple display modes: standard, compact, detail
- read-only shared dashboard page
- overview, costs, agents, active notifications, workflows, kickoff summary, results, and group chats
- persistent dashboard management from the workspace switcher
- compact-mode summary charts for budget, agent status mix, and workflow status mix

Current limitations:
- kickoff inputs are still best-effort summaries rather than structured run inputs
- results are still inferred from available workflow/execution data, not normalized artifacts
- costs are snapshot-focused; no time-series graph yet
- group chats are summaries only, with no deep chat drilldown links yet
- compact dashboard drag-and-drop still has an ordering bug when reordering upward within the same column
- full-system `./SYSTEM/test.sh` depends on a locally reachable dashboard process during preflight

---

## Remaining Follow-up Work

- normalize workflow kickoff/start inputs for cleaner dashboard presentation
- normalize workflow outputs/artifacts and expose consistent result links
- add better cost history visualizations and time-series charts
- push compact mode further toward one-screen summaries with richer charts and less repeated text
- fix compact same-column upward drag-and-drop reordering so the layout editor is reliable in both directions
- add deeper workflow/result/group links where safe
- refine dashboard management layout and polish

---

## Permissions Model

### V1 Assumption

Use a **share token model**:
- generated dashboard gets a unique token
- token maps to one workspace dashboard config
- token is sufficient to view the summary page

### Access rules

Summary viewers can:
- read enabled dashboard sections
- open explicitly exposed artifact/result links

Summary viewers cannot:
- edit workspace
- run workflows
- modify agents
- change budget
- dismiss notifications

### Optional future hardening

- require authenticated ClawMax account
- allow only invited viewers
- per-dashboard expiration
- per-dashboard password
- audit log for views

---

## Data Sources

V1 should reuse existing dashboard APIs wherever possible.

Likely sources:
- `/api/system`
- `/api/notifications`
- `/api/budget`
- `/api/metering`
- `/api/workflows`
- workflow execution APIs
- agent listing/status APIs
- stored kickoff data from workflow/template execution
- artifact/result metadata from workflow runs

If existing APIs are too operator-shaped, add a new aggregate endpoint:

`GET /api/workspace-dashboards/:token`

This endpoint should return a **presentation-friendly aggregate payload** rather than forcing the client to stitch together many requests.

---

## Suggested V1 Data Shape

```ts
interface WorkspaceSummaryDashboard {
  id: string
  workspaceId: string
  title: string
  description?: string
  token: string
  sections: {
    overview: boolean
    costs: boolean
    agents: boolean
    notifications: boolean
    workflows: boolean
    kickoff: boolean
    results: boolean
  }
  createdBy: string
  createdAt: string
  updatedAt: string
}
```

Aggregate response:

```ts
interface WorkspaceSummaryPayload {
  dashboard: WorkspaceSummaryDashboard
  workspace: {
    id: string
    name: string
    lastUpdatedAt: string
  }
  overview: { ... }
  costs?: { ... }
  agents?: { ... }
  notifications?: { ... }
  workflows?: { ... }
  kickoff?: { ... }
  results?: { ... }
}
```

---

## UI Design Direction

### Principles

- one page
- glanceable first, drill-down second
- visually polished enough to share externally
- default to read-only trust and clarity
- use tooltips and hover states for extra detail

### Layout

- top summary strip
- 2-3 row dashboard composition
- charts and metric cards first
- tables/lists below
- results section high visibility

### Visuals

- cards
- trend lines / bar charts
- status chips
- progress bars
- tooltips for metadata

---

## V1 Build Plan

### Phase 1: Model + storage

- add workspace dashboard record storage
- support create/list/delete/regenerate-token

### Phase 2: Aggregate API

- create workspace summary endpoint by token
- normalize existing workspace data into one payload

### Phase 3: Read-only page

- public/shareable summary page route
- render core widgets
- responsive layout

### Phase 4: Creation UX

- generate-dashboard modal
- section toggles
- copy/open/delete actions from workspace list

### Phase 5: Result links

- attach workflow result links and artifacts cleanly
- ensure safe rendering of external/download links

---

## Recommended V1 Scope

Ship this first:
- shareable link creation
- one summary page
- overview cards
- workspace budget/cost section
- agent status section
- active notifications
- workflow now / history / next run
- kickoff summary
- recent result links

Defer:
- advanced graph customization
- dashboard theming
- viewer auth modes beyond token
- per-section custom layout positioning

---

## Open Questions

1. Should the link be token-only in v1, or require signed-in ClawMax users?
2. Should kickoff inputs show only latest run, or selectable recent runs?
3. How should result artifacts be normalized across heterogeneous workflows?
4. Should multiple dashboards per workspace be supported in v1, or only one?
5. Should the dashboard be discoverable from workspace list only, or also from Activity / Workflows?

---

## Recommendation

Build a **single-dashboard-per-workspace v1** with:
- token-based access
- configurable visible sections
- aggregate summary endpoint
- strong results section

That gets us to something demoable and useful quickly, while leaving room for stronger auth, richer artifact handling, and better customization later.

---

## See Also

- `SYSTEM/docs/BACKLOG.md`
- `SYSTEM/docs/MARCH_31_SPRINT.md`
