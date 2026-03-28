---
name: Small Startup Team
type: organization
version: 1.1.3
author: ClawMax Team
tags:
  - business
  - startup
  - small-team
  - complete
  - development
  - devops
parameters:
  - agentId: engineer
    label: Number of Engineers
    default: 2
    min: 1
    max: 20
  - agentId: qa-engineer
    label: Number of QA Engineers
    default: 1
    min: 1
    max: 5
  - agentId: product-manager
    label: Number of Product Managers
    default: 1
    min: 1
    max: 5
agents:
  - id: ceo
    name: CEO
    role: Chief Executive Officer
    tags:
      - leadership
      - executive
    skills:
      - github
    communities:
      - Leadership
    groups:
      - All Hands
  - id: product-manager
    name: Product Manager
    role: Product Manager
    tags:
      - product
      - manager
    skills:
      - github
    communities:
      - Product & Design
      - Leadership
    groups:
      - All Hands
      - Status
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
      - All Hands
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
      - All Hands
      - Status
  - id: release-engineer
    name: Release Engineer
    role: Release Engineer
    tags:
      - engineer
      - release-manager
    skills:
      - github
    communities:
      - Engineering Team
    groups:
      - All Hands
      - Status
communities:
  - name: Leadership
    description: Executive leadership and strategy
    tags:
      - executive
    channels:
      - whatsapp
  - name: Engineering Team
    description: 'Software development, QA, and release management'
    tags:
      - engineering
    channels:
      - whatsapp
  - name: Product & Design
    description: Product management and design
    tags:
      - product
    channels:
      - whatsapp
groups:
  - name: All Hands
    description: Company-wide group for announcements and coordination
    tags:
      - company-wide
    channels:
      - whatsapp
  - name: Status
    description: Status updates and progress tracking
    tags:
      - status
      - updates
    channels:
      - whatsapp
