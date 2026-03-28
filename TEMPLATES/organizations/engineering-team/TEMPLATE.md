---
name: Engineering Team
type: organization
version: 1.1.0
author: ClawMax Team
tags:
  - technical
  - engineering
  - software
  - development
parameters:
  - agentId: engineer
    label: Number of Engineers
    default: 2
    min: 1
    max: 20
agents:
  - id: engineer
    name: Engineer
    role: Software Engineer
    tags:
      - engineer
      - developer
    skills:
      - github
    communities:
      - Engineering Team
    groups:
      - Code Review
      - Status
  - id: qa-engineer
    name: QA Engineer
    role: Quality Assurance Engineer
    tags:
      - engineer
      - qa
      - quality
    skills:
      - github
    communities:
      - Engineering Team
    groups:
      - Code Review
      - Status
  - id: release-engineer
    name: Release Engineer
    role: Release Engineer
    tags:
      - engineer
      - release-manager
      - github
    skills:
      - github
    communities:
      - Engineering Team
    groups:
      - Release Team
      - Status
communities:
  - name: Engineering Team
    description: 'Software development, QA, and release management'
    tags:
      - engineering
      - development
    channels:
      - whatsapp
groups:
  - name: Code Review
    description: Engineers reviewing code and PRs
    tags:
      - code-review
    community: Engineering Team
    channels:
      - whatsapp
  - name: Release Team
    description: Production release coordination
    tags:
      - release
      - production
    community: Engineering Team
    channels:
      - whatsapp
  - name: Status
    description: Status updates and progress tracking
    tags:
      - status
      - updates
    community: Engineering Team
    channels:
      - whatsapp
workflows:
  - id: daily-standup
    name: Daily Standup
    description: Engineering team daily sync
    schedule: 0 9 * * 1-5
    enabled: false
    executionMode: automated
    targeting:
      communities:
        - Engineering Team
      groups: []
      tags: []
      agents: []
    content: |-
      # Engineering Daily Standup

      Provide your update:

      ### Yesterday
      - Code completed or PRs merged

      ### Today
      - Tasks in progress

      ### Blockers
      - Anything blocking your work?
  - id: code-review-reminder
    name: Code Review Reminder
    description: Reminder to review pending PRs
    schedule: '0 10,14 * * 1-5'
    enabled: false
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Code Review
      tags: []
      agents: []
    content: |-
      # Code Review Reminder

      Please review pending pull requests:

      1. Check your assigned PRs
      2. Prioritize PRs blocking others
      3. Provide constructive feedback
      4. Approve or request changes
  - id: pr-review
    name: PR Review
    description: Review open pull requests for code quality and test coverage
    schedule: manual
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups: []
      tags:
        - qa
      agents: []
    content: |-
      # PR Review Workflow

      ## Tasks
      1. Check for open pull requests on the repository
      2. Review code changes for quality and correctness
      3. Verify tests pass and coverage is adequate
      4. Check for TypeScript errors and style issues
      5. Provide feedback or approve the PR

      ## Output
      - GitHub review comment (approve or request changes)
      - Test results summary
  - id: release-preparation
    name: Release Preparation
    description: Pre-release checklist and coordination
    schedule: 0 9 * * 3
    enabled: false
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Release Team
      tags: []
      agents: []
    content: |-
      # Release Preparation Checklist

      ## Pre-Release Tasks

      1. **Code Freeze**: Are all features merged?
      2. **Testing**: QA sign-off complete?
      3. **Documentation**: Release notes updated?
      4. **Infrastructure**: Deployment plan ready?
      5. **Rollback**: Rollback plan documented?

      Provide status on each item.
category: technical
---
A complete engineering team with 2 engineers, QA engineer, and release engineer. Includes daily standups, code review reminders, and release preparation workflows.
