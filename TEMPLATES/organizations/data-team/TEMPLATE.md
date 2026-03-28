---
name: Data Team
type: organization
version: 1.0.0
category: technical
author: ClawMax Team
tags:
  - technical
  - data
  - analytics
  - ml
  - pipeline
parameters:
  - agentId: data-engineer
    label: Number of Data Engineers
    default: 2
    min: 1
    max: 6
---

A multiagent data team with pipeline engineering, analytics, and ML roles. Automates pipeline monitoring, data quality checks, and model evaluation workflows.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| data-lead | Data Lead | Head of data — sets data strategy, manages pipeline priorities, coordinates analytics and ML efforts, and reports to stakeholders | lead, data, management | github, gh-issues |
| data-engineer | Data Engineer | Pipeline builder — designs ETL/ELT pipelines, manages data warehouse, ensures data freshness, and handles schema migrations | data, pipeline, engineering | github, gh-issues |
| analyst | Data Analyst | Analytics — builds dashboards, runs ad-hoc queries, produces reports, and translates data into business insights | data, analytics, reporting | github, gh-issues |
| ml-engineer | ML Engineer | Machine learning — trains models, manages experiments, deploys inference pipelines, and monitors model performance | data, ml, engineering | github, gh-issues |

## Communities

- **Data Team** — All data team coordination and announcements

## Groups

- **Pipeline** — Data pipeline health, ETL jobs, and schema changes (Data Team)
- **Analytics** — Dashboards, reports, and ad-hoc analysis requests (Data Team)
- **ML** — Model training, experiments, and deployment (Data Team)
- **Status** — Daily standups and team coordination (Data Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: data-lead; tags: lead

# Data Team Kickoff

You are the Data Lead. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Data sources:** [e.g., PostgreSQL, S3, Kafka, APIs]
- **Pipeline tools:** [e.g., Airflow, dbt, Spark, Fivetran]
- **Data warehouse:** [e.g., BigQuery, Snowflake, Redshift]
- **Key metrics:** [e.g., DAU, revenue, conversion rate, churn]
- **ML use cases:** [e.g., recommendation engine, fraud detection, forecasting]
- **GitHub repo:** [e.g., owner/repo — for pipeline code and models]

## Your Tasks
1. Introduce yourself in the Data Team community
2. Review the workspace for existing pipeline code, schemas, or dashboards
3. Assign pipeline ownership areas to data engineers
4. Brief the analyst on priority reporting needs
5. Discuss ML roadmap with the ML engineer and set first experiment

### Pipeline Monitoring
- **Schedule:** 0 * * * *
- **Mode:** automated
- **Targets:** groups: Pipeline

# Pipeline Monitoring

1. Check all scheduled ETL/ELT job statuses
2. Flag any failed or stalled pipelines with error details
3. Verify data freshness — check latest timestamps in key tables
4. For failures: notify the responsible data engineer and log incident
5. Post pipeline health summary to Status group

### Data Quality Check
- **Schedule:** 0 8 * * *
- **Mode:** automated
- **Targets:** groups: Pipeline, Analytics

# Daily Data Quality Check

1. Run schema validation on all ingested tables
2. Check for null rates, duplicate keys, and referential integrity
3. Compare row counts against expected ranges (detect drops or spikes)
4. Run statistical anomaly detection on key business metrics
5. Post quality scorecard to Status group — flag any violations

### Model Evaluation
- **Schedule:** 0 14 * * 5
- **Mode:** managed
- **Targets:** agents: ml-engineer; groups: ML

# Weekly Model Evaluation

1. Pull inference metrics for all deployed models (accuracy, latency, error rate)
2. Compare current performance against baseline and SLA thresholds
3. Check for data drift — distribution shifts in input features
4. Recommend retraining if metrics degraded beyond threshold
5. Post model performance report to Status group with trend charts
