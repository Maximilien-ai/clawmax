# Multimodal Frontier Hackathon Execution Spec

> Branch: `hackathon/multimodal-frontier-hack-mar28`
> Selected templates: simple, medium, hard
> Primary shared context layer: **Senso**

## Review Adjustments

This spec incorporates four review decisions:
- add a simpler Senso-first execution target before the heavier showcase demos
- still create templates for the full 10-template slate
- search Shipables.dev and SkillsHub before building any new skill
- publish any missing generally useful skill we create if it is needed to get the job done

## Purpose

This document turns the selected hackathon templates into build-ready contracts.

For each selected template we define:
- core demo story
- agent roster
- Senso responsibilities
- workflow loop
- sponsor-tool mapping
- success criteria

## Shared Architecture

### System roles
- **ClawMax** orchestrates agents, groups, communities, and workflows
- **Senso** stores multimodal evidence, generated briefs, prior incidents, and learned playbooks
- **Frontier multimodal model** interprets images, audio, video, and mixed evidence
- **Sponsor-side systems** provide deployment, identity, ingestion, or external action paths

### Shared workflow loop
1. ingest evidence into Senso
2. retrieve relevant prior context from Senso
3. generate an action brief from current + prior evidence
4. triage and route inside ClawMax
5. execute follow-up action
6. write outcome and lessons back into Senso

### Shared skills
- `senso-ingest`
- `senso-search`
- `senso-generate`
- `signal-triage`
- `action-router`
- `learning-loop`
- `senso-mcp`
- `demo-narrator`

### Skill sourcing rule
For each capability we need:
1. search Shipables.dev first
2. search SkillsHub / current workspace skills second
3. create a new skill only if the capability is still missing
4. prepare a reusable publishable version if we build a new generally useful skill

## 0. Foundation Execution Target: Real-Time Research Desk

### Why this goes first
This is the lowest-risk Senso-first execution path and gives us a high-confidence working demo early in the day.

It demonstrates:
- shared Senso memory
- multimodal or mixed-source evidence intake
- multi-agent coordination
- at least one additional sponsor integration path

### Positioning
Agents ingest documents, screenshots, notes, and links into Senso, produce a rolling shared brief, and update next actions without manual stitching.

### Inputs
- PDFs
- screenshots
- article URLs or pasted text
- notes and transcripts

### Agents
- **research-lead**
- **source-curator**
- **brief-writer**
- **followup-coordinator**

### Senso usage
- ingest and organize evidence
- retrieve prior related sources and notes
- generate brief updates
- preserve rolling knowledge for reuse by later demos

### Sponsor-tool mapping
- **Senso**: primary context and retrieval layer
- **WorkOS**: org/user context and clean sponsor pairing
- **Assistant UI**: polished operator/demo surface

### Success criteria
- a new evidence set is ingested into Senso
- agents produce a useful shared brief
- the brief and next actions are written back into shared memory

### Role in the sprint
This should be the first execution we make work, even though the main showcase trio remains:
- Visual QA Lab
- Customer Signal Desk
- Retail Watchtower

## 1. Visual QA Lab

### Positioning
Fastest technical demo. Agents review screenshots and repro evidence, identify likely UI regressions, and route concrete bug/fix actions.

### Demo story
A new UI change ships. The team receives screenshots and a short repro capture. Agents compare the evidence to known issues and expected patterns, summarize the failure, assign next actions, and preserve the result in shared memory.

### Inputs
- screenshots
- short screen recordings or GIF-like captures
- bug repro notes
- ticket text
- PR / branch context

### Agents
- **qa-lead**
  Coordinates triage, decides severity, owns final QA summary.
- **visual-reviewer**
  Examines screenshot evidence and identifies visual or UX regressions.
- **repro-analyst**
  Converts repro notes and captures into a concise failure narrative.
- **fix-coordinator**
  Routes issues to engineering owners and prepares implementation tasks.

### Groups
- `Evidence`
- `Triage`
- `Fixes`
- `Status`

### Senso usage
- store all screenshots and repro artifacts
- persist issue summaries and previous related regressions
- retrieve prior incidents when a similar pattern appears
- save final bug brief and validation result after each run

### Workflows
- **kickoff**
  QA lead sets the target app, baseline rules, severity rubric, and expected UI surfaces.
- **visual-intake**
  Ingest new screenshots and repro evidence into Senso.
- **regression-triage**
  Review evidence, compare with prior incidents, classify severity, produce a bug brief.
- **fix-routing**
  Assign issue owner, propose next action, and post a concise engineering handoff.
- **post-fix-review**
  Re-check latest evidence, confirm whether the issue is resolved, and record the outcome.

### Sponsor-tool mapping
- **Senso**: evidence memory and cited retrieval
- **Google DeepMind**: multimodal screenshot and capture interpretation
- **Augment Code**: implementation/fix acceleration
- **WorkOS**: team/org context and production-ready access model

### Demo output
- one visible bug summary
- one routed action item
- one before/after evidence thread
- one “what the agents learned” writeback

