---
name: AI Research Lab
type: organization
version: 1.0.0
category: science
author: ClawMax Team
tags:
  - science
  - ai
  - machine-learning
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for AI research across data and baseline review, training planning, evaluation, and safety checks. Early idea only and meant as a customizable starter.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| ai-lead | AI Lead | Research lead — defines the target capability, coordinates data, training, and evaluation, and decides the release bar. | lead, ai, research | github, gh-issues |
| baseline-analyst | Baseline Analyst | Baseline specialist — maps prior models, datasets, benchmarks, and strongest known baselines. | ai, baselines, benchmarks |  |
| training-engineer | Training Engineer | Training specialist — outlines model variants, data mixtures, and compute-aware experiment plans. | ai, training, models |  |
| eval-safety-analyst | Eval & Safety Analyst | Evaluation specialist — defines quality, robustness, and safety checks and interprets failure modes. | ai, evaluation, safety | github, gh-issues |

## Communities

- **AI Lab** — Shared coordination space for AI research planning, training, and evaluation.

## Groups

- **Data And Baselines** — Datasets, prior models, benchmark references, and baseline selection. (AI Lab)
- **Training** — Model variants, training runs, compute tradeoffs, and experiment planning. (AI Lab)
- **Evaluation** — Benchmark design, qualitative review, robustness checks, and safety notes. (AI Lab)
- **Status** — Progress updates, risks, release bar decisions, and recommended next steps. (AI Lab)

## Workflows

### AI Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: ai-lead)
- **Targets:** agents: ai-lead, baseline-analyst, training-engineer, eval-safety-analyst; tags: lead

# AI Kickoff

You are the AI Lead. The lab just came online.

## Project Configuration
> **Customize these before applying:**

- **Research goal:** [e.g., improve multimodal reasoning, retrieval quality, tool use, custom]
- **Model family or stack:** [transformer, diffusion, agentic stack, custom]
- **Core baselines:** [open models, hosted models, internal baselines, custom]
- **Key evaluation axes:** [quality, cost, latency, safety, robustness]
- **Output artifact:** [research memo, experiment plan, eval brief]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Define the target capability and success criteria
2. Ask Baseline Analyst for the strongest prior models and benchmark setup
3. Ask Training Engineer for the first training or adaptation plan
4. Ask Eval & Safety Analyst for the first eval and safety checklist
5. Post the first milestone and release bar notes in Status

### Data And Baseline Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: ai-lead)
- **Targets:** agents: baseline-analyst; groups: Data And Baselines

# Data And Baseline Sweep

1. Gather the most relevant datasets, model baselines, and benchmark setups
2. Compare current best-known numbers and where they may be weak or incomparable
3. Flag likely data gaps, contamination risks, or evaluation blind spots
4. Post the baseline summary to Data And Baselines
5. Escalate anything that should change the training or evaluation plan

### Training And Eval Cycle
- **Schedule:** manual
- **Mode:** managed (owner: ai-lead)
- **Targets:** agents: training-engineer, eval-safety-analyst; groups: Training, Evaluation

# Training And Eval Cycle

1. Define the next model or pipeline variant worth testing
2. State the data, compute, and safety tradeoffs involved
3. Define the exact benchmark and qualitative review plan
4. Produce a concise recommendation note with expected upside and main risks
5. Post the cycle plan to Training, Evaluation, and Status

### Release Bar Review
- **Schedule:** manual
- **Mode:** managed (owner: ai-lead)
- **Targets:** agents: ai-lead, training-engineer, eval-safety-analyst; groups: Status

# Release Bar Review

1. Review the latest training and evaluation evidence
2. Summarize the strongest gain, the biggest safety or robustness concern, and the main unknown
3. Decide whether to iterate, stop, or prepare a write-up or release candidate
4. Produce a short AI research review memo with next step
5. Post the decision to Status
