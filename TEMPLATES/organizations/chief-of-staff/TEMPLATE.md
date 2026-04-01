---
name: Chief Of Staff
type: organization
version: 1.0.0
emoji: 🧭
category: personal
author: ClawMax Team
tags:
  - personal
  - assistant
  - chief-of-staff
  - proposal
  - experimental
  - early-idea
---

Proposal template for a personal chief of staff team that helps one user manage inbox, calendar, meeting prep, and follow-through. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| cos-lead | Chief Of Staff Lead | Personal operating lead — sets daily priorities, coordinates the team, and decides what needs immediate attention. | lead, personal, chief-of-staff | github, gh-issues |
| inbox-manager | Inbox Manager | Inbox specialist — triages email, surfaces urgent threads, drafts responses, and groups follow-ups by priority. | email, inbox, triage |  |
| calendar-coordinator | Calendar Coordinator | Scheduling specialist — organizes availability, resolves conflicts, and prepares the next sequence of meetings. | calendar, scheduling, coordination |  |
| briefing-writer | Briefing Writer | Briefing specialist — prepares daily briefs, meeting context, and concise next-step notes for the user. | briefing, meetings, research |  |

## Communities

- **Chief Of Staff** — Shared coordination space for one user's personal operating team.

## Groups

- **Inbox** — Email triage, follow-ups, and urgent communication threads. (Chief Of Staff)
- **Calendar** — Scheduling, meeting sequences, conflicts, and timing adjustments. (Chief Of Staff)
- **Briefings** — Meeting prep, daily summaries, and people or topic research briefs. (Chief Of Staff)
- **Status** — Priorities, blockers, decisions, and what the user should focus on next. (Chief Of Staff)

## Workflows

### Daily Priorities Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: cos-lead)
- **Targets:** agents: cos-lead, inbox-manager, calendar-coordinator, briefing-writer; tags: lead

# Daily Priorities Kickoff

You are the Chief Of Staff Lead. Your personal operating team just came online.

## Project Configuration
> **Customize these before applying:**

- **Today’s top priorities:** [e.g., investor calls, hiring, customer follow-up]
- **Critical meetings:** [e.g., 1:00 PM partner review, 4:00 PM team sync]
- **Inbox focus:** [e.g., clear urgent threads, draft replies, identify delegate items]
- **Research needs:** [e.g., people, companies, topics to brief before meetings]
- **Output artifact:** [daily brief, meeting packet, action list]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Introduce the team in the Chief Of Staff community
2. Restate the top priorities and time-sensitive commitments
3. Direct Inbox Manager to triage urgent threads
4. Direct Calendar Coordinator to review conflicts and sequencing
5. Direct Briefing Writer to prepare the first briefing packet
6. Post the initial daily plan in Status

### Inbox And Calendar Triage
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: cos-lead)
- **Targets:** agents: inbox-manager, calendar-coordinator; groups: Inbox, Calendar

# Inbox And Calendar Triage

1. Identify the most urgent threads and scheduling conflicts for the current day
2. Group follow-ups by urgency, delegability, and meeting relevance
3. Resolve obvious timing conflicts and note any blocked decisions
4. Post the triage summary to Inbox, Calendar, and Status
5. Escalate only the items that truly require the user’s direct attention

### Meeting Prep Cycle
- **Schedule:** manual
- **Mode:** managed (owner: cos-lead)
- **Targets:** agents: briefing-writer; groups: Briefings

# Meeting Prep Cycle

1. Select the next meeting or priority topic to prepare for
2. Gather relevant context on people, companies, projects, and prior interactions
3. Produce a concise briefing with agenda, open questions, and recommended stance
4. Highlight any missing information or follow-up risk
5. Post the briefing packet to Briefings and Status

### Follow Through Review
- **Schedule:** manual
- **Mode:** managed (owner: cos-lead)
- **Targets:** agents: cos-lead, inbox-manager, calendar-coordinator, briefing-writer; groups: Status

# Follow Through Review

1. Review the current inbox, calendar, and briefing outputs
2. Summarize what is done, what is blocked, and what still needs the user
3. Produce a short next-step list with clear priorities
4. Label anything that can be delegated versus must stay with the user
5. Post the final review to Status
