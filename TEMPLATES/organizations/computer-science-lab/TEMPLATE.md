---
name: Computer Science Lab
type: organization
version: 1.0.0
emoji: 💻
category: science
author: ClawMax Team
tags:
  - science
  - computer-science
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for computer science research spanning prior-work review, prototype design, benchmarking, and paper-ready summaries. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| cs-lead | CS Lead | Research lead — selects the problem framing, coordinates prototyping and evaluation, and sets the evidence bar for claims. | lead, computer-science, research | github, gh-issues |
| benchmark-scout | Benchmark Scout | Prior-art and benchmark specialist — collects related methods, datasets, baselines, and evaluation gaps. | computer-science, benchmarks, prior-work |  |
| prototype-engineer | Prototype Engineer | Prototype specialist — drafts algorithmic designs, implementation plans, and likely tradeoffs. | computer-science, prototype, implementation | github, gh-issues |
| eval-analyst | Evaluation Analyst | Evaluation specialist — defines metrics, benchmark comparisons, and risk-adjusted interpretation of results. | computer-science, evaluation, metrics |  |

## Communities

- **CS Lab** — Shared space for computer science research planning, prototyping, and evaluation.

## Groups

- **Prior Work** — Related systems, baselines, datasets, and benchmark assumptions. (CS Lab)
- **Prototype** — System design, algorithm structure, implementation tradeoffs, and open engineering risks. (CS Lab)
- **Evaluation** — Metrics, benchmark design, comparison logic, and result interpretation. (CS Lab)
- **Status** — Milestones, blockers, evidence quality, and next-step recommendations. (CS Lab)

## Workflows

### CS Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: cs-lead)
- **Targets:** agents: cs-lead, benchmark-scout, prototype-engineer, eval-analyst; tags: lead

# CS Kickoff

You are the CS Lead. The lab just came online.

## Project Configuration
> **Customize these before applying:**

- **Research problem:** [e.g., improve retrieval latency without harming answer quality]
- **Subfield:** [systems, programming languages, HCI, security, ML systems, custom]
- **Core baselines:** [papers, repos, public benchmarks, custom]
- **Evaluation targets:** [latency, accuracy, memory, robustness, cost, custom]
- **Output artifact:** [design memo, prototype plan, benchmark brief, paper outline]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Define the problem statement and success criteria
2. Ask Benchmark Scout for the closest prior methods and datasets
3. Ask Prototype Engineer for the first implementation strategy
4. Ask Evaluation Analyst for the first benchmark design and metrics
5. Post the milestone summary and risk notes to Status

### Benchmark Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: cs-lead)
- **Targets:** agents: benchmark-scout; groups: Prior Work

# Benchmark Sweep

1. Gather the strongest prior systems, repos, datasets, and baselines for the configured problem
2. Note which metrics and evaluation regimes dominate the literature
3. Highlight where comparisons are weak, missing, or potentially misleading
4. Post the benchmark summary to Prior Work
5. Flag anything that should change the prototype plan or metric choice

### Prototype And Eval Cycle
- **Schedule:** manual
- **Mode:** managed (owner: cs-lead)
- **Targets:** agents: prototype-engineer, eval-analyst; groups: Prototype, Evaluation

# Prototype And Eval Cycle

1. Draft the next prototype slice or algorithmic variant worth testing
2. Define the benchmark setup, metrics, and failure conditions
3. State the expected tradeoffs versus the strongest baseline
4. Produce a concise recommendation memo with confidence and open risks
5. Post the cycle plan to Prototype, Evaluation, and Status

### Results And Paper Review
- **Schedule:** manual
- **Mode:** managed (owner: cs-lead)
- **Targets:** agents: cs-lead, prototype-engineer, eval-analyst; groups: Status

# Results And Paper Review

1. Review the current prototype status and benchmark story
2. Summarize the strongest claim, main caveat, and missing evidence
3. Decide whether to iterate, pivot, or move toward a write-up
4. Produce a short CS research memo with next step
5. Post the outcome to Status
