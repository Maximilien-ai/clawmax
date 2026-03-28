---
name: RAG Team
type: organization
version: 1.0.0
category: technical
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
---

A multiagent team that builds end-to-end RAG solutions using weave-cli. Includes planner, data engineers, search engineers, eval engineers, and ops engineers working in parallel workflows across 10 vector databases.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| planner | RAG Planner | Solution Architect | planner, lead | weave-planner, weave-setup |
| data-engineer | Data Engineer | Data Ingestion Specialist | data, ingest | weave-ingest |
| search-engineer | Search Engineer | Search & Agent Tuning Specialist | search, qa | weave-search |
| eval-engineer | Eval Engineer | Quality & Evaluation Specialist | eval, quality | weave-eval |
| ops-engineer | Ops Engineer | Infrastructure & Deployment Specialist | ops, infra | weave-stack |

## Communities

- **RAG Team** — Multiagent team building RAG solutions with weave-cli

## Groups

- **Planning** — Requirements gathering, architecture design, lifecycle coordination (RAG Team)
- **Data Pipeline** — Collection creation, schema design, data ingestion, backup (RAG Team)
- **Search & QA** — Query tuning, agent configuration, embedding comparison (RAG Team)
- **Quality** — Eval datasets, benchmarks, quality gates, iteration recommendations (RAG Team)
- **Ops** — Stack deployment, monitoring, day-2 operations (RAG Team)
- **Status** — Cross-team status updates and coordination (RAG Team)

## Workflows

### RAG Setup
- **Schedule:** manual
- **Mode:** automated
- **Targets:** tags: planner

## RAG Setup

1. Gather user requirements: What data sources? What query patterns? What quality bar?
2. Recommend VDB based on requirements (run `weave vdb list` to show options)
3. Run `weave config create --env` to initialize config.yaml and .env
4. Run `weave doctor --fix` to verify all components healthy
5. Run `weave health check` to confirm VDB connectivity
6. Report setup status and recommended next steps to the Planning group

### Data Pipeline
- **Schedule:** manual
- **Mode:** automated
- **Targets:** tags: data

## Data Pipeline

1. Run `weave schema suggest` on the source data directory to get AI schema recommendations
2. Run `weave chunking suggest` on a sample file for chunk size guidance
3. Create collections: `weave collection create <name>`
4. Dry-run ingestion: `weave pipeline ingest <source> --collection <name> --dry-run`
5. Run full ingestion with parallelism: `weave pipeline ingest <source> --collection <name> --workers 4 --batch-size 100`
6. Verify counts: `weave collection count <name>` and `weave document list <name>`
7. Backup: `weave backup create <collection> --compress`
8. Report ingestion stats to Data Pipeline group

### Search Tuning
- **Schedule:** manual
- **Mode:** automated
- **Targets:** tags: search

## Search Tuning

1. Create a RAG agent: `weave agents create rag-agent --type rag`
2. Create a QA agent: `weave agents create qa-agent --type qa`
3. Test representative queries across search modes: semantic, BM25, hybrid
4. Compare results: `weave collection query <name> "test query" --top-k 10`
5. If quality is low, try re-embedding: `weave collection re-embed <name> --new-embedding <model>`
6. Compare models: `weave collection compare <original> <re-embedded> --query "test" --report comparison.md`
7. Report best search configuration to Search & QA group

### Eval Cycle
- **Schedule:** manual
- **Mode:** automated
- **Targets:** tags: eval

## Eval Cycle

1. Create or verify baseline dataset (YAML with queries, expected answers, required concepts)
2. Run baseline eval: `weave eval run --agent rag-agent --dataset baseline --collection <name>`
3. Run benchmark across agent types: `weave eval benchmark --agents rag-agent,qa-agent --dataset baseline`
4. Check scores: accuracy >= 0.70, citation >= 0.75, relevance >= 0.60
5. If below threshold, recommend specific changes:
   - Low relevance: try hybrid search or different embedding model
   - Low accuracy: switch to QA agent with lower temperature
   - Low citation: enable strict mode with must_cite
6. Report results and recommendations to Quality group

### Deploy
- **Schedule:** manual
- **Mode:** automated
- **Targets:** tags: ops

## Deploy

1. Initialize stack config: `weave stack init`
2. Validate: `weave stack validate`
3. Deploy: `weave stack up --runtime kind` (local) or `--runtime eks` (cloud)
4. Verify health: `weave stack status`
5. Ingest data into stack: `weave stack ingest <source> --collection <name>`
6. Open dashboard: `weave stack dashboard`
7. Set up monitoring: `weave serve --metrics-port 9090`
8. Configure backup schedule
9. Report deployment status to Ops group

### Daily Status
- **Schedule:** 0 9 * * 1-5
- **Mode:** automated
- **Targets:** groups: Status

## Daily Status

Report your current status to the team:
1. What did you accomplish since last check-in?
2. What are you working on now?
3. Any blockers or issues that need attention?
4. Estimated progress toward your current objective (%)?

Keep it brief — 2-3 sentences per item.
