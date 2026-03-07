---
id: code-review-reminder
name: Code Review Reminder
description: Remind engineers to review open pull requests
schedule: "0 10,14 * * 1-5"
enabled: false
targeting:
  communities:
    - Engineering Team
  groups: []
  tags:
    - engineer
  agents: []
executionMode: automated
author: system
---

# Code Review Reminder

## Objective
Check for open pull requests requiring review and prioritize code review tasks.

## Instructions

### 1. Check Open PRs
- Review the GitHub repository for open pull requests
- Identify PRs that need your review (assigned or relevant to your expertise)
- Note PRs that have been open for >2 days

### 2. Priority Assessment
For each PR requiring your attention:
- **Urgency**: Is this blocking someone?
- **Complexity**: How long will the review take?
- **Context**: Do you have the necessary context?

### 3. Action Plan
- **Today**: Which PRs will you review today?
- **This Week**: Which PRs will you review by end of week?
- **Delegate**: Should any reviews be reassigned?

### 4. Blockers
- Are you blocked on understanding the code?
- Do you need to sync with the author first?

## Output Format
Provide a brief list of PRs you'll review today with estimated time for each.
