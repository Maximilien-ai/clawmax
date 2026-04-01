---
name: Meeting Capture & Follow-up
type: organization
version: 1.0.0
emoji: ✅
category: personal
author: ClawMax Team
tags:
  - personal
  - assistant
  - meetings
  - follow-up
  - proposal
  - experimental
  - early-idea
---

Proposal template for capturing meeting notes, extracting actions, and routing follow-ups after conversations. Early idea only and meant to be adapted.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| meeting-ops-lead | Meeting Ops Lead | Lead coordinator — defines how the meeting should be captured and what follow-through matters most. | lead, meetings, operations |  |
| note-capturer | Note Capturer | Capture specialist — structures the live notes, highlights decisions, and preserves important quotes or facts. | notes, capture, meetings |  |
| action-tracker | Action Tracker | Follow-up specialist — extracts commitments, owners, deadlines, and open questions from the meeting. | follow-up, actions, tracking |  |
| recap-writer | Recap Writer | Recap specialist — turns the meeting into a concise summary and follow-up message for stakeholders. | recap, writing, communication |  |

## Communities

- **Meeting Ops** — Shared space for meeting capture, action extraction, and recap output.

## Groups

- **Capture** — Structured notes, facts, decisions, and quotes from the meeting. (Meeting Ops)
- **Actions** — Action items, owners, deadlines, and unresolved follow-ups. (Meeting Ops)
- **Recaps** — Readable meeting summaries and outbound follow-up drafts. (Meeting Ops)
- **Status** — What is closed, what is pending, and what the user should review next. (Meeting Ops)

## Workflows

### Meeting Capture Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: meeting-ops-lead)
- **Targets:** agents: meeting-ops-lead, note-capturer, action-tracker, recap-writer; tags: lead

# Meeting Capture Kickoff

You are the Meeting Ops Lead. The follow-through team just came online.

## Project Configuration
> **Customize these before applying:**

- **Meeting name:** [e.g., weekly staff sync, customer review, board prep]
- **Participants:** [people or teams involved]
- **What to capture:** [decisions, action items, questions, commitments, custom]
- **Follow-up expectations:** [recap only, action list, owner routing, full follow-up packet]
- **Output artifact:** [meeting notes, recap, action list, stakeholder follow-up]

## Your Tasks
1. Define the capture standard for this meeting
2. Ask Note Capturer to structure the note format
3. Ask Action Tracker to prepare the action-item extraction lens
4. Ask Recap Writer to prepare the follow-up summary format
5. Post the current capture plan to Status

### Live Notes Pass
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: meeting-ops-lead)
- **Targets:** agents: note-capturer; groups: Capture

# Live Notes Pass

1. Structure the meeting notes around decisions, facts, questions, and unresolved items
2. Capture the most decision-relevant statements rather than every detail
3. Distinguish confirmed outcomes from tentative suggestions
4. Post the structured notes to Capture
5. Flag any ambiguity that could break follow-through

### Action Item Routing
- **Schedule:** manual
- **Mode:** managed (owner: meeting-ops-lead)
- **Targets:** agents: action-tracker; groups: Actions

# Action Item Routing

1. Review the structured notes and extract every real commitment or next step
2. Assign owners, deadlines, and any dependency notes where possible
3. Separate explicit commitments from inferred suggestions
4. Build the follow-up list in order of urgency
5. Post the routed actions to Actions and Status

### Recap And Follow Up Review
- **Schedule:** manual
- **Mode:** managed (owner: meeting-ops-lead)
- **Targets:** agents: recap-writer, meeting-ops-lead; groups: Recaps, Status

# Recap And Follow Up Review

1. Review the notes and action list for completeness
2. Produce a concise recap that highlights decisions, owners, and next steps
3. Draft the most useful follow-up message for the user or stakeholders
4. Call out anything still unresolved or risky
5. Post the recap package to Recaps and Status
