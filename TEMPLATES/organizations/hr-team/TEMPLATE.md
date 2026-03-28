---
name: HR Team
type: organization
version: 1.0.0
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
agents:
  - id: hr-lead
    name: HR Lead
    role: >-
      Head of People — oversees recruiting pipeline, approves offers, manages
      team policies and culture initiatives
    tags:
      - lead
      - hr
      - management
    communities:
      - HR Team
    groups:
      - Recruiting
      - People Ops
      - Status
    skills:
      - github
      - gh-issues
  - id: recruiter
    name: Recruiter
    role: >-
      Talent acquisition — sources candidates, screens resumes, conducts initial
      interviews, and manages candidate pipeline
    tags:
      - hr
      - recruiting
    communities:
      - HR Team
    groups:
      - Recruiting
  - id: people-ops
    name: People Operations
    role: >-
      HR operations — maintains employee records, handles benefits questions,
      tracks PTO, and manages compliance documentation
    tags:
      - hr
      - ops
      - compliance
    communities:
      - HR Team
    groups:
      - People Ops
      - Status
  - id: onboarding-specialist
    name: Onboarding Specialist
    role: >-
      New hire experience — creates onboarding plans, schedules orientation
      sessions, tracks 30/60/90 day milestones
    tags:
      - hr
      - onboarding
    communities:
      - HR Team
    groups:
      - Onboarding
      - Status
communities:
  - name: HR Team
    description: All HR team coordination and announcements
groups:
  - name: Recruiting
    description: 'Candidate pipeline, job postings, and interview coordination'
    community: HR Team
  - name: Onboarding
    description: New hire onboarding plans and progress tracking
    community: HR Team
  - name: People Ops
    description: 'Employee records, benefits, policies, and compliance'
    community: HR Team
  - name: Status
    description: Daily standups and team health
    community: HR Team
workflows:
  - id: kickoff
    name: Team Kickoff
    description: Initialize the HR team and assess open roles
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - hr-lead
    content: |-
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
  - id: job-posting-review
    name: Job Posting Review
    description: Daily review of active job postings and application volume
    schedule: 0 9 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Recruiting
      tags: []
      agents: []
    content: >-
      # Daily Job Posting Review


      1. Recruiters: check application volume for each open role

      2. Flag postings with low application rates — suggest description
      improvements

      3. Review any new applications received since yesterday

      4. HR lead: approve or adjust job posting priorities

      5. Update recruiting pipeline metrics in Status group
  - id: candidate-screening
    name: Candidate Screening
    description: Screen and qualify new applicants
    schedule: 0 */2 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Recruiting
      tags: []
      agents: []
    content: >-
      # Candidate Screening Cycle


      1. Pull new applications since last screening cycle

      2. Score each candidate against role requirements (experience, skills,
      culture fit)

      3. For strong matches: draft personalized outreach and schedule initial
      screen

      4. For borderline candidates: flag for HR lead review

      5. Update candidate status and log screening notes
  - id: onboarding-checklist
    name: Onboarding Checklist
    description: Manage new hire onboarding tasks and milestones
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Onboarding
      tags: []
      agents:
        - onboarding-specialist
    content: >-
      # New Hire Onboarding


      1. Create personalized onboarding plan with 30/60/90 day milestones

      2. Schedule orientation sessions (team intros, tools setup, culture
      overview)

      3. Set up access to required systems and documentation

      4. Assign an onboarding buddy from the relevant team

      5. Schedule check-ins at day 7, 30, 60, and 90 — track progress in
      Onboarding group
category: business
---
A multiagent HR organization handling recruiting, onboarding, and people operations. Automates candidate screening, interview scheduling, and new hire onboarding workflows.