workflows:
  - id: daily-standup
    name: Daily Standup
    description: 'Morning sync — each team member shares progress, plans, and blockers'
    schedule: 0 9 * * 1-5
    enabled: false
    executionMode: automated
    targeting:
      communities: []
      groups:
        - All Hands
      tags: []
      agents: []
    content: |-
      # Daily Standup

      Provide your standup update:

      ### 1. Yesterday
      - What did you complete?

      ### 2. Today
      - What are your top priorities?

      ### 3. Blockers
      - Anything blocking your work?

      Keep it concise (3-5 bullet points total).
  - id: status-check
    name: Status Check
    description: Periodic status pulse — agents report current state every 2 hours
    schedule: 0 */2 * * 1-5
    enabled: false
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Status
      tags: []
      agents: []
    content: |-
      # Status Check

      Provide a brief status pulse:

      1. **Current task**: What are you working on right now?
      2. **Progress**: On track or any delays?
      3. **Need help?**: Anything you need from the team?

      Keep it to 2-3 sentences.
  - id: issue-triage
    name: Issue Triage
    description: 'Review and prioritize new GitHub issues — label, assign, and request info'
    schedule: '0 9,14 * * 1-5'
    enabled: false
    executionMode: automated
    targeting:
      communities: []
      groups: []
      tags:
        - product
      agents: []
    content: >-
      # Issue Triage


      Review the GitHub repository for new and unresolved issues:


      ## Tasks

      1. **New issues** (last 24 hours): Add labels (bug/feature/docs/question),
      assign if obvious owner, request clarification if unclear

      2. **Unassigned issues**: Assign to appropriate team member based on
      expertise

      3. **Stale issues** (no activity 7+ days): Comment asking for update

      4. **Duplicate issues**: Mark as duplicate with link to original


      ## Output

      - Summary of issues triaged (new, assigned, stale, closed)

      - Any issues that need leadership attention

      - Post summary to Status group
  - id: pr-review
    name: PR Review
    description: 'Review open pull requests for code quality, tests, and style'
    schedule: '0 10,15 * * 1-5'
    enabled: false
    executionMode: automated
    targeting:
      communities: []
      groups: []
      tags:
        - qa
      agents: []
    content: |-
      # PR Review

      Review all open pull requests:

      ## Tasks
      1. Check for open PRs that need review
      2. For each PR:
         - Review code changes for correctness and quality
         - Verify tests pass and coverage is adequate
         - Check for TypeScript/lint errors
         - Look for security issues or breaking changes
         - Check dark mode styling if UI changes
      3. Provide feedback:
         - Approve if ready to merge
         - Request changes with specific, actionable feedback
         - Comment on areas that need improvement

      ## Output
      - GitHub review comment on each PR (approve or request changes)
      - Summary posted to Status group
  - id: coding
    name: Coding Sprint
    description: Engineers pick up assigned issues and create PRs with fixes/features
    schedule: 0 10 * * 1-5
    enabled: false
    executionMode: automated
    targeting:
      communities: []
      groups: []
      tags:
        - engineer
      agents: []
    content: >-
      # Coding Sprint


      Work on your assigned GitHub issues:


      ## Tasks

      1. Check your assigned issues (filter by your agent ID)

      2. For each assigned issue (prioritize by label: critical > bug >
      feature):
         - Read the issue description and any comments
         - Create a feature branch: `git checkout -b {issue-number}-{short-description}`
         - Implement the fix or feature
         - Write or update tests
         - Run the test suite to verify
         - Commit with clear message referencing the issue
         - Create a pull request with description of changes
      3. If blocked, comment on the issue explaining the blocker


      ## Output

      - PR link for each issue worked on

      - Status update posted to Status group

      - Comment on any issues where you're blocked
  - id: pr-merge
    name: PR Merge
    description: Merge approved PRs that pass CI — squash merge and clean up branches
    schedule: '0 11,16 * * 1-5'
    enabled: false
    executionMode: automated
    targeting:
      communities: []
      groups: []
      tags:
        - release-manager
      agents: []
    content: |-
      # PR Merge

      Merge approved pull requests:

      ## Tasks
      1. List all open PRs with approved reviews
      2. For each approved PR:
         - Verify CI/CD checks pass (all green)
         - Verify no merge conflicts
         - Check PR is not labeled 'do-not-merge' or 'wip'
         - Squash merge into main branch
         - Delete the feature branch
         - Comment on PR confirming merge
         - Close related issue(s) if PR description references them
      3. If conflicts exist, notify the PR author

      ## Output
      - List of merged PRs
      - List of PRs with issues (conflicts, failed CI)
      - Summary posted to Status group
  - id: release
    name: Release
    description: 'Prepare and publish a release — version bump, changelog, tag, and deploy'
    schedule: manual
    enabled: true
    executionMode: managed
    owner: product-manager
    targeting:
      communities: []
      groups: []
      tags:
        - release-manager
      agents: []
    content: >-
      # Release Preparation


      Prepare and publish a new release:


      ## Pre-Release Checklist

      1. **Code freeze**: Verify all planned features are merged

      2. **CI/CD**: All tests passing on main branch

      3. **Open issues**: No critical/blocker issues open

      4. **Documentation**: README and CHANGELOG updated


      ## Release Tasks

      1. Review all PRs merged since last release

      2. Update CHANGELOG.md with categorized changes (features, fixes,
      breaking)

      3. Bump version in package.json (semver: patch/minor/major)

      4. Create git tag (e.g., v1.2.0)

      5. Push tag to trigger release workflow

      6. Create GitHub release with release notes

      7. Verify release artifacts are published


      ## Output

      - Updated CHANGELOG.md

      - New version tag pushed

      - GitHub release created

      - Summary posted to All Hands group
category: business
---
A complete startup team with CEO, product manager, engineers, QA, and release engineer. Includes 7 workflows covering the full development lifecycle: standups, status checks, issue triage, PR review, coding, merging, and releases.
