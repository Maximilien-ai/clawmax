---
name: RAG Team
type: organization
version: 1.0.0
author: ClawMax Team
tags:
  - technical
  - rag
  - weave-cli
  - vector-database
  - ai
  - multiagent
parameters:
  - agentId: data-engineer
    label: Number of Data Engineers
    default: 2
    min: 1
    max: 10
  - agentId: search-engineer
    label: Number of Search Engineers
    default: 1
    min: 1
    max: 5
  - agentId: eval-engineer
    label: Number of Eval Engineers
    default: 1
    min: 1
    max: 5
agents:
  - id: planner
    name: RAG Planner
    role: Solution Architect
    tags:
      - planner
      - lead
    skills:
      - weave-planner
      - weave-setup
    communities:
      - RAG Team
    groups:
      - Planning
      - Status
  - id: data-engineer
    name: Data Engineer
    role: Data Ingestion Specialist
    tags:
      - data
      - ingest
    skills:
      - weave-ingest
    communities:
      - RAG Team
    groups:
      - Data Pipeline
      - Status
  - id: search-engineer
    name: Search Engineer
    role: Search & Agent Tuning Specialist
    tags:
      - search
      - qa
    skills:
      - weave-search
    communities:
      - RAG Team
    groups:
      - Search & QA
      - Status
  - id: eval-engineer
    name: Eval Engineer
    role: Quality & Evaluation Specialist
    tags:
      - eval
      - quality
    skills:
      - weave-eval
    communities:
      - RAG Team
    groups:
      - Quality
      - Status
  - id: ops-engineer
    name: Ops Engineer
    role: Infrastructure & Deployment Specialist
    tags:
      - ops
      - infra
    skills:
      - weave-stack
    communities:
      - RAG Team
    groups:
      - Ops
      - Status
communities:
  - name: RAG Team
    description: Multiagent team building RAG solutions with weave-cli
    channels: []
groups:
  - name: Planning
    community: RAG Team
    description: 'Requirements gathering, architecture design, lifecycle coordination'
    channels: []
  - name: Data Pipeline
    community: RAG Team
    description: 'Collection creation, schema design, data ingestion, backup'
    channels: []
  - name: Search & QA
    community: RAG Team
    description: 'Query tuning, agent configuration, embedding comparison'
    channels: []
  - name: Quality
    community: RAG Team
    description: 'Eval datasets, benchmarks, quality gates, iteration recommendations'
    channels: []
  - name: Ops
    community: RAG Team
    description: 'Stack deployment, monitoring, day-2 operations'
    channels: []
  - name: Status
    community: RAG Team
    description: Cross-team status updates and coordination
    channels: []
workflows:
  - id: rag-setup
    name: RAG Setup
    schedule: manual
    enabled: false
    targeting:
      tags:
        - planner
      communities: []
      groups: []
      agents: []
    executionMode: automated
    description: 'Gather requirements, configure weave-cli, verify VDB health'
    content: >-
      ## RAG Setup


      1. Gather user requirements: What data sources? What query patterns? What
      quality bar?

      2. Recommend VDB based on requirements (run `weave vdb list` to show
      options)

      3. Run `weave config create --env` to initialize config.yaml and .env

      4. Run `weave doctor --fix` to verify all components healthy

      5. Run `weave health check` to confirm VDB connectivity

      6. Report setup status and recommended next steps to the Planning group
  - id: data-pipeline
    name: Data Pipeline
    schedule: manual
    enabled: false
    targeting:
      tags:
        - data
      communities: []
      groups: []
      agents: []
    executionMode: automated
    description: 'Create collections, ingest documents in parallel batches, backup'
    content: >-
      ## Data Pipeline


      1. Run `weave schema suggest` on the source data directory to get AI
      schema recommendations

      2. Run `weave chunking suggest` on a sample file for chunk size guidance

      3. Create collections: `weave collection create <name>`

      4. Dry-run ingestion: `weave pipeline ingest <source> --collection <name>
      --dry-run`

      5. Run full ingestion with parallelism: `weave pipeline ingest <source>
      --collection <name> --workers 4 --batch-size 100`

      6. Verify counts: `weave collection count <name>` and `weave document list
      <name>`

      7. Backup: `weave backup create <collection> --compress`

      8. Report ingestion stats to Data Pipeline group
  - id: search-tuning
    name: Search Tuning
    schedule: manual
    enabled: false
    targeting:
      tags:
        - search
      communities: []
      groups: []
      agents: []
    executionMode: automated
    description: 'Configure agents, test queries, compare search modes and embeddings'
    content: >-
      ## Search Tuning


      1. Create a RAG agent: `weave agents create rag-agent --type rag`

      2. Create a QA agent: `weave agents create qa-agent --type qa`

      3. Test representative queries across search modes: semantic, BM25, hybrid

      4. Compare results: `weave collection query <name> "test query" --top-k
      10`

      5. If quality is low, try re-embedding: `weave collection re-embed <name>
      --new-embedding <model>`

      6. Compare models: `weave collection compare <original> <re-embedded>
      --query "test" --report comparison.md`

      7. Report best search configuration to Search & QA group
  - id: eval-cycle
    name: Eval Cycle
    schedule: manual
    enabled: false
    targeting:
      tags:
        - eval
      communities: []
      groups: []
      agents: []
    executionMode: automated
    description: 'Run baseline evals, benchmark agents, report results and recommendations'
    content: >-
      ## Eval Cycle


      1. Create or verify baseline dataset (YAML with queries, expected answers,
      required concepts)

      2. Run baseline eval: `weave eval run --agent rag-agent --dataset baseline
      --collection <name>`

      3. Run benchmark across agent types: `weave eval benchmark --agents
      rag-agent,qa-agent --dataset baseline`

      4. Check scores: accuracy >= 0.70, citation >= 0.75, relevance >= 0.60

      5. If below threshold, recommend specific changes:
         - Low relevance: try hybrid search or different embedding model
         - Low accuracy: switch to QA agent with lower temperature
         - Low citation: enable strict mode with must_cite
      6. Report results and recommendations to Quality group
  - id: deploy
    name: Deploy
    schedule: manual
    enabled: false
    targeting:
      tags:
        - ops
      communities: []
      groups: []
      agents: []
    executionMode: automated
    description: 'Initialize stack, deploy to k8s/podman, verify health, set up monitoring'
    content: >-
      ## Deploy


      1. Initialize stack config: `weave stack init`

      2. Validate: `weave stack validate`

      3. Deploy: `weave stack up --runtime kind` (local) or `--runtime eks`
      (cloud)

      4. Verify health: `weave stack status`

      5. Ingest data into stack: `weave stack ingest <source> --collection
      <name>`

      6. Open dashboard: `weave stack dashboard`

      7. Set up monitoring: `weave serve --metrics-port 9090`

      8. Configure backup schedule

      9. Report deployment status to Ops group
  - id: daily-status
    name: Daily Status
    schedule: 0 9 * * 1-5
    enabled: true
    targeting:
      groups:
        - Status
      communities: []
      tags: []
      agents: []
    executionMode: automated
    description: Daily status check — each agent reports progress in their area
    content: |-
      ## Daily Status

      Report your current status to the team:
      1. What did you accomplish since last check-in?
      2. What are you working on now?
      3. Any blockers or issues that need attention?
      4. Estimated progress toward your current objective (%)?

      Keep it brief — 2-3 sentences per item.
category: technical
---
A multiagent team that builds end-to-end RAG solutions using weave-cli. Includes planner, data engineers, search engineers, eval engineers, and ops engineers working in parallel workflows across 10 vector databases.
