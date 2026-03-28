---
name: HR Team
type: organization
version: 1.0.0
category: business
author: ClawMax Team
tags:
  - business
  - hr
  - recruiting
  - onboarding
  - people
parameters:
  - agentId: recruiter
    label: Number of Recruiters
    default: 2
    min: 1
    max: 6
---

A multiagent HR organization handling recruiting, onboarding, and people operations. Automates candidate screening, interview scheduling, and new hire onboarding workflows.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| hr-lead | HR Lead | Head of People — oversees recruiting pipeline, approves offers, manages team policies and culture initiatives | lead, hr, management | github, gh-issues |
| recruiter | Recruiter | Talent acquisition — sources candidates, screens resumes, conducts initial interviews, and manages candidate pipeline | hr, recruiting |  |
| people-ops | People Operations | HR operations — maintains employee records, handles benefits questions, tracks PTO, and manages compliance documentation | hr, ops, compliance |  |
| onboarding-specialist | Onboarding Specialist | New hire experience — creates onboarding plans, schedules orientation sessions, tracks 30/60/90 day milestones | hr, onboarding |  |

## Communities

- **HR Team** — All HR team coordination and announcements

## Groups

- **Recruiting** — Candidate pipeline, job postings, and interview coordination (HR Team)
- **Onboarding** — New hire onboarding plans and progress tracking (HR Team)
- **People Ops** — Employee records, benefits, policies, and compliance (HR Team)
- **Status** — Daily standups and team health (HR Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: hr-lead; tags: lead

# HR Team Kickoff

You are the HR Lead. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Company:** [e.g., Acme Corp — Series B startup, 85 employees]
- **Open roles:** [e.g., 3 engineers, 1 designer, 1 PM]
- **Hiring priorities:** [e.g., senior backend engineer by April]
- **ATS/tools:** [e.g., Lever, Greenhouse, GitHub issues]

## Your Tasks
1. Introduce yourself in the HR Team community
2. Review the workspace for existing job descriptions or candidate data
3. Assign focus areas to each recruiter
4. Brief the onboarding specialist on any pending new hires
5. Post initial priorities to the Status group

### Job Posting Review
- **Schedule:** 0 9 * * *
- **Mode:** automated
- **Targets:** groups: Recruiting

# Daily Job Posting Review

1. Recruiters: check application volume for each open role
2. Flag postings with low application rates — suggest description improvements
3. Review any new applications received since yesterday
4. HR lead: approve or adjust job posting priorities
5. Update recruiting pipeline metrics in Status group

### Candidate Screening
- **Schedule:** 0 */2 * * *
- **Mode:** automated
- **Targets:** groups: Recruiting

# Candidate Screening Cycle

1. Pull new applications since last screening cycle
2. Score each candidate against role requirements (experience, skills, culture fit)
3. For strong matches: draft personalized outreach and schedule initial screen
4. For borderline candidates: flag for HR lead review
5. Update candidate status and log screening notes

### Onboarding Checklist
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: onboarding-specialist; groups: Onboarding

# New Hire Onboarding

1. Create personalized onboarding plan with 30/60/90 day milestones
2. Schedule orientation sessions (team intros, tools setup, culture overview)
3. Set up access to required systems and documentation
4. Assign an onboarding buddy from the relevant team
5. Schedule check-ins at day 7, 30, 60, and 90 — track progress in Onboarding group