### Success criteria
- agents turn raw screenshot evidence into a concrete bug brief
- prior incidents influence the triage decision
- a routed engineering action appears without manual synthesis

## 2. Customer Signal Desk

### Positioning
Balanced business + technical story. Agents unify fragmented customer evidence across channels and autonomously route the right next step.

### Demo story
Customer evidence arrives from chat, transcript, screenshots, and video. Agents unify it into a single case, identify recurring patterns, decide whether it is support, product, or escalation, and produce an action-ready follow-up.

### Inputs
- support chat logs
- support transcripts
- screenshots from users
- user videos
- follow-up notes

### Agents
- **signal-lead**
  Owns case severity, cross-functional routing, and final customer narrative.
- **conversation-analyst**
  Extracts issues, urgency, and sentiment from transcripts and chats.
- **evidence-reviewer**
  Inspects screenshots and videos to identify observable failure patterns.
- **product-liaison**
  Converts clustered issues into product or engineering work items.
- **response-manager**
  Drafts customer-safe summaries and next-step messages.

### Groups
- `Intake`
- `Customer Cases`
- `Escalations`
- `Status`

### Senso usage
- unify all artifacts related to the same customer issue
- search for similar past cases and resolutions
- generate concise case summaries for support and product
- store final case outcome and resolution pattern for reuse

### Workflows
- **kickoff**
  Set product scope, severity rubric, target channels, and escalation thresholds.
- **signal-ingest**
  Pull new chats, transcripts, screenshots, and videos into Senso.
- **case-clustering**
  Group related customer signals into cases or emerging patterns.
- **issue-routing**
  Decide support vs product vs engineering escalation and assign actions.
- **resolution-writeback**
  Save resolution details and lessons learned into Senso.

### Sponsor-tool mapping
- **Senso**: shared case memory and retrieval
- **Google DeepMind**: screenshot/video/transcript understanding
- **Assistant UI**: polished evidence-to-action demo surface
- **WorkOS**: user/org identity framing for support context

### Demo output
- one clustered customer case
- one severity classification
- one support or product action brief
- one reusable resolution note stored back in shared memory

### Success criteria
- fragmented evidence becomes one case without manual stitching
- agents route the case to the right team
- similar prior case context improves the outcome

## 3. Retail Watchtower

### Positioning
Most ambitious real-world autonomy story. Agents perceive store conditions, compare against live business context, and trigger operational actions.

### Demo story
Shelf photos and store signals reveal stockouts, misplaced items, or pricing risk. Agents compare current evidence against inventory context and prior incidents, summarize the operational risk, and trigger a concrete action plan.

### Inputs
- shelf photos
- aisle snapshots
- inventory feed snapshots
- pricing updates
- supplier notes
- store ops alerts

### Agents
- **store-ops-lead**
  Owns final store risk summary and approves critical actions.
- **shelf-inspector**
  Examines image evidence for low stock, gaps, and merchandising issues.
- **inventory-analyst**
  Compares visual findings against inventory and pricing context.
- **vendor-coordinator**
  Prepares restock or supplier follow-up actions.
- **floor-operator**
  Produces in-store action tasks for merchandising or staffing response.

### Groups
- `Store Evidence`
- `Inventory`
- `Actions`
- `Status`

### Senso usage
- hold store-specific multimodal evidence over time
- preserve incident history by shelf/category/store
- generate recurring operating briefs from current and prior evidence
- record which actions resolved which conditions

### Workflows
- **kickoff**
  Define store profile, categories, thresholds, and escalation rules.
- **store-intake**
  Ingest new shelf images and ops signals into Senso.
- **shelf-audit**
  Detect visible stock, merchandising, and pricing anomalies.
- **restock-routing**
  Convert findings into manager, vendor, or floor action tasks.
- **store-learning-loop**
  Record action outcomes and update the playbook for recurring issues.

### Sponsor-tool mapping
- **Senso**: long-lived store memory and retrieval
- **Google DeepMind**: visual interpretation of shelves and signage
- **Nexla**: live inventory and operational data normalization
- **Vori**: retail/inventory context for store operations

### Demo output
- one shelf anomaly summary
- one operational risk brief
- one restock or floor action recommendation
- one historical comparison showing adaptation or memory

### Success criteria
- agents translate store images into operational action
- inventory context changes the action recommendation
- prior incidents in Senso improve prioritization

## Build Order

1. **Real-Time Research Desk**
   Simpler Senso-first execution path to guarantee an early working result
2. **Visual QA Lab**
   Fastest high-signal technical showcase after the foundation path is stable
3. **Customer Signal Desk**
   Reuses the same Senso-backed skills and broadens the business story
4. **Retail Watchtower**
   Most compelling if the first three foundations are already stable

## Review Gates

Request user review after:
- shared skills spec is complete
- the foundation Senso-first execution target is implemented
- Visual QA Lab template is implemented
- all three template JSON specs exist
- first live execution results are captured

## Testing Needs From User

The best moments for user testing will be:
- validating that the selected demo stories feel strong and judge-friendly
- reviewing kickoff prompts before we lock them
- sanity-checking the first live run outputs for realism and usefulness
