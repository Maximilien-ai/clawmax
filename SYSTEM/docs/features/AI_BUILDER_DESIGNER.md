# AI Builder / Designer

## Goal

Add a new top-level dashboard surface that helps new users design and build a ClawMax solution for the active workspace through a guided chat experience.

This is not a generic chat tab. It is a workspace builder surface with opinionated guidance toward:

- agents
- skills
- workflows
- groups
- communities
- templates
- testing and refinement

## Why

Feedback from demos is consistent:

- new users do not always know whether they should start with an agent, a team template, a skill, or a workflow
- the current dashboard surfaces are powerful but assume too much product understanding up front
- users want help moving from idea to working setup, not just a library of separate pages

The AI Builder / Designer should reduce that initial design friction and help users get to a working result faster.

## Product Shape

### Core Experience

The user opens a new top-level tab, likely first in the nav by default, and is greeted by a guided builder chat.

The chat asks:

- what are you trying to build?
- is this for one agent or a team?
- do you want to start from something existing or create new?
- what should success look like?
- how do you want to test it?

The builder then recommends one or more paths:

- use an existing agent in the workspace
- add or create a skill
- create a new agent from AI
- create a new agent from an existing template
- apply a team template
- refine an existing template already in the workspace
- create a new organization/team template

### Layout

First cut:

- center/left: builder chat
- right rail: work history, suggested actions, candidate templates, candidate agents, candidate skills, test checklist

The right rail should be persistent enough that users understand the builder is producing structured suggestions, not only chat text.

## Design Principles

### 1. Guide, do not dump

The builder should ask a few clarifying questions and reduce ambiguity before recommending action.

### 2. Prefer existing workspace assets when they fit

If the user already has an agent, team, template, or skill that is close to the need, recommend reuse/refinement before creating net-new artifacts.

### 3. Show recommended path plus alternatives

For example:

- Recommended: start from `Customer Support Team`
- Alternative: create a new 3-agent support team from AI
- Alternative: use the existing `support-writer` agent and add a triage workflow

### 4. Every suggestion should lead to a test

The builder should not stop at “create this.” It should also propose:

- how to test the result
- what success looks like
- what to refine if the test fails

### 5. Keep first version deterministic and high-signal

V1 should focus on good routing and recommendations, not broad autonomous building.

## V1 Scope

### In

- new top-level `Builder` or `AI Builder` tab
- guided chat shell
- right rail with:
  - current plan
  - suggested actions
  - matched templates
  - matched agents
  - matched skills
  - test suggestions
- intent routing for common requests:
  - single agent use case
  - single agent plus missing skill
  - team or organization use case
  - existing template refinement
  - greenfield build from AI
- action handoff links/buttons into existing surfaces:
  - create agent
  - AI generate agent
  - templates page
  - skills page
  - workflows page
  - agent chat/test

### Out for first cut

- fully autonomous multi-step creation without confirmation
- long-running background planner agents
- custom embedded design canvas
- automatic workflow execution from the builder
- direct mutation of many workspace assets in one shot without review

## Recommended V1 Flow

### Step 1: Capture user goal

Examples:

- “I want a research assistant that watches competitor moves”
- “I need a team for customer support escalation”
- “I want a travel planning setup for a family trip”

### Step 2: Classify the need

Decision buckets:

- existing asset reuse
- single agent
- single agent plus skill
- team template
- existing template refinement
- new team generation

### Step 3: Clarify only what matters

Ask 2-4 short questions max, for example:

- who is the end user?
- is this one agent or a team?
- do you need a standing workflow?
- do you already have something similar in this workspace?

### Step 4: Present a recommended path

Response should be structured:

- recommended path
- why
- what will be created or reused
- test plan
- fallback path

### Step 5: Hand off into action

Examples:

- “Open matching template”
- “Start AI Generate Agent with this prompt”
- “Use existing agent `market-guide` and add skill `github`”
- “Create team from `competitive-analysis-desk` and rename groups”

### Step 6: Validate result

The builder should surface a short test plan:

- send this first prompt to the agent
- run this workflow
- check these groups
- verify this artifact exists

## Routing Heuristics

### Existing agent

Prefer this path when:

- user asks for a narrow capability
- a matching agent already exists in the workspace
- the gap is usage or setup, not structure

### Add/create skill

Prefer this path when:

- the missing need is tool capability
- there is already a good agent but it lacks an integration or toolchain

### Agent template

Prefer this path when:

- the request maps well to a known role
- the user wants something fast and editable

### Team template

Prefer this path when:

- user asks for multiple roles, lanes, or handoffs
- the need is ongoing coordination rather than a one-off helper

### AI generation

Prefer this path when:

- there is no close template
- the use case is specific enough to describe but not represented well in catalog

## Right Rail Content

### V1 sections

- Current recommendation
- Clarifying answers
- Workspace matches
- Suggested next actions
- Test this result
- History

### Workspace matches

Should pull from:

- workspace agents
- local/system templates
- local/system skills
- workflows

## Suggested Navigation Label

Best options:

- `Builder`
- `AI Builder`
- `Designer`

Recommendation for V1:

- use `Builder` in nav
- use page title `AI Builder / Designer`

That keeps the nav compact while still describing the surface clearly on-page.

## Technical First Cut

### Frontend

- new page component under dashboard client
- chat-like composer and transcript UI
- right rail cards for suggestions and test steps
- links into existing routes

### Backend

- initial route that accepts:
  - prompt
  - workspace context
  - optional conversation state
- server-side workspace summarization:
  - agents
  - templates
  - skills
  - workflows
- deterministic recommendation output schema

### Output schema idea

- `intent`
- `clarifyingQuestions`
- `recommendedPath`
- `alternativePaths`
- `matchedAssets`
- `suggestedActions`
- `testPlan`

## Risks

- making the first version too autonomous and hard to trust
- returning generic advice instead of workspace-specific guidance
- creating overlap/confusion with Templates, Skills, and Agents pages
- trying to solve orchestration and artifact creation in the same first release

## V1 Success Criteria

- a new user can describe a use case and get a concrete recommended path in under 2 minutes
- the builder can route correctly between:
  - existing agent
  - skill gap
  - agent template
  - team template
  - AI generation
- each recommendation includes a clear test path
- user can jump from builder to the right existing dashboard action without confusion

## Monday Candidate

By Monday, a credible first cut would be:

- nav entry
- page shell
- guided builder chat
- deterministic recommendation cards
- workspace-aware template/agent/skill matches
- test-plan suggestions
- links into existing create/apply flows

That is enough for private testing and iteration before broader release.
