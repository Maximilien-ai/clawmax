---
name: Build-a-Company Hack Test
type: organization
version: 1.0.0
category: technical
author: ClawMax Team
tags:
  - hackathon
  - company
  - teams
  - org-chart
  - workflow-handoffs
---

Hackathon test template for company structures with teams, leaders, cross-team handoffs, and reusable workflow contracts.

## Agents

| id | name | role | tags | skills | communities | groups |
|----|------|------|------|--------|-------------|--------|
| ceo | CEO | Sets company direction, priorities, and final decision-making. | leadership, exec |  | Build-a-Company | Leadership |
| product-lead | Product Lead | Turns company goals into product strategy, briefs, and execution direction. | product, lead |  | Build-a-Company | Leadership, Product |
| eng-lead | Engineering Lead | Owns implementation planning, technical execution, and engineering coordination. | engineering, lead |  | Build-a-Company | Engineering |
| growth-lead | Growth Lead | Owns launch planning, demand generation, and market-facing execution. | growth, lead |  | Build-a-Company | Growth |

## Teams

- **Leadership** — Set direction and issue the initial company brief. (id: leadership; leader: ceo; members: product-lead; tags: exec)
- **Product** — Translate leadership direction into a structured product brief. (id: product; leader: product-lead; parent: leadership; tags: planning)
- **Engineering** — Convert the product brief into an implementation plan. (id: engineering; leader: eng-lead; parent: leadership; tags: build)
- **Growth** — Convert the implementation plan into a launch and growth plan. (id: growth; leader: growth-lead; parent: leadership; tags: launch)

## Communities

- **Build-a-Company** — Cross-company coordination space for the hackathon template.

## Groups

- **Leadership** — Leadership planning and direction setting (Build-a-Company)
- **Product** — Product planning and briefs (Build-a-Company)
- **Engineering** — Engineering planning and execution (Build-a-Company)
- **Growth** — Growth and launch planning (Build-a-Company)

## Workflows

### Leadership Kickoff
- **Description:** Create the company brief and strategic direction.
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: ceo, product-lead; groups: Leadership

    # Leadership Kickoff

    Produce the company direction and leadership brief.

    ## Output
    - Publish a structured brief for downstream teams.

### Product Brief
- **Description:** Turn the leadership brief into a product plan.
- **Schedule:** manual
- **Mode:** managed
- **Depends On:** leadership-kickoff
- **Targets:** agents: product-lead; groups: Product

    # Product Brief

    Use the upstream leadership brief to produce a product plan.

    ## Output
    - Publish a structured product plan for engineering.
