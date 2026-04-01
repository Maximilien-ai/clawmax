---
name: Materials Discovery Lab
type: organization
version: 1.0.0
emoji: ⚗️
category: science
author: ClawMax Team
tags:
  - science
  - materials
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for materials research spanning literature review, simulation planning, experiment design, and candidate ranking. Early idea and intended as a customizable starting point.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| materials-lead | Materials Lead | Research lead — selects target properties, coordinates the search strategy, and prioritizes candidate materials. | lead, materials, research | github, gh-issues |
| literature-scout | Literature Scout | Prior-art specialist — tracks known compounds, processing methods, benchmarks, and open opportunities. | materials, literature, prior-art |  |
| simulation-analyst | Simulation Analyst | Modeling specialist — proposes computational screening strategies, approximations, and ranking criteria. | materials, simulation, analysis |  |
| experiment-planner | Experiment Planner | Synthesis and validation planner — proposes fabrication, measurement, and validation sequences for promising candidates. | materials, experiments, validation |  |

## Communities

- **Materials Lab** — Shared space for materials discovery planning and evaluation.

## Groups

- **Literature** — Known materials, prior syntheses, benchmark properties, and search gaps. (Materials Lab)
- **Simulation** — Screening plans, computational approximations, and ranking criteria. (Materials Lab)
- **Experiments** — Fabrication, characterization, and validation planning for selected candidates. (Materials Lab)
- **Status** — Decision log, candidate rankings, blockers, and next-step recommendations. (Materials Lab)

## Workflows

### Materials Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: materials-lead)
- **Targets:** agents: materials-lead, literature-scout, simulation-analyst, experiment-planner; tags: lead

# Materials Kickoff

You are the Materials Lead. The lab just came online.

## Project Configuration
> **Customize these before applying:**

- **Target property:** [e.g., conductivity, hardness, battery lifetime, catalytic efficiency]
- **Material class:** [polymers, alloys, ceramics, catalysts, semiconductors, custom]
- **Constraints:** [cost, toxicity, processability, temperature range, custom]
- **Evidence sources:** [papers, patents, prior experiments, simulation results]
- **Output artifact:** [candidate shortlist, screening memo, experiment plan]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Define the target property profile and constraints
2. Ask Literature Scout for the baseline candidate set and benchmarks
3. Ask Simulation Analyst for the first computational screening plan
4. Ask Experiment Planner for the validation path for top candidates
5. Post a milestone summary and ranking criteria in Status

### Materials Prior Art Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: materials-lead)
- **Targets:** agents: literature-scout; groups: Literature

# Materials Prior Art Sweep

1. Collect the strongest prior examples relevant to the target property
2. Extract process details, benchmark values, and failure modes
3. Flag overused areas versus underexplored candidate spaces
4. Update Literature with a candidate matrix and top gaps
5. Escalate any important benchmark that changes the ranking logic

### Screening And Validation Cycle
- **Schedule:** manual
- **Mode:** managed (owner: materials-lead)
- **Targets:** agents: simulation-analyst, experiment-planner; groups: Simulation, Experiments

# Screening And Validation Cycle

1. Rank current candidates against the target property profile
2. Note the approximations and uncertainty in the computational screen
3. Select a short list worth physical validation or deeper simulation
4. Define the validation path, required measurements, and likely failure points
5. Post the recommended shortlist and rationale

### Candidate Review
- **Schedule:** manual
- **Mode:** managed (owner: materials-lead)
- **Targets:** agents: materials-lead, simulation-analyst, experiment-planner; groups: Status

# Candidate Review

1. Review the current candidate ranking and validation readiness
2. Compare the strongest options against cost, feasibility, and uncertainty
3. Choose whether to advance, revise, or replace the shortlist
4. Produce a concise recommendation memo with confidence
5. Post the final recommendation in Status
