---
name: Household Bills Desk
type: organization
version: 1.0.0
emoji: 💸
category: family
author: ClawMax Team
tags:
  - family
  - bills
  - proposal
  - experimental
  - early-idea
---

Proposal template for tracking recurring bills, payment reminders, and household admin follow-through. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| admin-lead | Admin Lead | Household admin lead — defines which bills and admin tasks matter most right now. | lead, family, admin |  |
| bill-tracker | Bill Tracker | Tracking specialist — keeps due dates, categories, and payment status visible. | family, bills |  |
| paperwork-coordinator | Paperwork Coordinator | Admin specialist — tracks forms, account updates, and household paperwork. | family, paperwork |  |
| review-analyst | Review Analyst | Review specialist — checks for missed items, duplicates, and follow-up needs. | family, review |  |

## Communities

- **Bills Desk** — Shared coordination space for household bills desk.

## Groups

- **Bills** — Recurring bills, due dates, and payment tracking. (Bills Desk)
- **Admin** — Account changes, paperwork, and household admin tasks. (Bills Desk)
- **Review** — Monthly review, exceptions, and cleanup. (Bills Desk)
- **Status** — Current deadlines and admin priorities. (Bills Desk)

## Workflows

### Bills Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: admin-lead)
- **Targets:** agents: admin-lead; groups: Status

# Bills Kickoff

You are the Admin Lead. The household bills desk just came online.

## Project Configuration
> **Customize these before applying:**

- **Recurring bills in scope:** [rent, utilities, subscriptions, school, insurance, custom]
- **Review window:** [this week, this month, custom]
- **Pain points:** [late fees, missed renewals, unclear ownership, custom]
- **Output artifact:** [bill calendar, admin checklist, monthly review]

## Your Tasks
1. Define the current admin and payment scope
2. Ask Bill Tracker for the upcoming due-date view
3. Ask Paperwork Coordinator for any open admin items
4. Ask Review Analyst for missed-risk checks
5. Post the current household admin plan to Status

### Monthly Admin Review
- **Schedule:** manual
- **Mode:** managed (owner: review-analyst)
- **Targets:** agents: review-analyst, bill-tracker; groups: Review, Bills

# Monthly Admin Review

1. Review the current bill list and status
2. Identify anything overdue, unclear, or duplicated
3. Suggest the next cleanup or reminder actions
4. Post the review summary to Review
