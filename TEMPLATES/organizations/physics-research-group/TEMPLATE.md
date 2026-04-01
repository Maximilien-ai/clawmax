---
name: Physics Research Group
type: organization
version: 1.0.0
category: science
author: ClawMax Team
tags:
  - science
  - physics
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for theory, simulation, experiment coordination, and result review in physics research. Early idea only and meant to be adapted to the specific field.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| physics-lead | Physics Lead | Research lead — frames the core question, coordinates theory and experiment, and decides the next line of attack. | lead, physics, research | github, gh-issues |
| theory-analyst | Theory Analyst | Theory specialist — derives approximations, collects governing equations, and sharpens the hypothesis space. | physics, theory, analysis |  |
| simulation-analyst | Simulation Analyst | Modeling specialist — proposes simulations, parameter sweeps, and sanity checks for the main hypothesis. | physics, simulation, models |  |
| experiment-coordinator | Experiment Coordinator | Experimental planning specialist — translates theory targets into measurable signals, setups, and validation steps. | physics, experiments, measurement |  |

## Communities

- **Physics Group** — Shared coordination space for physics theory, simulation, and experiment planning.

## Groups

- **Theory** — Hypotheses, derivations, approximations, and open theoretical questions. (Physics Group)
- **Simulation** — Model choices, parameter sweeps, numerical checks, and uncertainty notes. (Physics Group)
- **Experiments** — Measurement plans, observable definitions, setup assumptions, and feasibility checks. (Physics Group)
- **Status** — Milestones, open risks, confidence updates, and recommended next steps. (Physics Group)

## Workflows

### Physics Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: physics-lead)
- **Targets:** agents: physics-lead, theory-analyst, simulation-analyst, experiment-coordinator; tags: lead

# Physics Kickoff

You are the Physics Lead. The research group just came online.

## Project Configuration
> **Customize these before applying:**

- **Research question:** [e.g., what mechanism best explains the observed effect?]
- **Field:** [condensed matter, high-energy, optics, fluids, astro, custom]
- **Core observables:** [signals or quantities that matter most]
- **Model inputs:** [notes, equations, prior runs, papers, lab data]
- **Output artifact:** [research memo, experiment plan, model comparison]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Define the main question and minimal success criteria
2. Ask Theory Analyst for the first framing and governing assumptions
3. Ask Simulation Analyst for the most useful computational check
4. Ask Experiment Coordinator for the nearest measurable validation path
5. Post the initial risk and milestone summary in Status

### Theory And Prior Work Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: physics-lead)
- **Targets:** agents: theory-analyst; groups: Theory

# Theory And Prior Work Sweep

1. Summarize the key assumptions, approximations, and competing explanations
2. Collect the strongest prior analytical or empirical results
3. Note which observables separate the leading hypotheses
4. Update Theory with a concise summary of useful model ingredients
5. Flag any assumption that makes the current approach weak or brittle

### Simulation And Measurement Cycle
- **Schedule:** manual
- **Mode:** managed (owner: physics-lead)
- **Targets:** agents: simulation-analyst, experiment-coordinator; groups: Simulation, Experiments

# Simulation And Measurement Cycle

1. Propose the next simulation or parameter sweep to separate candidate explanations
2. State the uncertainty and limits of the model
3. Translate the most useful output into measurable signals or thresholds
4. Identify the simplest validation path and the highest-risk failure mode
5. Post a recommended next cycle to Simulation and Experiments

### Physics Review
- **Schedule:** manual
- **Mode:** managed (owner: physics-lead)
- **Targets:** agents: physics-lead, theory-analyst, simulation-analyst, experiment-coordinator; groups: Status

# Physics Review

1. Review the current theoretical framing, simulation output, and measurement readiness
2. Summarize the strongest current explanation and the biggest open gap
3. Decide whether to deepen theory, run another simulation, or move toward measurement
4. Produce a short review memo with confidence and next step
5. Post the decision to Status
