# Three-Day Finish Sprint: April 10-12

> Goal: reach feature completeness on the current sprint today, use Saturday for partner/template experimentation, and reserve Sunday for hardening/polish so `v1.3` can ship Sunday night or Monday morning.

## Release Target

- target release: `v1.3.0`
- target cut window: Sunday night, fallback Monday morning
- principle:
  - today = finish the product surface
  - Saturday = validate partner/template experiments
  - Sunday = stabilize, polish, test, and release

## Current State

Already shipped in this sprint:
- browser-vault `Keys & Secrets`
- onboarding template recommendations first slice
- AI template generation/apply first pass
- workflow run-level input overrides first slice
- communications bulk actions parity
- runtime/model enforcement fixes in direct chat and workflow paths

Still open and important:
- example-aware AI template generation
- scalable middle workflows in AI-generated templates
- template feedback / ratings first slice
- partner/template experimentation with Blaxel and Redis
- Sunday hardening, polish, and release prep

## Priority Order

### 1. AI Template Quality Follow-Through

Why first:
- highest product value today
- directly affects template completeness and trust
- still the biggest gap in real prompts like Camera West

Scope:
- preserve and explicitly use examples, URLs, and style references in AI generation
- kickoff workflow must always exist and be first
- middle workflows can scale/fan out when the prompt implies many images, items, or posts
- final workflow must be singleton-like and explicitly produce or confirm the final output
- continue improving workflow input authoring in the wizard

Definition of done:
- a real long prompt with examples produces:
  - usable team
  - usable workflows
  - kickoff + middle + final output shape
  - visible examples/style influence

### 2. Template Feedback / Ratings First Slice

Why second:
- needed before broader user testing and promotion logic
- small but high-signal product loop

Scope:
- star rating
- optional short follow-up questions, max 5
- first-pass storage and display

Suggested questions:
- was it easy to use?
- did it solve your use case?
- did you customize it?
- what other use case should this support?
- any suggestions?

Definition of done:
- user can submit feedback on a template from the Templates page

### 3. Small-Business Marketing Template Pack

Why third:
- strong demand signal
- useful for hackathon/demo and external testing

Scope:
- one planning/budget template
- one channel-prioritization template
- one ads-performance review template

Candidate channels:
- Instagram / Facebook
- YouTube
- Google Ads / Google News

Definition of done:
- 2-3 suggested starter templates that are editable/refinable

## Today: Thursday April 10

### Must Finish

1. example-aware AI generation
2. scalable workflow generation follow-through
3. workflow input authoring follow-through
4. template feedback / ratings first slice if time remains after 1-3

### Concrete Work

1. use examples in AI generation
- extract and preserve example blocks / URLs from the user prompt
- explicitly instruct the generator to imitate style/format when examples are present
- ensure example-heavy prompts do not get flattened into generic team/workflow output

2. finish workflow quality
- kickoff always first
- middle steps can be serial or parallel depending on prompt
- final step produces output or explicit completion confirmation
- if a workflow should scale, make that explicit in content/instructions

3. finish workflow input story
- prompt editor available at start and later steps
- form builder generates run inputs
- runtime renders typed fields:
  - text
  - checkbox
  - select
- kickoff workflow should be the first place this feels solid

4. if time remains
- template feedback / ratings first slice

### Exit Criteria For Today

- one long example-heavy prompt produces a credible editable template
- generated workflow structure is correct
- kickoff has useful inputs
- one meaningful template feedback loop exists or is very close

## Saturday: Partner Hackathon

### Goal

Experiment with partners and new templates, not broad cleanup.

### Focus

1. Blaxel experiments
- validate partner-aware flows
- check useful partner-specific template paths

2. Redis experiments
- test memory/state-oriented workflows
- validate runtime/defaults/secret usage

3. new templates
- run the most promising new template pack items
- refine based on real runs, not theory

### Success Looks Like

- at least one Blaxel-flavored success path
- at least one Redis-flavored success path
- at least one new/refined template that clearly benefits from a partner

## Sunday: Hardening + Polish

### Goal

Spend Sunday mostly on polish and release-readiness, not new surface area.

### Focus

1. polish
- prompt display
- workflow run UX
- template apply clarity
- result surfacing

2. hardening
- repeated apply / upgrade edge cases
- runtime/model trust re-check
- local-model UX/progress
- known issue triage

3. release prep
- typecheck/tests
- focused smoke pass
- docs cleanup
- release notes

### Release Gate

Before `v1.3.0`:
- AI template generation feels complete enough for real prompts
- partner experiments have at least one validated success path
- no known high-risk runtime/model mismatch in the primary tested flows
- no major blocker in template apply / workflow run / chat

## Explicit Defers Until After `v1.3`

- full template promotion system beyond first ratings slice
- broader AG-UI adoption
- deeper marketplace/publication work
- broad semantic overhaul beyond current onboarding/template flow
