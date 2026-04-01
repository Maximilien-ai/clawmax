---
name: Biological Research Lab
type: organization
version: 1.0.0
category: science
author: ClawMax Team
tags:
  - science
  - biology
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for a biology-focused research lab. Starter scaffold for literature review, experiment planning, bioinformatics analysis, and manuscript drafting. Early idea only and expected to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| biology-lead | Biology Lead | Principal investigator — defines the question, frames hypotheses, coordinates the team, and decides the next experimental direction. | lead, biology, research | github, gh-issues |
| literature-reviewer | Literature Reviewer | Literature specialist — searches prior papers, extracts methods and findings, and highlights competing hypotheses. | biology, literature, papers |  |
| experiment-planner | Experiment Planner | Wet-lab planning specialist — outlines protocols, controls, sample sizing assumptions, and operational risks. | biology, experiments, protocols |  |
| bioinformatics-analyst | Bioinformatics Analyst | Computational biology analyst — prepares datasets, runs analysis pipelines, and interprets signal quality and limitations. | biology, analysis, bioinformatics | github, gh-issues |

## Communities

- **Biology Lab** — Shared coordination space for biology research planning and execution.

## Groups

- **Literature** — Paper triage, prior work, methods comparison, and citation tracking. (Biology Lab)
- **Experiments** — Protocol design, controls, sequencing of experiments, and operational risks. (Biology Lab)
- **Analysis** — Data processing, bioinformatics review, result interpretation, and confidence calls. (Biology Lab)
- **Status** — Milestones, blockers, decisions, and next-step coordination. (Biology Lab)

## Workflows

### Biology Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: biology-lead)
- **Targets:** agents: biology-lead, literature-reviewer, experiment-planner, bioinformatics-analyst; tags: lead

# Biology Lab Kickoff

You are the Biology Lead. Your lab just came online.

## Project Configuration
> **Customize these before applying:**

- **Research topic:** [e.g., single-cell response to a treatment]
- **Primary question:** [e.g., which pathway shifts most strongly after perturbation?]
- **Experimental system:** [cell line, organoid, animal model, custom]
- **Data sources:** [public datasets, wet-lab notes, sequencing outputs, custom]
- **Output artifact:** [study brief, experiment plan, figure set, manuscript outline]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Introduce the lab in the Biology Lab community
2. Define the main question, hypotheses, and success criteria
3. Direct Literature Reviewer to map relevant prior work
4. Direct Experiment Planner to draft the first experiment sequence
5. Direct Bioinformatics Analyst to prepare the initial analysis path
6. Post a milestone summary in Status

### Prior Work Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: biology-lead)
- **Targets:** agents: literature-reviewer; groups: Literature

# Prior Work Sweep

1. Search the most relevant biology papers and protocol references for the configured topic
2. Extract methods, sample sizes, controls, and key findings
3. Highlight disagreements, gaps, or under-tested assumptions
4. Post a concise literature matrix update in Literature
5. Flag anything that changes the recommended experimental direction in Status

### Experiment And Analysis Cycle
- **Schedule:** manual
- **Mode:** managed (owner: biology-lead)
- **Targets:** agents: experiment-planner, bioinformatics-analyst; groups: Experiments, Analysis

# Experiment And Analysis Cycle

1. Translate the latest question and literature into a concrete experiment proposal
2. Define controls, expected measurements, and the minimum signal needed to proceed
3. Draft the associated analysis plan and quality checks
4. Note major risks, assumptions, and missing inputs
5. Post the proposed cycle to Experiments and Analysis with a recommendation

### Results And Next Step Review
- **Schedule:** manual
- **Mode:** managed (owner: biology-lead)
- **Targets:** agents: biology-lead, experiment-planner, bioinformatics-analyst; groups: Status

# Results And Next Step Review

1. Review the current literature, experiment plan, and analysis notes
2. Summarize the strongest grounded findings and open risks
3. Decide whether to run, revise, or stop the next proposed experiment
4. Produce a short biology brief with confidence and next step
5. Post the decision and owner in Status
