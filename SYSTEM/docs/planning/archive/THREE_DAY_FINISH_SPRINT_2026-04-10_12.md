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
- example-aware AI template generation
- scalable workflow structure in AI-generated templates
- workflow input authoring with typed runtime inputs
- template apply hardening for workflow/agent conflicts and preferred-model guidance
- initial organization-template audit and canonicalization pass

Still open and important:
- broader system-template audit and cleanup beyond the first normalized batch
- partner/template experimentation with Blaxel and Redis
- on-prem deployment validation and runtime packaging sanity check
- Sunday hardening, polish, and release prep

Completed today:
- template feedback / ratings first slice
- local-first plus optional remote feedback sink routing
- template card rating summaries and rating filters
- feedback docs / release handoff for CLI and deployment teams

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

1. finish template-library audit/canonicalization for the highest-value system templates
2. template feedback / ratings first slice if time remains
3. partner/template hackathon prep

### Concrete Work

1. use examples in AI generation
- extract and preserve example blocks / URLs from the user prompt
- explicitly instruct the generator to imitate style/format when examples are present
- ensure example-heavy prompts do not get flattened into generic team/workflow output
- status: shipped in first pass; keep validating against long prompts and patching edge cases

2. finish workflow quality
- kickoff always first
- middle steps can be serial or parallel depending on prompt
- final step produces output or explicit completion confirmation
- if a workflow should scale, make that explicit in content/instructions
- status: shipped in first pass; now audit older templates for parity

3. finish workflow input story
- prompt editor available at start and later steps
- form builder generates run inputs
- runtime renders typed fields:
  - text
  - checkbox
  - select
- kickoff workflow should be the first place this feels solid
- status: shipped in first pass; keep refining apply/edit UX

4. if time remains
- template feedback / ratings first slice

### Exit Criteria For Today

- one long example-heavy prompt produces a credible editable template
- generated workflow structure is correct
- kickoff has useful inputs
- multi-template apply in one workspace does not silently cross-wire pipelines
- one meaningful template feedback loop exists or is very close

## Saturday: Partner Hackathon

### Goal

Use Saturday for high-signal partner and deployment validation, not broad feature expansion.

### Focus

1. Blaxel experiments
- validate partner-aware flows
- check useful partner-specific template paths
- verify partner envs/secrets/template apply/runtime flow

2. Redis experiments
- test memory/state-oriented workflows
- validate runtime/defaults/secret usage
- confirm useful result surfacing, not just successful execution

3. on-prem deployment
- verify container/on-prem runtime assumptions
- confirm setup/auth/runtime persistence path on a clean deployment target
- capture exact gaps for Sunday hardening instead of hand-waving them

4. new templates
- run the most promising new template pack items
- refine based on real runs, not theory

### Success Looks Like

- at least one Blaxel-flavored success path
- at least one Redis-flavored success path
- one credible on-prem deployment validation pass with concrete findings
- at least one new/refined template that clearly benefits from a partner

## Saturday Plan — Full Day

### Block 1: Runtime + Setup Baseline

1. fresh provisioned/partner-ready instance sanity
- auth
- keys/integrations
- template apply
- feedback path still healthy

2. on-prem baseline
- verify current Docker/container path
- confirm gateway/runtime startup behavior
- confirm persistent state expectations

### Block 2: Partner Validation

1. Blaxel
- one concrete template/run that depends on Blaxel
- document exact required settings
- confirm outputs are visible and useful

2. Redis
- one concrete memory/state workflow
- confirm secrets/defaults/result surfacing

### Block 3: Template + Demo Readiness

1. partner-benefiting templates
- refine only the templates that matter for demos
- avoid broad catalog churn

2. multi-template sanity
- re-check coexistence in one workspace
- confirm no collisions/regressions after partner work

### Saturday Exit Criteria

- partner integrations have at least two real success paths
- on-prem path has a concrete status:
  - healthy
  - or blocked with specific defects
- no new high-risk template/runtime regressions introduced

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
