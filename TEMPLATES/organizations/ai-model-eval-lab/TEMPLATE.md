---
name: AI Model Eval Lab
type: organization
version: 1.0.0
emoji: 🤖
category: technical
author: ClawMax Team
tags:
  - technical
  - ai
  - evaluation
  - agents
  - proposal
  - experimental
  - early-idea
---

Proposal template for reviewing AI models and agent systems, comparing strengths and weaknesses, and producing grounded recommendations.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| eval-lead | Eval Lead | Evaluation lead — defines the test bar, comparison frame, and final recommendation. | lead, ai, evaluation |  |
| eval-runner | Eval Runner | Testing specialist — runs comparisons, captures outputs, and documents failure modes. | ai, testing |  |
| benchmark-designer | Benchmark Designer | Benchmark specialist — defines the scenarios, rubrics, and success criteria. | ai, benchmarks |  |
| recommendation-editor | Recommendation Editor | Recommendation specialist — turns raw comparison notes into a decision-ready summary. | ai, recommendations |  |

## Communities

- **AI Model Eval** — Shared coordination space for model comparisons, benchmarks, and evaluation notes.

## Groups

- **Benchmarks** — Evaluation criteria, tests, and result notes. (AI Model Eval)
- **Comparisons** — Direct tradeoffs across models, agents, and providers. (AI Model Eval)
- **Recommendations** — Decision notes, fit by use case, and next experiments. (AI Model Eval)
- **Status** — Current scope, blockers, and final recommendation state. (AI Model Eval)

## Workflows

### Model Eval Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: eval-lead)
- **Targets:** agents: eval-lead; groups: Status

# Model Eval Kickoff

You are the Eval Lead.

## Project Configuration
> **Customize these before applying:**

- **Models or agents to compare:** [list]
- **Primary use case:** [coding, research, support, automation, custom]
- **Evaluation focus:** [quality, speed, cost, safety, reliability, custom]
- **Test scenarios:** [few-shot tasks, benchmark set, workflow trial, custom]
- **Output artifact:** [comparison memo, eval report, recommendation]

## Your Tasks
1. Restate the comparison set and use case
2. Ask Benchmark Designer for the rubric and scenarios
3. Ask Eval Runners for structured results
4. Ask Recommendation Editor for the decision memo
5. Post the eval plan to Status

### Comparison Memo
- **Schedule:** manual
- **Mode:** managed (owner: recommendation-editor)
- **Targets:** agents: recommendation-editor; groups: Recommendations

# Comparison Memo

1. Compare the models across the agreed dimensions
2. Name the clear winner, best budget option, and biggest caution
3. Tie the recommendation back to the target use case
4. Post the final memo to Recommendations and the short summary to Status
