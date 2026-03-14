---
id: customer-feedback-review
name: Customer Feedback Review
description: Weekly review of customer feedback and support tickets
schedule: "0 14 * * 1"
enabled: false
targeting:
  communities:
    - Customer Success
    - Product & Design
  groups: []
  tags: []
  agents: []
executionMode: automated
author: system
---

# Customer Feedback Review

## Objective
Analyze customer feedback from support tickets, surveys, and direct communication to identify patterns and actionable insights.

## Instructions

### 1. Support Ticket Analysis
- Review all tickets closed in the past week
- Identify common issues or feature requests
- Calculate resolution time metrics
- Note any escalations or urgent issues

### 2. Feature Requests
- List top feature requests from customers
- Group similar requests together
- Estimate impact (how many customers affected?)
- Assess feasibility and effort required

### 3. Pain Points
- What are customers struggling with?
- Which features cause the most confusion?
- Are there any workflow blockers?
- What documentation is missing or unclear?

### 4. Positive Feedback
- What do customers love about the product?
- Which features get the most praise?
- Any unexpected use cases or success stories?

### 5. Action Items
- **Quick Wins**: What can be fixed this week?
- **Documentation Updates**: What guides need improvement?
- **Product Backlog**: What should be prioritized in roadmap?
- **Customer Communication**: Who needs a follow-up?

## Output Format
Provide a structured report with:
- Top 5 customer pain points
- Top 5 feature requests
- Recommended action items with priorities
- Metrics summary (ticket volume, resolution time, CSAT)
