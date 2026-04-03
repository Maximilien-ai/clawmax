---
name: ArXiv Digest Lab
type: organization
version: 1.0.0
emoji: 📚
category: science
author: ClawMax Team
tags:
  - science
  - research
  - papers
  - arxiv
  - proposal
  - experimental
  - early-idea
---

Proposal template for reviewing recent arXiv papers on a topic, filtering noise, and producing a practical digest with summaries and next actions.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| digest-lead | Digest Lead | Research digest lead — defines topic scope, reading bar, and final summary shape. | lead, research, papers |  |
| paper-scout | Paper Scout | Paper scouting specialist — finds recent arXiv papers and filters them by relevance and novelty. | research, papers, scouting |  |
| summary-analyst | Summary Analyst | Summary specialist — turns technical papers into plain-language takeaways with caveats. | research, summary |  |
| trend-editor | Trend Editor | Trend specialist — looks across papers for patterns, hype, gaps, and likely next moves. | research, trends |  |

## Communities

- **ArXiv Digest** — Shared coordination space for paper scouting, summaries, and digest writing.

## Groups

- **Scouting** — Recent paper candidates, filtering, and relevance checks. (ArXiv Digest)
- **Summaries** — Readable paper summaries, methods, and caveats. (ArXiv Digest)
- **Digest** — Final digest, trends, and recommendations. (ArXiv Digest)
- **Status** — Current topic scope, volume, and open questions. (ArXiv Digest)

## Workflows

### ArXiv Topic Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: digest-lead)
- **Targets:** agents: digest-lead; groups: Status

# ArXiv Topic Kickoff

You are the Digest Lead.

## Project Configuration
> **Customize these before applying:**

- **Topic:** [agent systems, multimodal, robotics, biology, custom]
- **Time window:** [last 7 days, last 30 days, this month, custom]
- **Desired depth:** [quick digest, balanced review, deep summary]
- **Audience:** [founder, engineer, researcher, student]
- **Output artifact:** [weekly digest, reading list, decision memo]

## Your Tasks
1. Restate the topic, audience, and time window
2. Ask Paper Scouts for the strongest recent candidates
3. Ask Summary Analyst for clear paper briefs
4. Ask Trend Editor for cross-paper patterns and hype checks
5. Post the digest plan to Status

### Paper Digest Build
- **Schedule:** manual
- **Mode:** managed (owner: trend-editor)
- **Targets:** agents: trend-editor; groups: Digest

# Paper Digest Build

1. Gather the strongest summaries and papers selected for the digest
2. Identify the major themes, disagreements, and likely overclaims
3. Recommend which papers deserve deeper reading now
4. Post the final digest draft to Digest and the short summary to Status
