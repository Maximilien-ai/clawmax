---
name: Statistics Research Lab
type: organization
version: 1.0.0
category: science
author: ClawMax Team
tags:
  - science
  - statistics
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for statistical study design, data audit, inference, and results review. Early idea only and intended as a starter scaffold for customization.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| stats-lead | Statistics Lead | Research lead — defines the inferential goal, coordinates the analysis plan, and decides the acceptable evidence bar. | lead, statistics, research | github, gh-issues |
| study-designer | Study Designer | Design specialist — sharpens assumptions, study structure, randomization needs, and power considerations. | statistics, design, causal |  |
| data-auditor | Data Auditor | Data quality specialist — checks schema, missingness, leakage, outliers, and sampling risks. | statistics, data, quality |  |
| inference-analyst | Inference Analyst | Modeling specialist — proposes estimators, diagnostics, sensitivity checks, and interpretation rules. | statistics, models, inference | github, gh-issues |

## Communities

- **Statistics Lab** — Shared space for study design, data quality, and inference planning.

## Groups

- **Design** — Problem framing, assumptions, sampling, power, and study structure. (Statistics Lab)
- **Data** — Dataset audit, missingness, leakage, transformations, and quality issues. (Statistics Lab)
- **Inference** — Estimators, diagnostics, uncertainty, sensitivity checks, and interpretation. (Statistics Lab)
- **Status** — Decision log, evidence bar, open risks, and next-step guidance. (Statistics Lab)

## Workflows

### Study Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: stats-lead)
- **Targets:** agents: stats-lead, study-designer, data-auditor, inference-analyst; tags: lead

# Study Kickoff

You are the Statistics Lead. The lab just came online.

## Project Configuration
> **Customize these before applying:**

- **Question:** [e.g., which intervention has the largest effect?]
- **Goal:** [prediction, estimation, causal inference, uncertainty quantification, custom]
- **Population or data source:** [who or what the data represents]
- **Constraints:** [sample size, missingness, latency, compliance, cost]
- **Output artifact:** [analysis memo, estimator comparison, study plan]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Define the inferential question and success criteria
2. Ask Study Designer for the initial design assumptions and risks
3. Ask Data Auditor for the first data-quality checklist
4. Ask Inference Analyst for the first estimator and diagnostic plan
5. Post the milestone summary and evidence bar in Status

### Data And Design Audit
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: stats-lead)
- **Targets:** agents: study-designer, data-auditor; groups: Design, Data

# Data And Design Audit

1. Review whether the data and design can support the target inference
2. Identify missingness, leakage, imbalance, or confounding risks
3. Propose the highest-impact fixes or sensitivity checks
4. Post the audit summary to Design and Data
5. Escalate any issue that undermines the current analysis plan

### Model And Inference Cycle
- **Schedule:** manual
- **Mode:** managed (owner: stats-lead)
- **Targets:** agents: inference-analyst; groups: Inference

# Model And Inference Cycle

1. Select the current estimator or model family to evaluate
2. Define diagnostics, uncertainty summaries, and failure conditions
3. Compare the likely interpretation risks versus the alternative approaches
4. Produce a concise inference note with confidence and caveats
5. Post the result to Inference and Status

### Results Review
- **Schedule:** manual
- **Mode:** managed (owner: stats-lead)
- **Targets:** agents: stats-lead, study-designer, inference-analyst; groups: Status

# Results Review

1. Review the strongest current estimate or model result
2. Summarize uncertainty, assumptions, and the main interpretation risk
3. Decide whether to collect more data, change design, or finalize the finding
4. Produce a short statistics review memo with next step
5. Post the outcome to Status
