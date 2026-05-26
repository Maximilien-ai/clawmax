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

## Current Implementation Snapshot

As of `v1.6.0` on `main`, the first cut includes:

- top-level `Builder` nav entry
- workspace-aware recommendation routing across:
  - existing agents
  - skills/integrations
  - agent templates
  - team/company templates
  - AI-generate net-new agents
- right rail with:
  - current recommendation
  - matched workspace assets
  - suggested next actions
  - test guidance
  - session history
- inline recommendation card in the transcript
- low-confidence confirmation options
- starter prompt generation:
  - deterministic workspace-aware fallback
  - optional AI-backed regeneration
- shared full prompt editor with:
  - markdown preview
  - `Improve with AI`
  - optional improvement-direction instructions
  - attachment display/add/remove
  - resizable dialog
- Builder session history / archive / restore
- thumbs up / thumbs down local feedback
- direct handoff into Templates / Agents / Skills / Workflows
- built-in/system model preference support for Builder/system flows
- first-run onboarding that now points users toward Builder and BYOK before deeper setup

## Release Status

The initial Builder/Designer scope has landed for `v1.6.0`.

What is considered shipped in the first cut:

- Builder is the recommended first-run path
- direct handoffs exist for:
  - create workflow
  - create skill
  - refine template
  - create template
- session save/download/share flows exist
- built-in/system metering and model-preference support exist
- onboarding tour is implemented and theme-aware

What is still quality hardening rather than missing core scope:

- adding more real prompts to the Builder eval corpus
- tightening ambiguous reuse vs refine vs create-new ranking
- polishing share/export naming and remote-share UX

The next phase is:

- continue manual prompt QA against real workspace scenarios
- capture bad prompts or handoff misses
- feed those cases back into the eval corpus before the next release

## Builder Agent Roles

The Builder surface should be treated as a small family of built-in/system agents rather than one opaque assistant.

### 1. Builder Router Agent

Purpose:

- classify the user request
- decide whether the next best step is:
  - reuse existing agent
  - improve existing agent
  - add or create skill
  - use agent template
  - refine team template
  - create new team template
  - AI-generate net new

Current implementation status:

- shipped as deterministic routing logic plus workspace-aware matching
- backed by an external evaluation corpus rather than only hardcoded test cases
- now includes a first-cut organization-template family model so Builder can distinguish:
  - event operations
  - event analysis
  - research / analysis
  - personal admin
  - content / media
  - engineering / product
  - commerce / retail
  - business / company
- important: these families are routing hints, not a closed whitelist
- if Builder cannot confidently place a prompt into a known family, it should not force the request into one
- instead it should:
  - prefer `Create New Template` when the best existing match is still too generic
  - keep `Refine Template` available when there is a plausible near match worth adapting
  - surface both paths when the honest answer is “either refine this close starter or create a cleaner new one”

### 2. Builder Clarifier Agent

Purpose:

- detect low-confidence or ambiguous prompts
- ask for the minimum clarifying input needed
- surface explicit confirmation options instead of pretending certainty

Current implementation status:

- partial
- low-confidence recommendations already surface confirmation options
- follow-up clarification prompts should expand over the weekend

### 3. Builder Starter Prompt Agent

Purpose:

- suggest high-signal next prompts when the user is not sure how to begin
- ground suggestions in:
  - workspace name
  - existing agents
  - existing skills
  - existing workflows
  - existing templates
  - recent Builder prompts

Current implementation status:

- shipped with deterministic workspace-aware generation
- optionally enhanced with AI-backed regeneration
- duplicate/near-duplicate prompt suppression is in place

### 4. Builder Prompt Improver Agent

Purpose:

- take a weak/vague user request and rewrite it into a stronger build brief
- preserve user intent while making the request more actionable for:
  - templates
  - AI generation
  - workflows
  - skill suggestions

Current implementation status:

- shipped
- uses the shared prompt-expansion flow already used by other AI-generate surfaces
- supports optional user guidance such as:
  - make it shorter
  - bias toward workflows
  - keep the tone friendly
- in Builder, prompt improvement also includes attached-file context

### 5. Builder Session Export Agent

Purpose:

- turn Builder conversation, recommendation, and feedback into a design artifact
- export/share as markdown
- support later DocHub browsing and sharing

Current implementation status:

- planned
- Builder prompt editor already supports attachments and preview
- markdown/session export is still pending

### 6. Builder Telemetry / Feedback Sink

