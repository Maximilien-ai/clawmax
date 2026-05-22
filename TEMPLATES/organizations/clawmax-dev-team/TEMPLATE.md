---
name: ClawMax Dev Team
type: organization
version: 1.0.0
category: technical
author: ClawMax Team
tags:
  - dev-team
  - self-management
  - github
  - ci-cd
---

Self-managing development team for ClawMax. Agents triage issues, review PRs, run tests, and prepare releases. Pre-configured for the ClawMax repo with sensible defaults.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| dev-lead | Dev Lead | Development lead — coordinates the team, reviews architecture decisions, approves PRs, manages releases. | lead, dev, architecture | github, gh-issues, workspace-ls |
| qa-engineer | QA Engineer | Quality assurance — runs test suites, reports failures, verifies fixes, maintains test coverage. | qa, testing | github, gh-issues, workspace-ls |
| github-triage | GitHub Triage | Issue and PR triage — labels new issues, assigns priority, and routes work to the right team member. | triage, github, issues | github, gh-issues, workspace-ls |
| release-engineer | Release Engineer | Release management — prepares changelogs, tags releases, verifies builds, and updates version numbers. | release, ci-cd, deploy | github, gh-issues, workspace-ls |

## Communities

- **Dev Team** — ClawMax development team coordination.

## Groups

- **Dev Status** — Daily standups and status updates (Dev Team)
- **Code Review** — PR reviews and code discussions (Dev Team)
- **Testing** — Test results, coverage reports, and QA updates (Dev Team)
- **Triage** — Issue triage, bug reports, and feature requests (Dev Team)
- **Release** — Release planning, changelogs, and deployment (Dev Team)

## Workflows

### Dev Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: dev-lead, qa-engineer, github-triage, release-engineer

# Dev Team Kickoff

You are the Dev Lead. Your team just came online.

## Project Configuration
- **GitHub repo:** [owner/repo-name]
- **Main branch:** [main]
- **Test command:** [./SYSTEM/test.sh]
- **Release prefix:** [v]

### Issue Triage
- **Schedule:** 0 9 * * *
- **Mode:** automated
- **Targets:** agents: github-triage; groups: Triage

# Daily Issue Triage

Check the repository for new issues, apply labels and priorities, and post a triage summary.
