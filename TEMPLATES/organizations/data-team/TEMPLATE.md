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
agents:
  - id: data-lead
    name: Data Lead
    role: >-
      Head of data — sets data strategy, manages pipeline priorities,
      coordinates analytics and ML efforts, and reports to stakeholders
    tags:
      - lead
      - data
      - management
    skills:
      - github
      - gh-issues
    communities:
      - Data Team
    groups:
      - Pipeline
      - Analytics
      - ML
      - Status
  - id: data-engineer
    name: Data Engineer
    role: >-
      Pipeline builder — designs ETL/ELT pipelines, manages data warehouse,
      ensures data freshness, and handles schema migrations
    tags:
      - data
      - pipeline
      - engineering
    skills:
      - github
      - gh-issues
    communities:
      - Data Team
    groups:
      - Pipeline
      - Status
  - id: analyst
    name: Data Analyst
    role: >-
      Analytics — builds dashboards, runs ad-hoc queries, produces reports, and
      translates data into business insights
    tags:
      - data
      - analytics
      - reporting
    skills:
      - github
      - gh-issues
    communities:
      - Data Team
    groups:
      - Analytics
      - Status
  - id: ml-engineer
    name: ML Engineer
    role: >-
      Machine learning — trains models, manages experiments, deploys inference
      pipelines, and monitors model performance
    tags:
      - data
      - ml
      - engineering
    skills:
      - github
      - gh-issues
    communities:
      - Data Team
    groups:
      - ML
      - Pipeline
      - Status
communities:
  - name: Data Team
    description: All data team coordination and announcements
groups:
  - name: Pipeline
    description: 'Data pipeline health, ETL jobs, and schema changes'
    community: Data Team
  - name: Analytics
    description: 'Dashboards, reports, and ad-hoc analysis requests'
    community: Data Team
  - name: ML
    description: 'Model training, experiments, and deployment'
    community: Data Team
  - name: Status
    description: Daily standups and team coordination
    community: Data Team
workflows:
  - id: kickoff
    name: Team Kickoff
    description: Initialize the data team and assess current infrastructure
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - data-lead
    content: >-
      # Data Team Kickoff


      You are the Data Lead. Your team just came online.


      ## Project Configuration

      > **Customize these before applying:**


      - **Data sources:** [e.g., PostgreSQL, S3, Kafka, APIs]

      - **Pipeline tools:** [e.g., Airflow, dbt, Spark, Fivetran]

      - **Data warehouse:** [e.g., BigQuery, Snowflake, Redshift]

      - **Key metrics:** [e.g., DAU, revenue, conversion rate, churn]

      - **ML use cases:** [e.g., recommendation engine, fraud detection,
      forecasting]

      - **GitHub repo:** [e.g., owner/repo — for pipeline code and models]


      ## Your Tasks

      1. Introduce yourself in the Data Team community

      2. Review the workspace for existing pipeline code, schemas, or dashboards

      3. Assign pipeline ownership areas to data engineers

      4. Brief the analyst on priority reporting needs

      5. Discuss ML roadmap with the ML engineer and set first experiment
  - id: pipeline-monitoring
    name: Pipeline Monitoring
    description: Hourly pipeline health check and failure alerting
    schedule: 0 * * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Pipeline
      tags: []
      agents: []
    content: |-
      # Pipeline Monitoring

      1. Check all scheduled ETL/ELT job statuses
      2. Flag any failed or stalled pipelines with error details
      3. Verify data freshness — check latest timestamps in key tables
      4. For failures: notify the responsible data engineer and log incident
      5. Post pipeline health summary to Status group
  - id: data-quality
    name: Data Quality Check
    description: Daily data quality validation and anomaly detection
    schedule: 0 8 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Pipeline
        - Analytics
      tags: []
      agents: []
    content: |-
      # Daily Data Quality Check

      1. Run schema validation on all ingested tables
      2. Check for null rates, duplicate keys, and referential integrity
      3. Compare row counts against expected ranges (detect drops or spikes)
      4. Run statistical anomaly detection on key business metrics
      5. Post quality scorecard to Status group — flag any violations
  - id: model-eval
    name: Model Evaluation
    description: Weekly ML model performance review
    schedule: 0 14 * * 5
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - ML
      tags: []
      agents:
        - ml-engineer
    content: >-
      # Weekly Model Evaluation


      1. Pull inference metrics for all deployed models (accuracy, latency,
      error rate)

      2. Compare current performance against baseline and SLA thresholds

      3. Check for data drift — distribution shifts in input features

      4. Recommend retraining if metrics degraded beyond threshold

      5. Post model performance report to Status group with trend charts
---
A multiagent data team with pipeline engineering, analytics, and ML roles. Automates pipeline monitoring, data quality checks, and model evaluation workflows.
