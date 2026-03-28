---
name: Legal Team
type: organization
version: 1.0.0
author: ClawMax Team
tags:
  - business
  - legal
  - compliance
  - contracts
  - risk
parameters:
  - agentId: contract-analyst
    label: Number of Contract Analysts
    default: 2
    min: 1
    max: 5
agents:
  - id: legal-lead
    name: Legal Lead
    role: >-
      General counsel — oversees all legal operations, approves high-risk
      contracts, sets compliance policies, and manages outside counsel
    tags:
      - lead
      - legal
      - management
    communities:
      - Legal Team
    groups:
      - Contracts
      - Compliance
      - Status
    skills:
      - github
      - gh-issues
  - id: contract-analyst
    name: Contract Analyst
    role: >-
      Contract specialist — reviews agreements, redlines terms, identifies
      unfavorable clauses, and tracks renewal dates
    tags:
      - legal
      - contracts
    communities:
      - Legal Team
    groups:
      - Contracts
  - id: compliance-officer
    name: Compliance Officer
    role: >-
      Regulatory compliance — monitors regulatory changes, audits internal
      processes, maintains compliance documentation, and flags violations
    tags:
      - legal
      - compliance
      - regulatory
    communities:
      - Legal Team
    groups:
      - Compliance
      - Status
    skills:
      - github
      - gh-issues
communities:
  - name: Legal Team
    description: All legal team coordination and announcements
groups:
  - name: Contracts
    description: 'Contract review queue, redlines, and approvals'
    community: Legal Team
  - name: Compliance
    description: 'Regulatory updates, audit findings, and compliance tracking'
    community: Legal Team
  - name: Status
    description: Team updates and risk dashboard
    community: Legal Team
workflows:
  - id: kickoff
    name: Team Kickoff
    description: Initialize the legal team and assess current obligations
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - legal-lead
    content: >-
      # Legal Team Kickoff


      You are the Legal Lead. Your team just came online.


      ## Project Configuration

      > **Customize these before applying:**


      - **Company:** [e.g., Acme Corp — SaaS platform]

      - **Priority matters:** [e.g., vendor contracts, privacy policy update,
      SOC2]

      - **Jurisdictions:** [e.g., US, EU/GDPR, California/CCPA]

      - **Contract volume:** [e.g., ~20 vendor contracts/quarter]


      ## Your Tasks

      1. Introduce yourself in the Legal Team community

      2. Review the workspace for existing contracts or compliance docs

      3. Assign contract review queues to analysts

      4. Brief the compliance officer on regulatory areas to monitor

      5. Post initial risk assessment to Status group
  - id: contract-review
    name: Contract Review
    description: Review and redline pending contracts
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Contracts
      tags: []
      agents: []
    content: >-
      # Contract Review


      1. Pull pending contracts from the review queue

      2. Analyze key terms: liability caps, indemnification, IP ownership,
      termination clauses

      3. Flag non-standard or high-risk clauses with redline suggestions

      4. Score overall contract risk (low/medium/high)

      5. Route high-risk contracts to legal lead for final approval
  - id: compliance-check
    name: Compliance Check
    description: Daily regulatory compliance monitoring
    schedule: 0 8 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Compliance
      tags: []
      agents:
        - compliance-officer
    content: |-
      # Daily Compliance Check

      1. Scan for new regulatory updates in relevant jurisdictions
      2. Cross-reference against current internal policies
      3. Flag any gaps between new requirements and existing compliance posture
      4. Check upcoming compliance deadlines (filings, certifications, renewals)
      5. Post compliance status summary to Status group
  - id: risk-assessment
    name: Risk Assessment
    description: Weekly legal risk review across all active matters
    schedule: 0 10 * * 1
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Status
      tags: []
      agents: []
    content: >-
      # Weekly Risk Assessment


      1. Compile all active legal matters: open contracts, compliance issues,
      disputes

      2. Score each matter by risk level and potential business impact

      3. Identify matters requiring escalation or outside counsel

      4. Review contract renewal calendar for upcoming 30 days

      5. Post risk dashboard with week-over-week trend to Status group
category: business
---
A multiagent legal team for contract review, compliance monitoring, and risk assessment. Automates contract analysis, regulatory tracking, and risk scoring.
