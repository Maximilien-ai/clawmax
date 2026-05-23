# Weekend Sprint: AI Builder / Designer

> Goal: ship a private first cut of the new AI Builder / Designer surface by Monday so we can test it internally and refine before public release.

## Sprint Status

### Completed

- top-level `Builder` nav entry and route
- branch-only Builder page shell
- backend Builder recommendation route and structured schema
- workspace-aware matching against agents, skills, templates, and workflows
- right rail with recommendation, asset matches, next actions, test plan, and history
- live chat transcript with inline recommendation card
- exact handoff links into agent, skill, workflow, and template destinations
- local Builder session history / archive / restore
- keyboard submit, voice-to-text input, and file/image attachment scaffolding
- focused automated Builder routing tests

### In Progress

- smarter recommendation quality across broader real prompts
- recommendation trust and ranking against mixed existing-vs-template-vs-new scenarios
- tighter UI polish for compactness and clarity
- stronger Builder evaluation coverage with externalized prompt cases

### Still Needed Before Prime Time

- larger automated prompt suite based on real user queries
- higher-confidence Builder evaluation set with expected answers
- more robust “match quality” thresholds for reuse vs refine vs new
- additional manual testing of handoff correctness and recommendation quality
- feature-flag or private-deploy hardening before merge to `main`
- built-in/system-agent metering and model-selection follow-through
- privacy/share contract for Builder sessions and feedback

## Target

- branch: `ai-builder-designer`
- sprint window: Friday May 22 through Monday May 26, 2026
- release target:
  - private/internal first cut by Monday
  - not public by default

## Why This Sprint

Recent demo feedback points to one recurring gap:

- people understand the value once they see ClawMax working
- they do not always know how to start building the right thing

The current product has strong creation surfaces, but they are separated across:

- Agents
- Skills
- Templates
- Workflows
- Organization

This sprint creates a single guided entry point that helps users choose the right path for their use case.

## Product Goal

Build a new top-level dashboard tab that acts like a guided builder for the active workspace.

It should help users:

- explain what they want to build
- get asked the right clarifying questions
- receive a recommended build path
- jump into the correct existing creation flow
- test whether the result actually works

## V1 Definition

V1 is intentionally narrow:

- guided chat
- structured suggestions
- workspace-aware recommendations
- test-plan guidance
- handoff into existing dashboard features

V1 is not:

- a fully autonomous builder
- a long-running planner swarm
- an invisible multi-mutation system

## Scope

### Must Have

1. new nav entry and page shell
2. builder chat UI
3. right rail with:
   - recommendation
   - asset matches
   - next actions
   - test plan
   - history
4. backend recommendation route with structured output
5. workspace-aware matching against:
   - agents
   - skills
   - organization templates
   - agent templates
   - workflows
6. recommendation routing for:
   - use existing agent
   - add/create skill
   - use agent template
   - use team template
   - use AI generation
7. explicit test guidance after recommendation

### Nice To Have

1. action shortcuts that prefill AI generate flows
2. template refinement suggestions for an existing local template
3. recommendation history persistence within the session
4. lightweight starter prompts for common use cases

### Out Of Scope

1. auto-applying multiple assets without review
2. background autonomous creation agents
3. large new workflow execution orchestration from the builder
4. public release hardening

## Workstreams

### 1. Product Framing

Deliverables:

- final nav label
- final page title
- right-rail information architecture
- structured recommendation format

Definition of done:

- page shape is stable enough to implement

### 2. Backend Recommendation Engine

Deliverables:

- initial builder route
- workspace summary input
- deterministic recommendation schema
- first-pass routing heuristics

Definition of done:

- backend can classify common prompts and return recommendation data

### 3. Frontend Builder Surface

Deliverables:

- page shell
- chat transcript area
- prompt composer
- right-rail cards
- action buttons / links into existing flows

Definition of done:

- user can enter prompt and receive a usable recommendation with next steps

### 4. Workspace Matching

Deliverables:

- search/match agents
- search/match skills
- search/match templates
- search/match workflows

Definition of done:

- recommendations are visibly grounded in the active workspace when possible

### 5. Validation Story

Deliverables:

- test-plan section in recommendations
- links to run or verify suggested result
- minimum regression coverage

Definition of done:

- every recommendation has a clear “how to test this” follow-through

## Proposed UX

### Page Header

