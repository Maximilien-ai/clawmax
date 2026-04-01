---
name: Family Ops Hub
type: organization
version: 1.0.0
emoji: 🏡
category: family
author: ClawMax Team
tags:
  - family
  - proposal
  - experimental
  - early-idea
---

Proposal template for coordinating family schedules, chores, errands, and household priorities. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| family-lead | Family Lead | Operations lead — defines what matters most for the household this week and keeps the whole system coordinated. | lead, family |  |
| schedule-coordinator | Schedule Coordinator | Scheduling specialist — tracks family events, conflicts, and transport windows. | family, calendar |  |
| home-ops-coordinator | Home Ops Coordinator | Household specialist — organizes chores, supplies, and recurring home tasks. | family, household |  |
| kids-support-coordinator | Kids Support Coordinator | Kids support specialist — tracks school, activities, and support needs. | family, kids |  |

## Communities

- **Family Ops** — Shared coordination space for family ops hub.

## Groups

- **Schedules** — Family calendar, pickups, appointments, and conflicts. (Family Ops)
- **Home** — Cleaning, chores, errands, and household tasks. (Family Ops)
- **Kids** — School, activities, homework, and family logistics. (Family Ops)
- **Status** — Current priorities and what needs attention this week. (Family Ops)

## Workflows

### Family Week Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: family-lead)
- **Targets:** agents: family-lead; groups: Status

# Family Week Kickoff

You are the Family Lead. The family ops hub just came online.

## Project Configuration
> **Customize these before applying:**

- **This week’s priorities:** [school, appointments, travel, chores, bills, custom]
- **Key family members or roles:** [names or roles]
- **Known stress points:** [time crunches, missing supplies, overloaded days, custom]
- **Output artifact:** [weekly plan, chore board, family brief]

## Your Tasks
1. Define the top family priorities for the week
2. Ask Schedule Coordinator for the first schedule risk review
3. Ask Home Ops Coordinator for the top household tasks
4. Ask Kids Support Coordinator for school/activity needs
5. Post the current family ops plan to Status

### Household Reset
- **Schedule:** manual
- **Mode:** managed (owner: home-ops-coordinator)
- **Targets:** agents: home-ops-coordinator; groups: Home

# Household Reset

1. Review the current state of chores, supplies, and household tasks
2. Group tasks into must-do, nice-to-have, and delegate
3. Suggest a practical sequence for the next reset
4. Post the reset plan to Home
