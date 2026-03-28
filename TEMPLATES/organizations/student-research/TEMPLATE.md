---
name: Student Research
type: organization
version: 1.0.0
category: personal
author: ClawMax Team
tags:
  - personal
  - research
  - academic
  - writing
  - analysis
---

A multiagent research group for academic projects. Includes literature review, data analysis, and writing roles with workflows for systematic research and collaborative drafting.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| research-lead | Research Lead | Principal investigator — defines research questions, manages methodology, coordinates team efforts, and ensures academic rigor | lead, research, methodology | github, gh-issues |
| lit-reviewer | Literature Reviewer | Literature specialist — searches databases, reads papers, extracts key findings, identifies gaps, and maintains citation database | research, literature, citations |  |
| data-analyst | Data Analyst | Data analysis — cleans datasets, runs statistical analyses, creates visualizations, and validates findings against hypotheses | research, data, statistics | github, gh-issues |
| writer | Research Writer | Academic writing — drafts paper sections, synthesizes findings into narrative, ensures proper citations, and formats for submission | research, writing, drafting | github, gh-issues |

## Communities

- **Research Group** — All research group coordination and updates

## Groups

- **Literature** — Paper searches, reading notes, and citation management (Research Group)
- **Analysis** — Data analysis, methodology, and findings discussion (Research Group)
- **Writing** — Paper drafts, revisions, and submission prep (Research Group)
- **Status** — Research progress and team coordination (Research Group)

## Workflows

### Research Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: research-lead; tags: lead

# Research Group Kickoff

You are the Research Lead. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Research topic:** [e.g., Impact of LLMs on software engineering productivity]
- **Research question:** [e.g., How do AI coding assistants affect code quality?]
- **Scope:** [e.g., literature review, empirical study, meta-analysis]
- **Key databases:** [e.g., Google Scholar, arXiv, IEEE, ACM Digital Library]
- **Deadline:** [e.g., April 15, 2026]
- **GitHub repo:** [e.g., owner/repo — for paper drafts and data]

## Your Tasks
1. Introduce yourself in the Research Group community
2. Define the research question, scope, and methodology
3. Assign initial literature search topics to the lit reviewer
4. Brief the data analyst on expected data sources
5. Set milestones: lit review, analysis, first draft, submission

### Literature Search
- **Schedule:** 0 9 * * *
- **Mode:** automated
- **Targets:** agents: lit-reviewer; groups: Literature

# Daily Literature Search

1. Search academic databases for papers matching research keywords
2. Screen titles and abstracts for relevance to research question
3. For relevant papers: read and extract key findings, methods, and citations
4. Update the literature matrix with new entries
5. Post daily search summary to Literature group — flag any breakthrough papers

### Source Evaluation
- **Schedule:** manual
- **Mode:** managed
- **Targets:** groups: Literature, Analysis

# Source Evaluation Session

1. Review all collected sources for quality and relevance
2. Identify themes, contradictions, and gaps in the literature
3. Map sources to research sub-questions
4. Research lead: assess whether literature coverage is sufficient
5. Writer: begin outlining the literature review section based on themes

### Draft Review
- **Schedule:** manual
- **Mode:** managed
- **Targets:** groups: Writing

# Draft Review Session

1. Writer: share the latest draft section for review
2. Research lead: check for methodological accuracy and argument strength
3. Data analyst: verify data citations and statistical claims
4. Lit reviewer: check citation accuracy and completeness
5. Compile revision notes and assign rewrite tasks
