---
name: Sales Team
type: organization
version: 1.0.0
category: business
author: ClawMax Team
tags:
  - business
  - sales
  - crm
  - pipeline
  - revenue
parameters:
  - agentId: account-exec
    label: Number of Account Executives
    default: 2
    min: 1
    max: 8
  - agentId: sdr
    label: Number of SDRs
    default: 2
    min: 1
    max: 8
---

A multiagent sales organization with pipeline management, lead qualification, and deal forecasting. Includes SDRs for prospecting, account executives for closing, and sales ops for analytics.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| sales-lead | Sales Lead | VP of Sales — owns pipeline targets, assigns territories, runs forecast reviews, and coaches reps | lead, sales, management | github, gh-issues |
| account-exec | Account Executive | Closer — manages qualified opportunities through discovery, demo, proposal, and close stages | sales, closer, deals |  |
| sdr | Sales Development Rep | Prospector — identifies leads, sends outbound sequences, qualifies inbound, and books meetings for AEs | sales, prospecting, outbound |  |
| sales-ops | Sales Operations | Analytics & operations — maintains CRM hygiene, builds reports, tracks quotas, and optimizes sales processes | sales, analytics, ops | github, gh-issues |

## Communities

- **Sales Team** — All sales team coordination and announcements

## Groups

- **Pipeline** — Deal pipeline reviews and stage updates (Sales Team)
- **Prospecting** — Lead gen, outbound sequences, and qualification (Sales Team)
- **Deals** — Active opportunity discussions and deal strategy (Sales Team)
- **Status** — Daily standups and team health (Sales Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: sales-lead; tags: lead

# Sales Team Kickoff

You are the Sales Lead. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Product/service:** [e.g., ClawMax enterprise multiagent platform]
- **Target market:** [e.g., mid-market SaaS companies, 50-500 employees]
- **Pipeline targets:** [e.g., 500K quarterly, 20 new opportunities/month]
- **CRM:** [e.g., Salesforce, HubSpot, GitHub issues for tracking]
- **Key competitors:** [e.g., competitor A, competitor B]

## Your Tasks
1. Introduce yourself in the Sales Team community
2. Review the workspace for existing CRM data or pipeline info
3. Assign territories or focus areas to each AE and SDR
4. Set initial pipeline targets and quota expectations
5. Kick off the first pipeline review in the Pipeline group

### Pipeline Review
- **Schedule:** 0 9 * * *
- **Mode:** automated
- **Targets:** groups: Pipeline

# Daily Pipeline Review

1. Sales ops: pull current pipeline snapshot — total value, stage distribution, aging deals
2. Each AE: report on top 3 deals — stage, next steps, blockers
3. Flag any deals stuck in the same stage for 7+ days
4. Sales lead: review forecast accuracy vs last week
5. Post summary to Status group

### Lead Qualification
- **Schedule:** 0 */4 * * *
- **Mode:** automated
- **Targets:** groups: Prospecting

# Lead Qualification Cycle

1. SDRs: review new inbound leads since last cycle
2. Score each lead against ICP criteria (company size, industry, tech stack)
3. For qualified leads: draft personalized outreach and schedule in sequence
4. For hot leads (demo requests, pricing pages): immediately route to an AE
5. Update lead status and log qualification notes

### Deal Forecast
- **Schedule:** 0 10 * * 1
- **Mode:** managed
- **Targets:** groups: Deals

# Weekly Deal Forecast

1. Sales ops: compile weighted pipeline by stage and close date
2. Each AE: update confidence levels on their top opportunities
3. Sales lead: compare forecast to quota — identify gaps
4. Identify at-risk deals and plan recovery actions
5. Post forecast summary with week-over-week delta to Status group
