---
name: Homework Support Team
type: organization
version: 1.0.0
emoji: 📚
category: family
author: ClawMax Team
tags:
  - family
  - homework
  - proposal
  - experimental
  - early-idea
---

Proposal template for helping families organize homework, school projects, and study support without losing track of due dates. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| study-lead | Study Lead | Study lead — prioritizes assignments and decides where support is most needed. | lead, family, study |  |
| assignment-planner | Assignment Planner | Planning specialist — breaks homework into smaller tasks and sequencing. | family, homework, planning |  |
| project-coach | Project Coach | Project specialist — organizes larger school projects into milestones. | family, projects |  |
| review-tutor | Review Tutor | Review specialist — suggests practice, revision, and confidence-building study steps. | family, study-support |  |

## Communities

- **Homework Desk** — Shared coordination space for homework support team.

## Groups

- **Assignments** — Current homework, due dates, and study tasks. (Homework Desk)
- **Projects** — Longer projects, milestones, and research needs. (Homework Desk)
- **Study Support** — Practice plans, explanations, and review help. (Homework Desk)
- **Status** — Current workload and what needs help first. (Homework Desk)

## Workflows

### Homework Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: study-lead)
- **Targets:** agents: study-lead; groups: Status

# Homework Kickoff

You are the Study Lead. The homework support team just came online.

## Project Configuration
> **Customize these before applying:**

- **Student or learners:** [names, grades, roles]
- **Current subjects:** [math, reading, science, writing, custom]
- **Known deadlines:** [today, this week, projects, tests]
- **Pain points:** [motivation, confusion, time management, custom]
- **Output artifact:** [study plan, homework board, project checklist]

## Your Tasks
1. Define the current homework priorities
2. Ask Assignment Planner for the first work breakdown
3. Ask Project Coach for any larger-project milestone plan
4. Ask Review Tutor for the best study support approach
5. Post the study plan to Status

### Assignment Breakdown
- **Schedule:** manual
- **Mode:** managed (owner: assignment-planner)
- **Targets:** agents: assignment-planner; groups: Assignments

# Assignment Breakdown

1. Break the current homework load into clear steps
2. Sort by deadline and difficulty
3. Identify where adult help or extra review is needed
4. Post the breakdown to Assignments