- title: `AI Builder / Designer`
- subtitle: `Describe what you want to build in this workspace.`

### Main Column

- builder transcript
- clarifying questions
- user response
- recommended path

### Right Rail

- Current recommendation
- Matched workspace assets
- Suggested next actions
- Test this result
- Session history

## Core Prompt Types To Support First

1. single helper agent
- “I need an agent that researches competitors”

2. existing agent but missing capability
- “I already have a research agent, but it needs GitHub access”

3. team setup
- “I need a small support escalation team”

4. template refinement
- “I want to start from an existing template but adapt it for legal intake”

5. greenfield AI build
- “I need something custom for robotics prototype planning”

## Decision Rules

### Recommend existing agent

When:

- a close workspace agent already exists
- the need sounds usage/setup-oriented

### Recommend skill

When:

- the key gap is tool or integration capability

### Recommend template

When:

- the request maps cleanly to an existing role/team
- speed and editability matter more than novelty

### Recommend AI generation

When:

- no template is close enough
- the use case is sufficiently specific

## Test Strategy

### Automated

- backend recommendation-schema tests
- routing heuristic tests
- workspace match helper tests
- frontend render/state tests for builder cards

### Manual

1. single-agent prompt
2. team prompt
3. skill-gap prompt
4. existing-template prompt
5. no-good-match prompt
6. verify handoff links open the right destination
7. verify test-plan suggestions are useful and specific

## Execution Plan

### Friday

1. finalize product shape
2. add branch-only docs
3. implement backend schema and route
4. stub frontend page shell

Exit criteria:

- docs are clear
- route exists
- page shell exists

### Saturday

1. implement workspace-aware matching
2. implement first-pass routing
3. wire frontend transcript and right rail
4. add action cards and handoff links

Exit criteria:

- builder returns useful recommendations for core prompt types

### Sunday

1. harden prompt routing
2. improve right rail clarity
3. add tests
4. run focused manual validation

Exit criteria:

- first cut feels coherent and trustworthy in internal testing

### Monday

1. final polish
2. private internal handoff
3. decide whether to keep branch-only or merge behind a flag

Exit criteria:

- private first cut is demoable
- follow-up backlog is clear

## Risks

- trying to build full autonomy instead of good routing
- making recommendations too generic
- duplicating existing creation UX instead of guiding into it
- not grounding recommendations in actual workspace state

## Shipping Recommendation

For first release:

- keep behind a feature flag or branch-only deploy
- do not put in the public release line until internal feedback is positive

## Immediate Next Build Slice

1. expand Builder evaluation queries from real usage examples
2. improve recommendation scoring and thresholds
3. add more handoff and UI state coverage
4. run another round of focused internal prompt validation
5. decide whether the next cut stays branch-only or moves behind a flag

## Weekend Priority Order

Lowest-risk to hardest:

1. keep running focused Builder manual tests against real prompts
2. maintain the external Builder evaluation corpus and wire new prompts into automated checks
3. expand the Builder design doc to cover the full built-in agent family
4. add `Improve with AI` for Builder prompts
5. add Builder markdown session export plus DocHub entry strategy
6. define remote Builder session/feedback sharing contract with ClawMax.ai web
7. add privacy-policy coverage for Builder session and feedback collection
8. track built-in/system Builder usage in metering
9. surface built-in/system agents distinctly in metering UI
10. add explicit model-selection controls for built-in/system agents

## This Weekend Deliverables

### Documentation and Test Backbone

- Builder design doc covers:
  - router agent
  - clarifier agent
  - starter prompt agent
  - prompt improver agent
  - export agent
  - telemetry/feedback sink
- external evaluation set lives outside the test file
- sprint/backlog explicitly track the remaining Builder work

### Product Quality

- continue real-prompt validation
- add more ambiguous / niche prompt cases
- confirm Builder chooses:
  - one agent
  - team
  - team of teams
  - existing asset improvement
  - existing template refinement
  - net-new template or generation

### Web / Privacy Contract

- define the web-team requirements for:
  - sharing Builder input/output
  - sharing thumbs feedback
  - attribution/auth
  - privacy/TOS support

## Open Questions

1. When Builder shares remote sessions, should it send full transcript turns or only final prompt/recommendation pairs by default?
2. Should Builder export one markdown design document per archived session or support multi-session append in a single workspace design log?
3. Should system-agent model selection live under `BYOK`, a dedicated `System Agents` section, or both?
