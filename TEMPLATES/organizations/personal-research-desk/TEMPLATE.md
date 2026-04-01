---
name: Personal Research Desk
type: organization
version: 1.0.0
category: personal
author: ClawMax Team
tags:
  - personal
  - assistant
  - research
  - briefings
  - proposal
  - experimental
  - early-idea
---

Proposal template for researching people, companies, and topics for the user's decisions or conversations. Early idea only and intended as a starter.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| research-lead | Research Lead | Lead researcher — defines the question, evidence standard, and final briefing format for the user. | lead, research, personal |  |
| people-researcher | People Researcher | People specialist — gathers role context, prior work, and relationship-relevant signals on individuals. | people, research, profiles |  |
| company-researcher | Company Researcher | Company specialist — summarizes market position, product context, recent news, and decision-relevant signals. | companies, research, analysis |  |
| brief-writer | Brief Writer | Briefing specialist — turns raw research into concise briefing notes and recommended questions or next steps. | briefing, writing, research |  |

## Communities

- **Research Desk** — Shared space for personal research, people briefs, and company or topic summaries.

## Groups

- **People** — Profiles, prior work, relationship context, and likely interests. (Research Desk)
- **Companies** — Company background, product context, recent movement, and decision signals. (Research Desk)
- **Topics** — Topic summaries, briefing drafts, question lists, and next-step notes. (Research Desk)
- **Status** — Open research requests, confidence updates, and recommended next actions. (Research Desk)

## Workflows

### Research Request Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: research-lead)
- **Targets:** agents: research-lead, people-researcher, company-researcher, brief-writer; tags: lead

# Research Request Kickoff

You are the Research Lead. The personal research desk just came online.

## Project Configuration
> **Customize these before applying:**

- **Research target:** [person, company, topic, custom]
- **Question to answer:** [e.g., what matters most before the conversation?]
- **Context:** [meeting, outreach, diligence, personal decision, custom]
- **Time horizon:** [today, this week, background only, custom]
- **Output artifact:** [one-page brief, question list, company memo]

## Your Tasks
1. Define the exact research question and useful output format
2. Ask People Researcher and Company Researcher for the first evidence sweep as needed
3. Ask Brief Writer to assemble the final briefing structure
4. Post the research plan and expected confidence level to Status

### Subject Research Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: research-lead)
- **Targets:** agents: people-researcher, company-researcher; groups: People, Companies

# Subject Research Sweep

1. Gather the strongest current evidence relevant to the research target
2. Separate likely useful signals from nice-to-know background
3. Highlight what would matter most in a conversation or decision
4. Post a concise research sweep to People, Companies, and Status
5. Flag any area where confidence remains low

### Briefing Build
- **Schedule:** manual
- **Mode:** managed (owner: research-lead)
- **Targets:** agents: brief-writer; groups: Topics

# Briefing Build

1. Turn the current research sweep into a concise briefing note
2. Include the most decision-relevant facts and recommended questions
3. Make confidence and remaining unknowns explicit
4. Keep the output skimmable and useful under time pressure
5. Post the final briefing to Topics and Status

### Recommendation Review
- **Schedule:** manual
- **Mode:** managed (owner: research-lead)
- **Targets:** agents: research-lead, brief-writer; groups: Status

# Recommendation Review

1. Review the final briefing for usefulness and clarity
2. Summarize the strongest insight, the main unknown, and the best next action
3. Label where the user should probe deeper versus move fast
4. Produce a short recommendation memo
5. Post the review to Status
