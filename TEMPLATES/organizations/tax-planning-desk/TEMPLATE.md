---
name: Tax Planning Desk
type: organization
version: 1.0.0
emoji: 🧾
category: personal
author: ClawMax Team
tags:
  - personal
  - taxes
  - finance
  - proposal
  - experimental
  - early-idea
---

Proposal template for personal tax planning, document readiness, deduction review, and deadline tracking. Early idea only and meant to be adapted with a qualified tax professional where needed.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| tax-lead | Tax Lead | Planning lead — defines the tax question, evidence needed, and planning horizon for the user. | lead, tax, planning |  |
| document-organizer | Document Organizer | Document specialist — identifies missing forms, organizes records, and tracks what is ready versus incomplete. | tax, documents, organization |  |
| deduction-reviewer | Deduction Reviewer | Review specialist — checks likely deduction or credit categories, edge cases, and areas needing professional confirmation. | tax, deductions, review |  |
| deadline-tracker | Deadline Tracker | Deadline specialist — tracks filing dates, estimated payment windows, and the next action sequence for the user. | tax, deadlines, planning |  |

## Communities

- **Tax Desk** — Shared space for personal tax planning, records review, and deadline tracking.

## Groups

- **Documents** — Tax forms, receipts, records, and missing-document tracking. (Tax Desk)
- **Strategy** — Potential planning moves, deduction review, and areas needing professional guidance. (Tax Desk)
- **Deadlines** — Filing dates, payment windows, and sequencing of next actions. (Tax Desk)
- **Status** — Readiness, blockers, open questions, and final planning recommendations. (Tax Desk)

## Workflows

### Tax Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: tax-lead)
- **Targets:** agents: tax-lead, document-organizer, deduction-reviewer, deadline-tracker; tags: lead

# Tax Kickoff

You are the Tax Lead. The personal tax planning desk just came online.

## Project Configuration
> **Customize these before applying:**

- **Tax year or period:** [e.g., 2025 filing, quarterly estimate review]
- **Primary question:** [e.g., readiness, deduction review, entity choice, estimated payments]
- **Known tax documents:** [W-2, 1099, K-1, receipts, brokerage statements, custom]
- **Open concerns:** [e.g., RSUs, self-employment, multi-state, charitable giving]
- **Output artifact:** [tax readiness memo, missing-doc list, deadline checklist]

## Your Tasks
1. Define the tax-planning goal and scope
2. Ask Document Organizer for the current readiness view
3. Ask Deduction Reviewer for likely opportunity or risk areas
4. Ask Deadline Tracker for the next filing and payment milestones
5. Post the first planning summary to Status

## Important Note
This is a planning and organization starter template, not tax advice. Escalate anything material to a qualified tax professional.

### Document Readiness Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: tax-lead)
- **Targets:** agents: document-organizer; groups: Documents

# Document Readiness Sweep

1. Review the current tax-document inventory for completeness
2. Separate confirmed records from expected but missing records
3. Highlight anything that blocks filing readiness or strategy review
4. Post the readiness summary to Documents and Status
5. Escalate anything that likely requires professional clarification

### Planning And Deadline Review
- **Schedule:** manual
- **Mode:** managed (owner: tax-lead)
- **Targets:** agents: deduction-reviewer, deadline-tracker; groups: Strategy, Deadlines

# Planning And Deadline Review

1. Review likely deduction, credit, or timing considerations from the current fact set
2. Identify what is clear versus what requires external confirmation
3. Build the next deadline and payment sequence for the user
4. Produce a concise planning note with confidence and caveats
5. Post the result to Strategy, Deadlines, and Status

### Tax Readiness Review
- **Schedule:** manual
- **Mode:** managed (owner: tax-lead)
- **Targets:** agents: tax-lead, document-organizer, deadline-tracker; groups: Status

# Tax Readiness Review

1. Review the current document, planning, and deadline outputs
2. Summarize readiness, open risks, and the highest-priority next action
3. Distinguish administrative next steps from questions that need a tax professional
4. Produce a short tax readiness memo
5. Post the final review to Status
