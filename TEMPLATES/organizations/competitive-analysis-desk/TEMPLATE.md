---
name: Competitive Analysis Desk
type: organization
version: 1.0.0
emoji: 🥊
category: business
author: ClawMax Team
tags:
  - business
  - competitive-analysis
  - tam
  - product
  - proposal
  - experimental
  - early-idea
---

Proposal template for analyzing competitors, TAM, positioning, and the strongest current products around a product idea.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| analysis-lead | Analysis Lead | Competitive lead — sets the market question and final strategic recommendation. | lead, strategy, market |  |
| competitor-analyst | Competitor Analyst | Competitor specialist — maps current products, strengths, weaknesses, and positioning. | competition, analysis |  |
| tam-estimator | TAM Estimator | Market specialist — outlines market size, segments, and what is realistically reachable. | market, tam |  |
| positioning-editor | Positioning Editor | Positioning specialist — turns market facts into a differentiated strategy memo. | positioning, strategy |  |

## Communities

- **Competitive Analysis** — Shared coordination space for competitor mapping and market analysis.

## Groups

- **Competitors** — Current players, product comparisons, and positioning. (Competitive Analysis)
- **Market** — TAM, segments, and market shape. (Competitive Analysis)
- **Strategy** — Opportunities, threats, and strategic recommendation. (Competitive Analysis)
- **Status** — Current market thesis, open questions, and final stance. (Competitive Analysis)

## Workflows

### Competitive Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: analysis-lead)
- **Targets:** agents: analysis-lead; groups: Status

# Competitive Kickoff

You are the Analysis Lead.

## Project Configuration
> **Customize these before applying:**

- **Product idea:** [idea]
- **Target market or user:** [market]
- **Region or scope:** [global, US, enterprise, SMB, custom]
- **Decision needed:** [invest, build, position, niche, custom]
- **Output artifact:** [competitive memo, TAM brief, strategy note]

## Your Tasks
1. Restate the product idea and target market
2. Ask Competitor Analysts for the strongest current players and products
3. Ask TAM Estimator for the market shape and reachable slices
4. Ask Positioning Editor for the likely differentiation paths
5. Post the plan to Status

### Competitive Strategy Brief
- **Schedule:** manual
- **Mode:** managed (owner: positioning-editor)
- **Targets:** agents: positioning-editor; groups: Strategy

# Competitive Strategy Brief

1. Combine competitor findings and TAM notes into a strategy memo
2. Name the strongest incumbents and the most realistic wedge
3. Call out where the idea is crowded, weak, or unexpectedly open
4. Post the final brief to Strategy and the short recommendation to Status
