# Multimodal Frontier Hackathon — March 28, 2026

> **Event:** [Multimodal Frontier Hackathon](https://luma.com/multimodalhack?tk=oFWmAB)
> **Branch:** `hackathon/multimodal-frontier-hack-mar28`
> **Goal:** Ship 10 new multimodal-first templates, execute a simpler Senso-first foundation path, select 3 showcase demos, and produce a 3-minute demo that scores on autonomy, idea, technical implementation, sponsor tool use, and presentation.
> **Source brief:** Luma challenge statement + judging criteria reviewed March 28, 2026.

## Challenge Framing

### Core challenge
Build agents that do not just reason over text, but act on real-time multimodal inputs and improve as they operate.

### What the judges care about
- **Autonomy** — agents react to live inputs and take action without manual babysitting
- **Idea** — real-world usefulness, not just novelty
- **Technical implementation** — coherent architecture and execution quality
- **Tool use** — effective use of at least 3 sponsor tools
- **Presentation** — clear 3-minute live demo

### Sponsor tools to optimize for
- **Senso** — primary shared context layer for multimodal ingest, search, generate, and agent-facing MCP access
- **Google DeepMind** — multimodal frontier models for image/audio/video understanding and generation
- **Nexla** — live enterprise data ingestion and normalization
- **WorkOS** — production auth and org identity flows
- **DigitalOcean** — deployable inference/app hosting
- **Assistant UI** — polished demo interface
- **Augment Code** — coding agent support for iteration speed
- **Lovable / Unkey / Railtracks / Vori** — optional depending on final demo angle

## Strategy

Build a **multimodal operations template pack** instead of one giant monolith. Each template should include:
- specialized agents
- workflows triggered by multimodal or live external signals
- skills that let agents observe, classify, route, decide, and act
- a kickoff workflow that produces immediate visible output

This gives us breadth for the hackathon and lets us quickly choose the 3 strongest demos by speed, reliability, and wow-factor.

## Sprint Plan

### Sprint objective
End the day with:
- 10 template specs drafted
- one working Senso-first foundation execution
- 3 showcase templates implemented
- hackathon work mirrored into the main backlog history

### Execution order
- [x] **Foundation path**
  Execute a simpler Senso-first template first so we guarantee something working early.
  Recommended foundation target: `Real-Time Research Desk`
- [x] **Shared skills**
  Search Shipables.dev and SkillsHub for needed skills, reuse what exists, then build only what is missing.
- [ ] **Showcase demos**
  Implement `Visual QA Lab`, `Customer Signal Desk`, and `Retail Watchtower`
- [x] **Template breadth**
  Draft the remaining 6 templates so the full slate exists in repo history
- [ ] **Demo packaging**
  Capture outputs, screenshots, and sponsor-tool proof points

### Review points
- after the foundation Senso-first path is wired
- after shared skills are locked
- after the first showcase template runs
- before demo packaging / special GitHub publishing

## Template Thesis

The winning angle for ClawMax is not “we can call a model with an image.” It is:

**organizations of agents that continuously watch real-world inputs, coordinate through workflows, and take meaningful action with minimal human intervention.**

That maps directly to ClawMax strengths:
- multi-agent org templates
- workflows and recurring automation
- shared skills and role specialization
- visible coordination for demoability

## Senso-First Architecture

Senso should be the primary integration we prioritize for this hack.

### Recommended role for Senso
- ingest multimodal evidence and operational context
- serve as the shared memory layer across agents
- store normalized observations, briefs, and learned playbooks
- provide cited retrieval and generation for downstream actions
- expose context through its MCP server where useful

### Recommended separation of concerns
- **Senso** — shared context, evidence, memory, and retrieval
- **ClawMax** — workflows, agent coordination, and execution state
- **GitHub** — code changes and public artifacts only when relevant

### Why this is stronger than using GitHub as the main coordination layer
- GitHub is good for code and issues, but weak as the primary multimodal memory system
- Senso is built around ingest, search, generate, rules, triggers, webhooks, and MCP access
- that lets us tell a cleaner autonomy story: agents observe raw evidence, synthesize context, and act from it

## Ten New Template Concepts

### Business
1. **Retail Watchtower**
   Watches shelf photos, POS anomalies, supplier feeds, and store ops alerts. Agents detect stockouts, pricing mismatches, and merchandising issues, then create action tasks.
   Sponsor-tool fit: Senso + Google DeepMind + Nexla + Vori

2. **Customer Signal Desk**
   Ingests support calls, screenshots, product videos, and chat logs. Agents cluster issues, extract sentiment and bugs, and route actions to support/product/ops.
   Sponsor-tool fit: Senso + Google DeepMind + WorkOS + Assistant UI

3. **Brand Pulse Room**
   Monitors social video, creator content, screenshots, and campaign assets. Agents identify trends, summarize brand mentions, and propose creative responses.
   Sponsor-tool fit: Senso + Google DeepMind + DigitalOcean + Assistant UI

4. **Store Ops Copilot**
   Uses camera snapshots, invoices, staff voice notes, and live sales feeds to catch shrink, spoilage, staffing risk, and vendor issues.
   Sponsor-tool fit: Senso + Google DeepMind + Vori + Nexla

### Technical
5. **Multimodal Incident Response Team**
   Monitors dashboards, screenshots, traces, logs, and incident voice notes. Agents classify severity, correlate symptoms, and trigger remediation workflows.
   Sponsor-tool fit: Senso + DigitalOcean + Assistant UI + Augment Code

6. **Visual QA Lab**
   Reviews screenshots, short videos, bug repro captures, and PR context. Agents detect UI regressions, summarize failures, and file concrete bug tasks.
   Sponsor-tool fit: Senso + Google DeepMind + Augment Code + WorkOS

7. **Real-Time Research Desk**
   Pulls web/news/media artifacts, extracts visual/audio/text signals, synthesizes findings, and updates a living brief.
   Sponsor-tool fit: Senso + Google DeepMind + Nexla + Assistant UI

### Healthcare / Bio / Regulated
8. **Clinic Intake Triage**
   Processes forms, images, PDFs, and voicemail. Agents extract structured intake data, detect urgency cues, and route follow-up workflows with audit trail.
   Sponsor-tool fit: Senso + WorkOS + Google DeepMind + Unkey

### Public Sector / Safety
9. **Community Safety Monitor**
   Watches public alerts, field photos, sensor feeds, and local updates. Agents summarize risk, escalate exceptions, and prepare response briefs.
   Sponsor-tool fit: Senso + Nexla + Google DeepMind + DigitalOcean

### Creative / Media
10. **Creative Review Studio**
   Reviews image/video/audio assets against brief, brand guardrails, and performance data. Agents score quality, generate revisions, and queue publishing actions.
   Sponsor-tool fit: Senso + Google DeepMind + Lovable + Assistant UI

## Initial Selection for Execution

We should execute **one simple, one medium, one hard**:

### 1. Simple: Visual QA Lab
- **Why:** fastest path to a credible autonomous multimodal demo
- **Input types:** screenshots, short screen recordings, PR/task context
- **Action:** open bug summaries, route to engineering/QA agents, propose fixes
- **Senso role:** store repro evidence, maintain issue memory, and provide cited retrieval to reviewer/fixer agents
- **Why it wins:** strong technical implementation story, fast iteration, easy to demo in 3 minutes

### 2. Medium: Customer Signal Desk
- **Why:** direct business value and obvious autonomy story
- **Input types:** support screenshots, chats, call transcripts, user videos
- **Action:** classify issue, cluster patterns, route to support/product, generate follow-up
- **Senso role:** unify customer evidence into one searchable context plane shared across triage, product, and support agents
- **Why it wins:** balanced complexity with clear real-world impact

### 3. Hard: Retail Watchtower
- **Why:** most complete “agents that perceive and act in the real world” narrative
- **Input types:** shelf/store images, inventory feeds, pricing data, ops events
- **Action:** detect issues, create restock/merchandising/ops tasks, summarize store risk
- **Senso role:** hold store-specific multimodal memory, prior incidents, and generated operating briefs for recurring review
- **Why it wins:** strongest autonomy + real-world value + multimodal story if we can keep scope tight

## Skills Strategy

We should avoid generic “multimodal” skills and instead create reusable Senso-backed workflow support skills:

1. `senso-ingest`
   Push raw text/files/conversation artifacts into Senso in a predictable structure.

2. `senso-search`
   Retrieve cited answers and supporting evidence from the shared Senso workspace.

3. `senso-generate`
   Turn stored evidence into briefings, bug summaries, customer digests, and operating notes.

4. `signal-triage`
   Assess urgency, confidence, required follow-up, and escalation path from Senso-backed evidence.

5. `action-router`
   Turn observations into workflow-safe next steps: alert, ticket, message, rerun, or monitor.

6. `learning-loop`
   Save outcomes, false positives, playbook updates, and reusable lessons back into Senso.

7. `senso-mcp`
   Give agents a stable MCP-based path to Senso context where direct API calls are not ideal.

8. `demo-narrator`
   Help demo agents present what changed, why they acted, and what improved.

These skills can be shared across all 10 templates while keeping each template domain-specific.

## Shared Workflow Pattern

Every selected template should follow the same Senso-centric loop:

- [x] ingest new evidence into Senso
- [x] retrieve relevant prior context from Senso
- [x] generate a compact action brief
- [x] triage and route inside ClawMax workflows
- [x] write back outcomes and lessons into Senso

## One-Day Sprint

### Phase 0: Planning lock (30-45 min)
- [x] Finalize the 10-template slate
- [x] Confirm the 3 showcase execution picks
- [x] Confirm the simpler Senso-first foundation execution target
- [x] Confirm Senso as primary sponsor integration and choose 2-3 supporting sponsor tools per selected template
- [x] Define artifact format for each template: agents, workflows, skills, and expected demo inputs

### Phase 1: Foundation (60-90 min)
- [x] Create hackathon docs and backlog
- [x] Define shared Senso-backed skill set
- [x] Decide one common Senso-centric workflow pattern for all selected templates
- [x] Search Shipables.dev / SkillsHub for required skills before building new ones
- [x] Wire `SENSO_API_KEY` locally without committing secrets
- [ ] Write scoring rubric so we reject weak template ideas quickly
- [ ] Implement the simpler Senso-first foundation execution target

### Phase 2: Template design pass (2-3 hrs)
- [x] Draft 10 template briefs with role list, workflows, skills, sponsor-tool mapping
- [x] Mark each template by complexity, demo speed, and sponsor coverage
- [x] Downselect final simple / medium / hard showcase trio

### Phase 3: Build selected trio (3-4 hrs)
- [ ] Implement **Visual QA Lab**
- [ ] Implement **Customer Signal Desk**
- [ ] Implement **Retail Watchtower**
- [ ] Ensure each has kickoff workflow and visible outputs
- [ ] Create any missing reusable skill and prepare it for publication if needed

### Phase 4: Execution & iteration (2-3 hrs)
- [ ] Run the foundation Senso-first template end-to-end
- [ ] Run each selected template in a real workspace
- [ ] Capture blockers, tighten prompts, fix workflow gaps
- [ ] Track what agents learned or adapted during execution

### Phase 5: Demo packaging (60 min)
- [ ] Prepare 3-minute story: problem → agents observe → agents act → measurable output
- [ ] Capture screenshots / chat / workflow traces
- [ ] Prepare special GitHub repo or demo branch artifacts if needed

## Selection Rubric

Score each candidate out of 5 on:
- multimodal input richness
- autonomous actionability
- sponsor tool coverage
- speed to working demo
- real-world value
- clarity in a 3-minute presentation

Default rule:
- anything scoring under **20/30** moves to backlog
- anything scoring **24+/30** stays in execution contention

## What “Done” Looks Like Today

- 10 new multimodal template briefs documented
- 3 selected templates fully implemented
- shared skill strategy defined and reused
- at least 3 sponsor tools clearly represented in the demo narrative
- one polished repo branch / docs trail / screenshots ready for judging and follow-up

## Notes / Things To Fix Before Execution

- **Need explicit sponsor-tool mapping in every selected template** so “tool use” is obvious to judges
- **Need one canonical Senso-centric workflow pattern** to avoid reinventing logic per template
- **Need to search Shipables.dev and SkillsHub before building new skills** so we maximize reuse and sponsor ecosystem fit
- **Need lightweight demo data packs** for screenshots, sample images, call transcripts, and store inputs so demos are deterministic
- **Need a result artifact format** so each template produces visible proof, not just internal agent chatter
- **Need a fast publish target** for special GitHub/demo assets once the three selected templates are validated

## Recommendation

My recommendation is:
- approve the 10-template slate
- lock the three selected showcase templates above
- execute the simpler Senso-first foundation path first
- build the Senso-backed shared skills first
- implement the simple template end-to-end before opening scope on the hard one

That gives us the best chance of ending the day with breadth, depth, and a clean demo story.
