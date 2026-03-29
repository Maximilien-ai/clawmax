# Multimodal Frontier Hackathon Skill Plan

> Branch: `hackathon/multimodal-frontier-hack-mar28`
> Priority: reuse ecosystem skills first, create only what is missing

## Goal

Define the minimum skill set needed to:
- execute the Senso-first foundation path
- support the three showcase templates
- maximize reuse from Shipables.dev, SkillsHub, and existing bundled skills

## Current State

- the repo already supports **Shipables.dev registry search and install** through the dashboard skills routes
- the default workspace currently has **no custom skills** under `WORKSPACES/default/SKILLS/custom`
- bundled and managed skills may still cover generic capabilities, but Senso-specific hackathon skills are not yet defined in this workspace

## Sourcing Rule

For each required capability:
1. search Shipables.dev
2. search SkillsHub / existing skill inventory
3. reuse an existing skill if it is close enough
4. create a focused new skill only if the capability is still missing

## Capability Map

### 1. Senso ingest
Purpose:
- upload raw text, PDFs, screenshots, notes, and other evidence into Senso
- establish predictable naming and metadata conventions for hackathon workflows

Needed by:
- Real-Time Research Desk
- Visual QA Lab
- Customer Signal Desk
- Retail Watchtower

Search targets:
- `senso`
- `knowledge base`
- `content ingest`
- `document upload`
- `mcp content`

Likely outcome:
- may need a new focused skill if no direct Senso ingestion skill exists

### 2. Senso retrieval
Purpose:
- query shared memory for cited answers, prior cases, and related evidence

Needed by:
- all selected demos

Search targets:
- `senso search`
- `semantic search`
- `knowledge search`
- `context retrieval`

Likely outcome:
- reusable if a generic knowledge search skill exists, otherwise create

### 3. Senso generation
Purpose:
- convert stored evidence into briefs, summaries, handoff notes, and next-action digests

Needed by:
- Real-Time Research Desk
- Customer Signal Desk
- Retail Watchtower

Search targets:
- `senso generate`
- `content generation`
- `prompt template`
- `brief writer`

Likely outcome:
- may pair with retrieval as one skill or split into separate focused skills

### 4. Senso MCP access
Purpose:
- expose Senso through MCP for agent-native interaction where that is cleaner than direct HTTP

Needed by:
- foundation execution
- later showcase templates if MCP use is more reliable than raw API calls

Search targets:
- `senso mcp`
- `mcp knowledge`
- `mcp search`

Likely outcome:
- likely a new thin skill that explains how to use the official Senso MCP server

### 5. Signal triage
Purpose:
- classify urgency, confidence, routing path, and required next action from multimodal evidence

Needed by:
- Visual QA Lab
- Customer Signal Desk
- Retail Watchtower

Search targets:
- `triage`
- `support triage`
- `incident triage`
- `classification`

Likely outcome:
- reusable generic workflow skill may exist

### 6. Action routing
Purpose:
- convert observations into workflow-safe outputs for ClawMax groups and agents

Needed by:
- all selected demos

Search targets:
- `router`
- `ticket routing`
- `workflow routing`
- `dispatcher`

Likely outcome:
- likely best created locally if existing skills are too generic

### 7. Learning loop
Purpose:
- write back outcomes, false positives, and reusable lessons into Senso

Needed by:
- all selected demos

Search targets:
- `feedback loop`
- `postmortem`
- `knowledge update`
- `memory writeback`

Likely outcome:
- likely a new small skill if reuse is weak

## Recommended First Build Set

To unblock execution quickly, the first skill set should be:

1. `senso-ingest`
2. `senso-search`
3. `senso-generate`
4. `senso-mcp`
5. `signal-triage`

This is enough to make the foundation path work and gives most of what the showcase demos need.

## Candidate Reuse Areas

The most likely reuse categories from Shipables.dev / SkillsHub are:
- generic retrieval/search skills
- summarization or brief-writing skills
- support triage / incident classification skills
- MCP helper skills
- GitHub / issue / messaging skills already bundled with ClawMax/OpenClaw

## New Skill Creation Rule

Only create a new skill when:
- the capability is required for the foundation path or a selected showcase template
- the available ecosystem skills are too generic, incompatible, or missing
- the skill can be made focused and reusable beyond this one hackathon

If we create one:
- keep the scope tight
- document inputs, outputs, and example prompts
- prepare it for later publication to Shipables.dev / SkillsHub

## Immediate Next Steps

- search registry for `senso`, `search`, `triage`, `knowledge`, `mcp`
- list likely reusable bundled skills already present in the repo/runtime
- lock the minimal first build set
- implement the `Real-Time Research Desk` foundation template against that set

## Registry Findings — March 28

### Strong reuse candidates from Shipables.dev
- `senso-ai/senso-ingest`
  Covers raw text and file upload into Senso, folder targeting, and processing-status polling.
- `senso-ai/senso-search`
  Covers retrieval from Senso with grounded answers and context chunks.
- `senso-ai/senso-content-gen`
  Covers generation from Senso-backed knowledge using prompts/templates.
- `UJameel/skill-publisher`
  Useful later if we create a new skill and want to package it for Shipables publication.

### Weak or missing areas
- no clear strong `triage` skill for our hackathon use case
- no obvious `action-router` skill tailored to ClawMax workflow outputs
- no direct `workos` skill surfaced in registry search
- no direct `senso-mcp` skill surfaced in registry search

## Locked First Skill Set

### Reuse directly
- `senso-ai/senso-ingest`
- `senso-ai/senso-search`
- `senso-ai/senso-content-gen`

### Likely create locally
- `signal-triage`
- `action-router`
- `senso-mcp`

### Optional later
- `learning-loop`
- `demo-narrator`

## Decision

The first implementation pass should:
- install and validate the three official Senso skills from Shipables
- avoid building a custom ingest/search/generate stack from scratch
- only create new skills for routing, triage, and MCP guidance if the existing ecosystem does not already cover them well enough

## ClawMax Adapter Pattern

When an upstream skill is solid but still has friction for ClawMax workflows, create a narrow adapter skill using:

`<skill-name>-clawmax`

Examples:
- `senso-ingest-clawmax`
- `senso-search-clawmax`

### Purpose of adapter skills
- encode ClawMax-specific folder naming, evidence conventions, and output formats
- reduce repeated prompt/setup friction across templates
- compose vendor skills into ClawMax-ready workflow behavior

### Rules
- do not fork everything
- keep the adapter smaller than the upstream skill
- rely on upstream vendor commands and conventions wherever possible
- publish the adapter if it provides reusable value beyond this repo

## First Adapter Skills

### `senso-ingest-clawmax`
Wraps `senso-ingest` with ClawMax conventions:
- standard evidence folder naming per template/workflow
- preferred title and metadata format for uploaded content
- explicit post-ingest verification steps
- predictable handoff output for downstream agents

### `senso-search-clawmax`
Wraps `senso-search` with ClawMax conventions:
- choose the right search mode for the task
- return short cited summaries suitable for triage and routing
- encourage scoped search when content IDs are known
- produce workflow-ready result formatting instead of generic search output
