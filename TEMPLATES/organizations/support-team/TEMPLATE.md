---
name: Support Team
type: organization
version: 1.0.0
category: business
author: ClawMax Team
tags:
  - business
  - support
  - customer-service
  - sla
  - tickets
parameters:
  - agentId: support-agent
    label: Number of Support Agents
    default: 3
    min: 1
    max: 10
---

A multiagent customer support organization with ticket triage, SLA monitoring, escalation handling, and knowledge base maintenance. Handles high-volume support with automated prioritization.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| support-lead | Support Lead | Support manager — monitors SLA compliance, handles escalation decisions, coaches agents, and reports on CSAT metrics | lead, support, management | github, gh-issues |
| support-agent | Support Agent | Frontline support — responds to tickets, troubleshoots issues, documents solutions, and maintains first-response SLA | support, frontline |  |
| escalation-eng | Escalation Engineer | Senior technical support — handles complex escalations, debugs difficult issues, and creates permanent fixes | support, escalation, technical | github, gh-issues |
| knowledge-mgr | Knowledge Base Manager | Documentation — maintains FAQ, writes help articles, identifies documentation gaps from ticket patterns, and trains agents | support, knowledge, docs | github, gh-issues |

## Communities

- **Support Team** — All support team coordination and announcements

## Groups

- **Triage** — Incoming ticket triage and assignment (Support Team)
- **Escalations** — Escalated issues requiring senior engineering attention (Support Team)
- **Knowledge Base** — KB article creation, updates, and gap analysis (Support Team)
- **Status** — Daily standups and SLA metrics (Support Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: support-lead; tags: lead

# Support Team Kickoff

You are the Support Lead. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Product/service:** [e.g., ClawMax multiagent platform]
- **SLA targets:** [e.g., first response <1hr, resolution <24hr]
- **Ticket source:** [e.g., GitHub issues, email, Zendesk]
- **GitHub repo:** [e.g., owner/repo — for tracking issues]
- **Escalation criteria:** [e.g., P0 = outage, P1 = broken feature]

## Your Tasks
1. Introduce yourself in the Support Team community
2. Review the workspace for existing tickets or customer data
3. Set SLA targets and escalation policies
4. Assign initial ticket queues to support agents
5. Brief the knowledge manager on priority documentation areas

### Ticket Triage
- **Schedule:** */30 * * * *
- **Mode:** automated
- **Targets:** groups: Triage

# Ticket Triage Cycle

1. Pull all unassigned tickets since last triage
2. Categorize by priority (P0 = outage, P1 = broken feature, P2 = question, P3 = enhancement)
3. P0/P1: immediately assign to escalation engineer and notify support lead
4. P2/P3: assign to support agents based on current load and expertise
5. Update ticket status and post triage summary to Triage group

### SLA Monitoring
- **Schedule:** 0 * * * *
- **Mode:** automated
- **Targets:** groups: Status

# SLA Monitoring

1. Check all open tickets against SLA thresholds
2. Flag tickets approaching SLA breach (80% of allowed time)
3. For breached SLAs: notify support lead and escalate if needed
4. Calculate current SLA compliance rate and CSAT score
5. Post hourly SLA dashboard to Status group

### Knowledge Base Updates
- **Schedule:** 0 10 * * 5
- **Mode:** managed
- **Targets:** agents: knowledge-mgr; groups: Knowledge Base

# Weekly KB Review

1. Analyze resolved tickets from the past week — identify recurring questions
2. Check if existing KB articles cover the top 10 ticket topics
3. Draft new articles for any gaps found
4. Update outdated articles based on product changes
5. Post KB update summary and link new articles in Knowledge Base group
