---
name: Dev Team
type: organization
version: 1.0.0
category: technical
author: ClawMax Team
tags:
  - technical
  - engineering
  - software
  - devops
  - ci-cd
parameters:
  - agentId: engineer
    label: Number of Engineers
    default: 3
    min: 1
    max: 10
---

A multiagent software development team with engineering, QA, and DevOps roles. Automates PR review, CI triage, release preparation, and daily standups.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| tech-lead | Tech Lead | Technical leadership — sets architecture direction, reviews complex PRs, unblocks engineers, and manages technical debt priorities | lead, engineering, architecture | github, gh-issues |
| engineer | Software Engineer | Feature development — writes code, submits PRs, fixes bugs, writes tests, and participates in code review | engineering, development | github, gh-issues |
| qa-engineer | QA Engineer | Quality assurance — writes and runs test suites, performs regression testing, validates bug fixes, and tracks test coverage | engineering, qa, testing | github, gh-issues |
| devops | DevOps Engineer | Infrastructure & CI/CD — maintains build pipelines, monitors deployments, manages environments, and triages CI failures | engineering, devops, infrastructure | github, gh-issues |

## Communities

- **Dev Team** — All engineering team coordination and announcements

## Groups

- **Engineering** — Feature development, code review, and technical discussions (Dev Team)
- **QA** — Test plans, bug reports, and regression tracking (Dev Team)
- **DevOps** — CI/CD pipeline, deployments, and infrastructure (Dev Team)
- **Status** — Daily standups and sprint progress (Dev Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: tech-lead; tags: lead

# Dev Team Kickoff

You are the Tech Lead. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Repository:** [e.g., owner/repo — the codebase to work on]
- **Focus areas:** [e.g., bug fixes, new features, refactoring, test coverage]
- **Tech stack:** [e.g., TypeScript/React, Python/FastAPI, Go]
- **Priority issues:** [e.g., #42, #56 — specific issues to start with]
- **Branch strategy:** [e.g., feature branches off main, GitFlow]

## Your Tasks
1. Introduce yourself in the Dev Team community
2. Clone the repo and review the codebase architecture
3. Assign initial focus areas to each engineer
4. Set up coding standards and review expectations
5. Kick off the first PR review cycle and daily standup

### PR Review
- **Schedule:** 0 */2 * * *
- **Mode:** automated
- **Targets:** groups: Engineering

# PR Review Cycle

1. List all open PRs that need review
2. For each PR: check code quality, test coverage, and adherence to patterns
3. Leave specific, actionable review comments
4. Approve PRs that meet standards; request changes on others
5. Flag any PRs open longer than 48 hours for tech lead attention

### CI Triage
- **Schedule:** 0 * * * *
- **Mode:** automated
- **Targets:** agents: devops; groups: DevOps

# CI Triage

1. Check CI pipeline for any failed builds or tests
2. Categorize failures: flaky test, real regression, infrastructure issue
3. For real regressions: identify the breaking commit and notify the author
4. For flaky tests: log the pattern and create a fix ticket
5. Post CI health summary to DevOps group

### Release Prep
- **Schedule:** manual
- **Mode:** managed
- **Targets:** groups: Engineering, QA

# Release Preparation

1. QA engineer: run full regression suite and report results
2. Tech lead: review all PRs merged since last release
3. Compile changelog from commit messages and PR descriptions
4. DevOps: prepare release branch and version bump
5. Final sign-off from tech lead, then trigger deployment

### Daily Standup
- **Schedule:** 30 9 * * *
- **Mode:** automated
- **Targets:** groups: Status

# Daily Standup

1. Each team member: post in Status group with three items:
   - What you completed since last standup
   - What you plan to work on today
   - Any blockers or questions
2. Tech lead: review blockers and assign help if needed
3. DevOps: report on infrastructure health and pending deployments
4. QA: report on test status and any new bugs found
