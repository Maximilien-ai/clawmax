---
name: Small Startup Team
type: organization
version: 1.1.3
category: business
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
---

A complete startup team with CEO, product manager, engineers, QA, and release engineer. Includes 7 workflows covering the full development lifecycle: standups, status checks, issue triage, PR review, coding, merging, and releases.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| ceo | CEO | Chief Executive Officer | leadership, executive | github |
| product-manager | Product Manager | Product Manager | product, manager | github |
| engineer | Engineer | Software Engineer | engineer, developer | github |
| qa-engineer | QA Engineer | Quality Assurance Engineer | engineer, qa, quality | github |
| release-engineer | Release Engineer | Release Engineer | engineer, release-manager | github |

## Communities

- **Leadership** — Executive leadership and strategy
- **Engineering Team** — Software development, QA, and release management
- **Product & Design** — Product management and design

## Groups

- **All Hands** — Company-wide group for announcements and coordination
- **Status** — Status updates and progress tracking

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: ceo, product-manager, engineer, qa-engineer, release-engineer

# Startup Team Kickoff

Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Company:** [e.g., Acme Corp — early stage startup]
- **Product:** [e.g., SaaS platform for X]
- **Priorities:** [e.g., MVP launch, fundraising, hiring]
- **GitHub repo:** [e.g., owner/repo — for coordination and tracking]

## Your Tasks
1. Introduce yourself in the team community
2. Review workspace and existing work
3. Assign roles and priorities
4. Set up communication channels
5. Kick off first sprint

### Daily Standup
- **Schedule:** 0 9 * * 1-5
- **Mode:** automated
- **Targets:** groups: All Hands

# Daily Standup

Provide your standup update:

### 1. Yesterday
- What did you complete?

### 2. Today
- What are your top priorities?

### 3. Blockers
- Anything blocking your work?

Keep it concise (3-5 bullet points total).

### Status Check
- **Schedule:** 0 */2 * * 1-5
- **Mode:** automated
- **Targets:** groups: Status

# Status Check

Provide a brief status pulse:

1. **Current task**: What are you working on right now?
2. **Progress**: On track or any delays?
3. **Need help?**: Anything you need from the team?

Keep it to 2-3 sentences.

### Issue Triage
- **Schedule:** 0 9,14 * * 1-5
- **Mode:** automated
- **Targets:** tags: product

# Issue Triage

Review the GitHub repository for new and unresolved issues:

## Tasks
1. **New issues** (last 24 hours): Add labels (bug/feature/docs/question), assign if obvious owner, request clarification if unclear
2. **Unassigned issues**: Assign to appropriate team member based on expertise
3. **Stale issues** (no activity 7+ days): Comment asking for update
4. **Duplicate issues**: Mark as duplicate with link to original

## Output
- Summary of issues triaged (new, assigned, stale, closed)
- Any issues that need leadership attention
- Post summary to Status group

### PR Review
- **Schedule:** 0 10,15 * * 1-5
- **Mode:** automated
- **Targets:** tags: qa

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

### Coding Sprint
- **Schedule:** 0 10 * * 1-5
- **Mode:** automated
- **Targets:** tags: engineer

# Coding Sprint

Work on your assigned GitHub issues:

## Tasks
1. Check your assigned issues (filter by your agent ID)
2. For each assigned issue (prioritize by label: critical > bug > feature):
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

### PR Merge
- **Schedule:** 0 11,16 * * 1-5
- **Mode:** automated
- **Targets:** tags: release-manager

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

### Release
- **Schedule:** manual
- **Mode:** managed (owner: product-manager)
- **Targets:** tags: release-manager

# Release Preparation

Prepare and publish a new release:

## Pre-Release Checklist
1. **Code freeze**: Verify all planned features are merged
2. **CI/CD**: All tests passing on main branch
3. **Open issues**: No critical/blocker issues open
4. **Documentation**: README and CHANGELOG updated

## Release Tasks
1. Review all PRs merged since last release
2. Update CHANGELOG.md with categorized changes (features, fixes, breaking)
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