Purpose:

- persist thumbs up / thumbs down
- optionally share Builder session input/output with ClawMax.ai
- provide attribution and privacy-aware collection for quality improvement

Current implementation status:

- local feedback exists today
- remote sharing contract is planned
- initial web handoff/spec exists in:
  - [AI_BUILDER_WEB_CONTRACT.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/specs/AI_BUILDER_WEB_CONTRACT.md)

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

### 6. Do not overfit the taxonomy

The Builder family model should stay extensible.

- new domains should still route well before they are given a named family
- unknown domains should fall back to:
  - refine a close existing template
  - create a new template
  - confirm the path with the user when confidence is low
- evaluation coverage matters more than growing the family list too quickly

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
- “Create a new team template from this prompt and open the AI template wizard with the draft prefilled”

### Step 6: Validate result

The builder should surface a short test plan:

- send this first prompt to the agent
- run this workflow
- check these groups
- verify this artifact exists

## Routing Heuristics

### Template families

Builder now uses a first-cut family classifier for organization templates and prompt intent. This is specifically to reduce “same words, wrong kind of template” failures.

Current families:

- `operations_general`
- `event_ops`
- `event_analysis`
- `research_analysis`
- `personal_admin`
- `content_media`
- `engineering_product`
- `commerce_retail`
- `business_company`

This is not meant to be final taxonomy. It is the current quality layer used to keep cases like these from regressing:

- gallery show management should prefer event-ops templates, not astronomy/event-adjacent templates
- Lu.ma event analysis should prefer event-analysis templates, not event-ops templates
- blog launch should prefer content/media templates, not accidental tool matches
- household bills should prefer personal-admin templates, not broad executive-assistant templates
- competitor/TAM/positioning prompts should prefer research-analysis templates, not generic company structures

The family model should keep evolving as we add more eval cases.

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

## Prompt Editing and Attachments

The shared prompt editor should now be treated as the canonical AI-prompt editing surface across Builder and the other AI-generation flows.

Current behavior:

- opens in a large, resizable dialog
- no outside-click dismissal
- supports markdown preview
- supports `Improve with AI`
- supports optional improvement-direction instructions
- supports attachments
- Builder passes attachment context into prompt improvement so uploaded files influence the rewritten brief

This is intentionally better than the original small inline prompt fields and should become the default pattern rather than a Builder-only exception.

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

## Evaluation Set

Builder quality should be measured with an external evaluation corpus rather than hardcoded test arrays.

Current canonical file:

- [ai-builder-evals.json](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/dashboard/server/lib/ai-builder-evals.json)

This file should evolve into a broader suite covering:

- one agent vs team vs team-of-teams
- reuse existing vs improve existing
- use template vs refine template vs create new
- strong-signal vs low-confidence prompts
- niche-domain prompts where generic templates should lose to net-new template creation

Current progress:

- the eval corpus now covers:
  - explicit new team template asks
  - explicit new company template asks
  - explicit agent-template creation asks
  - ambiguous reuse-vs-new single-agent requests
  - domain-specific niche teams where generic templates should lose
  - template-start requests that also mention tools/integrations

Recent routing fixes driven by eval failures:

- avoid false refine matches from substring collisions such as `updates`
- treat explicit `create new ... template` language as `create_new`
- elevate company/organization prompts to `team_of_teams` scope when appropriate
- prevent explicit agent-template creation requests from being hijacked by tool-language/skills routing

## Sharing and Privacy Contract

Builder should follow the same overall direction as template feedback/share:

- local-first support in OSS/dev
- optional remote share when configured
- explicit attribution on the web side
- no silent collection without product/legal copy in the Terms / Privacy section

Planned remote data types:

- Builder input prompts
- Builder assistant recommendations
- thumbs up / thumbs down feedback
- optional session export metadata

Required product/legal support:

- privacy policy language in Dashboard terms
- clear UI disclosure where remote sharing is enabled
- ability to disable remote sharing in local/on-prem environments
- detailed web handoff in:
  - [AI_BUILDER_WEB_CONTRACT.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/specs/AI_BUILDER_WEB_CONTRACT.md)

## Metering and Model Selection

Built-in/system agents should not remain invisible when metering is enabled.

Weekend target direction:

- AI Builder and other built-in agents should have distinct meterable identities
- built-in usage should surface separately from user-created agents
- system agents should default to the best available configured model
- when multiple providers/models are available, operators should be able to select the system-agent model explicitly

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
