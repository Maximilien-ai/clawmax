# Build-a-Company Hackathon — April 24-26, 2026

> **Event:** [AGI House - Build-a-Company Hackathon](https://luma.com/buildacompany?tk=1zlVZU)
> **Branch:** `feat/build-a-company-hackathon`
> **Working Window:** April 24-26, 2026
> **Goal:** evolve ClawMax from agent/team orchestration into company-level orchestration with teams, teams-of-teams, chained team workflows, and team-facing output surfaces.

## Status — April 26, 2026

### Landed

- [x] workspace-local `Team` model and CRUD/storage
- [x] company/team template contract with `teams`
- [x] workflow execution outputs plus upstream `inputRefs`
- [x] team-targeted workflows
- [x] markdown-first workflow handoff model
- [x] AI generation for `company` plus inferred handoffs
- [x] org structure view and org chart for teams/companies
- [x] company delete flow with cascading confirmation
- [x] company/workflow import namespacing for multiple applies
- [x] hack test company template upgraded to explicit rooted company structure

### In Progress

- [ ] B2B generated company chaining and handoff validation
- [ ] company-scoped dashboard view for input/output/org
- [ ] third example company for demo validation

### Scope Simplification For Demo

- one workspace may contain multiple companies
- one dashboard view should focus on exactly one company at a time
- if no company is selected, the workspace can continue behaving like a team/agent workspace

## Strategy

Do not try to invent a fully separate "company platform" in three days.

Instead, ship a strong first slice around **three new first-class concepts**:
- **Team** — a leader plus members, with its own metadata and output surface
- **Company Template** — a higher-order template that can define teams and cross-team workflows
- **Workflow Output Contract** — structured outputs that can feed downstream workflows

This keeps the hackathon focused on extending the existing ClawMax model instead of replacing it.

## Primary Goals

### 1. Company Templates

Expand templates beyond:
- agents
- flat organizations

Toward:
- individual agents
- teams of agents
- teams of teams
- organization/company templates

Desired outcome:
- one template can define a company structure with named teams, leaders, members, and team-level workflows

### 2. Chained Workflow Inputs/Outputs

Improve workflow I/O so:
- one workflow can produce named outputs
- a downstream workflow can consume those outputs explicitly
- cross-team handoffs are visible and repeatable

Desired outcome:
- workflows behave more like connected production lanes than isolated prompts

### 3. Team and Org Visualization

Add a better view of teams:
- team leader
- team members
- reporting relationships
- cross-team structure

Desired outcome:
- an organizational flowchart or hierarchy view that makes teams-of-teams understandable at a glance

### 4. Better Built-In Generators

Improve built-in agents so they can generate:
- single agents
- teams
- companies / organizations
- team workflows and handoffs

Desired outcome:
- user can start from a company idea and get a credible multi-team operating structure

### 5. Team Output Surfaces

Add a team-facing output surface using the workspace-dashboard direction:
- team dashboard
- team page
- team input area
- team output/results area

Desired outcome:
- each team has a place to receive inputs and present outputs without forcing everything through generic workspace chat

## Suggested Scope Guardrails

To keep this realistic in three days:

1. **Use `team` as the first new primitive**
- Do not jump straight to arbitrary nested org graphs everywhere.
- Model "company" as a collection of teams plus parent/child team relationships.

2. **Define workflow I/O with a simple contract**
- Start with named outputs, references, and optional artifact paths.
- Avoid building a full dataflow engine in the hackathon window.

3. **Keep visualization read-focused first**
- prioritize understanding over editing
- render org hierarchy before attempting a full drag/drop org builder

4. **Reuse workspace dashboard patterns**
- team pages should extend the current dashboard/result model
- avoid inventing an entirely separate rendering system

5. **Ship one end-to-end demo path**
- one company template
- one org view
- one chained workflow path
- one team page

## Proposed Object Model

### Team

Candidate fields:
- `id`
- `name`
- `purpose`
- `leaderAgentId`
- `memberAgentIds`
- `parentTeamId`
- `childTeamIds`
- `tags`
- `inputSchema`
- `dashboardConfig`

### Company Template

Candidate sections:
- `agents`
- `teams`
- `groups`
- `communities`
- `workflows`
- `teamDashboards`
- `orgStructure`

### Workflow Output Contract

First-pass shape:

```json
{
  "outputs": {
    "brief": {
      "type": "markdown",
      "artifactPath": "deliverables/brief.md",
      "summary": "Planning brief for downstream execution"
    },
    "handoff": {
      "type": "json",
      "value": {
        "priority": "high",
        "ownerTeam": "growth"
      }
    }
  }
}
```

Downstream workflow config can then reference:
- previous workflow output keys
- execution artifact paths
- upstream workflow summaries

## Three-Day Sprint

## Day 1 — Foundation and Data Model

### Goal

Create the minimum model needed to represent teams and chained workflow outputs.

### Must Ship

1. **Team model and storage**
- define a first-pass team schema
- decide where teams live in workspace state
- support team leader + member relationships

2. **Company template contract**
- extend template parsing/storage to support teams
- make sure company/team templates can still map cleanly to current agents/groups/workflows

3. **Workflow output contract**
- allow workflows to define named outputs
- persist outputs on execution
- allow downstream workflows to reference upstream outputs

4. **Built-in generation plan**
- define what built-in agents/generators need to emit for agent vs team vs company generation

### Deliverables

- schema/types for team + company template + workflow outputs
- one sample company template in docs/spec form
- one chained workflow happy path in spec form

### Detailed Day 1 Task List

#### A. Team Model

- [x] define the TypeScript `Team` shape in the server/client shared contract area
- [x] decide team persistence location
  - likely workspace-local metadata under the current workspace model
  - avoid introducing a second config root unless necessary
- [x] define required vs optional fields
  - required: `id`, `name`
  - first-pass optional: `purpose`, `leaderAgentId`, `memberAgentIds`, `parentTeamId`, `tags`
- [x] decide whether team membership is agent-id only or can include team references
  - recommendation: Day 1 uses agent ids only; teams-of-teams should be represented through `parentTeamId` / child relationships, not recursive member lists
- [x] define one server read/write path for teams
  - list teams
  - get one team
  - save/update team

#### B. Company Template Contract

- [x] extend the template schema to support a `teams` section
- [x] define how `teams` relate to existing template sections
  - `agents` stay the source of agent definitions
  - `teams` describe structure and membership
  - `workflows` can target agents or teams
- [x] decide first-pass company-template semantics
  - recommendation: keep `type: organization` valid, add company/team capabilities without forcing a brand-new template type immediately
- [x] add one canonical example template in doc/spec form
  - leadership
  - product
  - engineering
  - growth
  - operations

#### C. Workflow Output Contract

- [x] define first-pass execution output shape
  - named outputs
  - output type
  - optional artifact path
  - optional structured value
  - summary text
- [x] decide where outputs live
  - recommendation: store on execution records first, not workflow definitions
- [x] define how downstream workflows reference upstream outputs
  - recommendation: `workflowOutputRef` object with `workflowId`, `outputKey`, and optional fallback text
- [x] define one happy-path handoff
  - Leadership kickoff output -> Product brief input
  - Product brief output -> Engineering plan input

#### D. Workflow Targeting / Team Chaining Decisions

- [x] decide whether workflows can target `teamIds` directly
  - recommendation: yes, but resolve teams to agents at execution time
- [x] decide whether one workflow can consume multiple upstream workflow outputs
  - recommendation: yes, but only as an array of explicit refs, not arbitrary query expressions
- [x] decide whether outputs are only from the latest execution or a specific execution
  - recommendation: Day 1 defaults to latest successful execution unless an explicit execution id is provided later

#### E. Built-In Generation Contract

- [x] define the expected generator output modes
  - `agent`
  - `team`
  - `company`
- [x] define the minimum structure the generator must produce for `company`
  - agents
  - teams
  - workflows
  - workflow handoffs
- [x] document what we will not do on Day 1
  - no full org editor
  - no arbitrary graph query language
  - no fully generic nested execution planner

### Day 1 Suggested Order

1. Team type + persistence contract
2. Template schema extension for teams
3. Workflow output/handoff contract
4. Team-targeted workflow resolution rules
5. Sample company template and demo handoff path

### Day 1 Design Recommendations

1. Keep `team` flat and explicit.
   Use parent/child relationships for hierarchy instead of recursive mixed team membership.

2. Put workflow outputs on executions, not on workflows.
   Workflows define what they may emit; executions capture what they actually emitted.

3. Resolve teams to agents as late as possible.
   The workflow engine should remain agent-execution based, with team targeting compiled down at runtime.

4. Start with one company template example and design around it.
   If the model cannot cleanly express the Leadership -> Product -> Engineering -> Growth handoff, it is too abstract.

5. Do not introduce a separate “company runtime”.
   The runtime should still be ClawMax workspaces, agents, workflows, and dashboards with teams layered on top.

## Day 2 — UI and Generation

### Goal

Make the new model visible and usable in the dashboard.

### Must Ship

1. **Teams page or Teams panel**
- list teams
- show leader + members
- show parent/child relationships

2. **Org visualization**
- first-pass hierarchy/org chart
- enough to understand teams-of-teams

3. **Generator improvements**
- built-in AI/builder flow can create:
  - single agent
  - team
  - company template

4. **Workflow chaining UI**
- expose upstream workflow outputs in a way users can inspect
- show when a downstream workflow depends on upstream team output

### Deliverables

- visible team/org UI in dashboard
- one generation flow that produces a team/company structure
- one demo-ready chained workflow display

## Day 3 — Team Pages and Demo Flow

### Goal

Close the loop with team-facing output surfaces and a complete demo path.

### Must Ship

1. **Team page / dashboard**
- team summary
- inputs
- latest outputs
- linked workflows
- recent artifacts/results

2. **One end-to-end company demo**
- input company idea
- generate company/team structure
- run at least one chained workflow path across teams
- inspect outputs on team pages/org view

3. **Polish and hardening**
- sample template cleanup
- docs
- known gaps and follow-ups

### Deliverables

- one credible company template demo
- one team dashboard page
- one org chart view
- one chained workflow handoff path

## Priority Order

If time gets tight, cut in this order:

1. ship the data model + one company template
2. ship workflow output chaining
3. ship org visualization
4. ship team dashboard
5. improve built-in generators beyond the basic happy path

## Suggested Demo Scenario

Best demo target for the hackathon:

- **Company:** AI startup / product studio
- **Teams:**
  - Leadership
  - Product
  - Engineering
  - Growth
  - Operations
- **Chained flow:**
  - Leadership kickoff -> Product brief -> Engineering implementation plan -> Growth launch plan -> Ops readiness summary

This is concrete, easy to explain, and directly shows teams-of-teams plus workflow chaining.

## Risks

### 1. Scope explosion
- company/org abstractions can become a full redesign very quickly
- mitigation: keep the first slice centered on `team`

### 2. Workflow chaining gets too abstract
- if output contracts are too generic, the UI will be vague
- mitigation: start with named outputs + artifacts + summaries

### 3. Visualization consumes too much time
- full editing UIs are expensive
- mitigation: prioritize read-only org chart first

### 4. Team pages duplicate workspace dashboards badly
- mitigation: reuse workspace dashboard/result components where possible

## Concrete Work Items

- [x] define `Team` type and persistence contract
- [x] define company-template extension contract
- [x] define workflow output/handoff contract
- [x] persist workflow execution outputs
- [x] add downstream workflow references to upstream outputs
- [x] add one sample company template
- [x] add a first-pass Teams UI
- [x] add org hierarchy / org chart view
- [x] extend generator flow for team/company creation
- [ ] add first-pass team dashboard/page
- [ ] create one end-to-end demo path
- [ ] document follow-up gaps after hackathon

## Suggestions

My main recommendation is to treat this hackathon as:
- **company orchestration on top of ClawMax**

Not:
- **a full replacement of ClawMax’s current workspace/agent/workflow model**

That means:
- teams become the main new abstraction
- companies are composed from teams
- workflows get explicit handoff contracts
- team pages become the new output surface

That is the highest-probability path to shipping something real in three days.
