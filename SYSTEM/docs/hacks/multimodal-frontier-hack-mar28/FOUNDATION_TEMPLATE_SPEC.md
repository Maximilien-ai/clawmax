# Foundation Template Spec — Real-Time Research Desk

> Role: guaranteed first execution path
> Shared context: Senso
> Supporting sponsors: WorkOS + Assistant UI

## Why This Goes First

This template is the lowest-risk path to an early working result.

It lets us prove:
- Senso-backed shared memory
- agent coordination around mixed evidence
- useful output without needing the hardest operational integrations first

## Template Summary

`Real-Time Research Desk` is a multi-agent research and briefing team.
It ingests documents, screenshots, notes, transcripts, and links into Senso, then keeps a rolling brief updated as new evidence arrives.

## Agents

### 1. research-lead
- owns the current brief
- decides what matters now
- posts the final summary and next actions

### 2. source-curator
- ingests new material into Senso
- tags and organizes evidence
- identifies missing context

### 3. brief-writer
- queries Senso for the most relevant evidence
- writes concise brief updates
- compares new findings against existing notes

### 4. followup-coordinator
- turns findings into concrete next actions
- requests more evidence when confidence is low
- maintains the running action list

## Groups

- `Intake`
- `Briefing`
- `Followups`
- `Status`

## Workflows

### kickoff
Sets the research topic, scope, audience, and success criteria.

### evidence-intake
Ingest new PDFs, screenshots, URLs, notes, or transcripts into Senso.

### brief-refresh
Search Senso for the latest relevant evidence and generate an updated brief.

### gap-detection
Identify unanswered questions, weak evidence, or conflicting signals.

### action-rollup
Convert the latest brief into next actions and post them to the team.

### learning-writeback
Save the final brief update and lessons back into Senso.

## Skill Usage

### Must-have
- `senso-ingest`
- `senso-search`
- `senso-generate`
- `signal-triage`
- `senso-mcp`

### Nice-to-have
- `action-router`
- `learning-loop`
- `demo-narrator`

## Demo Inputs

Use a deterministic small pack:
- 1 PDF
- 1 screenshot
- 1 short text note
- 1 article or pasted link summary

## Demo Outputs

- current shared brief
- top findings
- confidence / gaps
- next action list
- writeback into Senso memory

## Success Criteria

- agents ingest and retrieve from Senso successfully
- the team produces a useful rolling brief
- the output is visible and easy to explain in under 60 seconds
- the same pattern can be reused by the three showcase templates

## Build Sequence

1. create the template spec
2. source or create the minimum required skills
3. wire kickoff and evidence-intake workflows
4. test one deterministic run
5. use what we learned to implement the three showcase templates
