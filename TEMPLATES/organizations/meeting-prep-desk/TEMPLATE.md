---
name: Meeting Prep Desk
type: organization
version: 1.0.0
category: personal
author: ClawMax Team
tags:
  - personal
  - assistant
  - meetings
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for researching people and topics before meetings, then assembling concise briefing packets. Early idea only and intended as a customizable starter.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| meeting-lead | Meeting Lead | Meeting prep lead — defines what the user needs to know before each meeting and sets the briefing format. | lead, meetings, personal |  |
| people-researcher | People Researcher | People specialist — gathers context on attendees, prior interactions, roles, and likely interests. | people, research, meetings |  |
| topic-analyst | Topic Analyst | Topic specialist — summarizes the project, company, or domain context most relevant to the conversation. | topics, research, analysis |  |
| briefing-writer | Briefing Writer | Briefing specialist — combines people and topic context into a concise prep packet with suggested talking points. | briefing, writing, meetings |  |

## Communities

- **Meeting Desk** — Shared space for meeting preparation, attendee research, and briefing output.

## Groups

- **People** — Attendee background, prior interactions, roles, and relationship context. (Meeting Desk)
- **Topics** — Company, project, or subject research relevant to the upcoming meeting. (Meeting Desk)
- **Briefings** — Final meeting packets, agendas, open questions, and suggested talking points. (Meeting Desk)
- **Status** — What is ready, what is missing, and where the user should focus during the meeting. (Meeting Desk)

## Workflows

### Meeting Prep Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: meeting-lead)
- **Targets:** agents: meeting-lead, people-researcher, topic-analyst, briefing-writer; tags: lead

# Meeting Prep Kickoff

You are the Meeting Lead. The meeting prep team just came online.

## Project Configuration
> **Customize these before applying:**

- **Meeting title:** [e.g., investor intro, customer review, hiring interview]
- **Attendees:** [names, roles, companies, optional links]
- **Topic focus:** [project, company, deal, partnership, technical review, custom]
- **Key outcomes wanted:** [e.g., alignment, decision, relationship building, diligence]
- **Output artifact:** [briefing packet, agenda, question list]

## Your Tasks
1. Define the meeting objective and the minimum useful prep packet
2. Ask People Researcher for attendee context and prior interactions
3. Ask Topic Analyst for the most relevant project or company background
4. Ask Briefing Writer to combine those into a concise packet
5. Post the prep plan to Status

### People And Topic Research
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: meeting-lead)
- **Targets:** agents: people-researcher, topic-analyst; groups: People, Topics

# People And Topic Research

1. Gather attendee background, role context, and any prior interaction notes
2. Summarize the core company, project, or topic context relevant to the meeting
3. Highlight likely priorities, sensitivities, and open questions
4. Post the research summary to People, Topics, and Status
5. Flag any missing context that would weaken the briefing

### Briefing Assembly
- **Schedule:** manual
- **Mode:** managed (owner: meeting-lead)
- **Targets:** agents: briefing-writer; groups: Briefings

# Briefing Assembly

1. Combine the people and topic research into a concise briefing
2. Include suggested agenda, likely goals, and recommended talking points
3. Highlight any risks, missing information, or decision pressure
4. Produce a short packet that the user can scan quickly before the meeting
5. Post the packet to Briefings and Status

### Final Prep Review
- **Schedule:** manual
- **Mode:** managed (owner: meeting-lead)
- **Targets:** agents: meeting-lead, briefing-writer; groups: Status

# Final Prep Review

1. Review the final briefing packet for clarity and usefulness
2. Confirm the user’s likely objective, open questions, and main talking points
3. Call out the single biggest thing not to miss in the meeting
4. Produce a final one-screen prep summary
5. Post the review to Status
