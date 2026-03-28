---
name: Dev Team
type: organization
version: 1.0.0
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
agents:
  - id: tech-lead
    name: Tech Lead
    role: >-
      Technical leadership — sets architecture direction, reviews complex PRs,
      unblocks engineers, and manages technical debt priorities
    tags:
      - lead
      - engineering
      - architecture
    skills:
      - github
      - gh-issues
    communities:
      - Dev Team
    groups:
      - Engineering
      - DevOps
      - Status
  - id: engineer
    name: Software Engineer
    role: >-
      Feature development — writes code, submits PRs, fixes bugs, writes tests,
      and participates in code review
    tags:
      - engineering
      - development
    skills:
      - github
      - gh-issues
    communities:
      - Dev Team
    groups:
      - Engineering
  - id: qa-engineer
    name: QA Engineer
    role: >-
      Quality assurance — writes and runs test suites, performs regression
      testing, validates bug fixes, and tracks test coverage
    tags:
      - engineering
      - qa
      - testing
    skills:
      - github
      - gh-issues
    communities:
      - Dev Team
    groups:
      - QA
      - Engineering
  - id: devops
    name: DevOps Engineer
    role: >-
      Infrastructure & CI/CD — maintains build pipelines, monitors deployments,
      manages environments, and triages CI failures
    tags:
      - engineering
      - devops
      - infrastructure
    skills:
      - github
      - gh-issues
    communities:
      - Dev Team
    groups:
      - DevOps
      - Status
communities:
  - name: Dev Team
    description: All engineering team coordination and announcements
groups:
  - name: Engineering
    description: 'Feature development, code review, and technical discussions'
    community: Dev Team
  - name: QA
    description: 'Test plans, bug reports, and regression tracking'
    community: Dev Team
  - name: DevOps
    description: 'CI/CD pipeline, deployments, and infrastructure'
    community: Dev Team
  - name: Status
    description: Daily standups and sprint progress
    community: Dev Team
workflows:
  - id: kickoff
    name: Team Kickoff
    description: Initialize the dev team and assess the codebase
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - tech-lead
    content: >-
      # Dev Team Kickoff


      You are the Tech Lead. Your team just came online.


      ## Project Configuration

      > **Customize these before applying:**


      - **Repository:** [e.g., owner/repo — the codebase to work on]

      - **Focus areas:** [e.g., bug fixes, new features, refactoring, test
      coverage]

      - **Tech stack:** [e.g., TypeScript/React, Python/FastAPI, Go]

      - **Priority issues:** [e.g., #42, #56 — specific issues to start with]

      - **Branch strategy:** [e.g., feature branches off main, GitFlow]


      ## Your Tasks

      1. Introduce yourself in the Dev Team community

      2. Clone the repo and review the codebase architecture

      3. Assign initial focus areas to each engineer

      4. Set up coding standards and review expectations

      5. Kick off the first PR review cycle and daily standup
  - id: pr-review
    name: PR Review
    description: Review open pull requests and provide feedback
    schedule: 0 */2 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Engineering
      tags: []
      agents: []
    content: >-
      # PR Review Cycle


      1. List all open PRs that need review

      2. For each PR: check code quality, test coverage, and adherence to
      patterns

      3. Leave specific, actionable review comments

      4. Approve PRs that meet standards; request changes on others

      5. Flag any PRs open longer than 48 hours for tech lead attention
  - id: ci-triage
    name: CI Triage
    description: Monitor and triage CI/CD pipeline failures
    schedule: 0 * * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - DevOps
      tags: []
      agents:
        - devops
    content: >-
      # CI Triage


      1. Check CI pipeline for any failed builds or tests

      2. Categorize failures: flaky test, real regression, infrastructure issue

      3. For real regressions: identify the breaking commit and notify the
      author

      4. For flaky tests: log the pattern and create a fix ticket

      5. Post CI health summary to DevOps group
  - id: release-prep
    name: Release Prep
    description: 'Prepare a release: changelog, version bump, final QA'
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Engineering
        - QA
      tags: []
      agents: []
    content: |-
      # Release Preparation

      1. QA engineer: run full regression suite and report results
      2. Tech lead: review all PRs merged since last release
      3. Compile changelog from commit messages and PR descriptions
      4. DevOps: prepare release branch and version bump
      5. Final sign-off from tech lead, then trigger deployment
  - id: daily-standup
    name: Daily Standup
    description: 'Async daily standup — what was done, what''s planned, blockers'
    schedule: 30 9 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Status
      tags: []
      agents: []
    content: |-
      # Daily Standup

      1. Each team member: post in Status group with three items:
         - What you completed since last standup
         - What you plan to work on today
         - Any blockers or questions
      2. Tech lead: review blockers and assign help if needed
      3. DevOps: report on infrastructure health and pending deployments
      4. QA: report on test status and any new bugs found
category: technical
---
A multiagent software development team with engineering, QA, and DevOps roles. Automates PR review, CI triage, release preparation, and daily standups.
