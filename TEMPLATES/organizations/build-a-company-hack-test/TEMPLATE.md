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

| id | name | role | tags | skills |
|----|------|------|------|--------|
| ceo | CEO | Sets company direction, priorities, and final decision-making. | leadership, exec | |
| execution-lead | Execution Lead | Turns company goals into an execution plan, milestones, and operating briefs. | execution, operations, lead | |
| program-manager | Program Manager | Keeps milestones, dependencies, and execution follow-through aligned across teams. | execution, operations | |
| eng-lead | Engineering Lead | Owns technical planning, implementation sequencing, and engineering coordination. | engineering, lead | |
| platform-engineer | Platform Engineer | Breaks the execution plan into implementation milestones, dependencies, and delivery notes. | engineering, platform | |
| marketing-lead | Marketing Lead | Owns launch messaging, content packaging, and market-facing execution. | marketing, lead | |
| content-strategist | Content Strategist | Turns launch goals into messaging, campaign assets, and reusable content packages. | marketing, content | |
| qa-lead | QA Lead | Validates quality, release readiness, and cross-team handoff completeness. | qa, quality, lead | |
| release-analyst | Release Analyst | Checks handoff completeness, release risks, and readiness evidence across teams. | qa, analysis | |

## Communities

- **Build-a-Company** — Cross-company coordination space for the hackathon template.

## Groups

- **Leadership** — Leadership planning and direction setting (Build-a-Company)
- **Execution** — Execution planning and operating briefs (Build-a-Company)
- **Engineering** — Engineering planning and execution (Build-a-Company)
- **Marketing** — Marketing launch planning and content packaging (Build-a-Company)
- **QA** — Quality assurance and readiness review (Build-a-Company)

## Workflows

### Leadership Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: ceo; groups: Leadership

# Leadership Kickoff

Produce the company direction and leadership brief.

## Success Criteria
- Keep the output under 150 words.
- State goals, top priority, top risk, and the next handoff.

### Execution Brief
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: execution-lead; groups: Execution

# Execution Brief

Turn the leadership brief into an execution plan with milestones and owners.

## Success Criteria
- Keep the output under 180 words.
- Include owner, milestone, dependency, and handoff target.
