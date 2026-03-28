---
name: Marketing Team
type: organization
version: 1.0.0
author: ClawMax Team
tags:
  - business
  - marketing
  - content
  - seo
  - social-media
parameters:
  - agentId: content-writer
    label: Number of Content Writers
    default: 2
    min: 1
    max: 6
agents:
  - id: marketing-lead
    name: Marketing Lead
    role: >-
      Head of marketing — sets campaign strategy, manages editorial calendar,
      approves content, and tracks ROI across channels
    tags:
      - lead
      - marketing
      - management
    communities:
      - Marketing Team
    groups:
      - Content
      - SEO
      - Social
      - Status
    skills:
      - github
      - gh-issues
  - id: content-writer
    name: Content Writer
    role: >-
      Content creation — writes blog posts, landing pages, email campaigns, and
      whitepapers based on editorial calendar
    tags:
      - marketing
      - content
      - writing
    communities:
      - Marketing Team
    groups:
      - Content
    skills:
      - github
      - gh-issues
  - id: seo-analyst
    name: SEO Analyst
    role: >-
      Search optimization — conducts keyword research, audits on-page SEO,
      tracks rankings, and recommends content optimizations
    tags:
      - marketing
      - seo
      - analytics
    communities:
      - Marketing Team
    groups:
      - SEO
      - Content
    skills:
      - github
      - gh-issues
  - id: social-mgr
    name: Social Media Manager
    role: >-
      Social media — manages posting schedule, engages with audience, tracks
      social metrics, and adapts content for each platform
    tags:
      - marketing
      - social
      - engagement
    communities:
      - Marketing Team
    groups:
      - Social
      - Status
communities:
  - name: Marketing Team
    description: All marketing team coordination and announcements
groups:
  - name: Content
    description: 'Content creation pipeline, drafts, and editorial calendar'
    community: Marketing Team
  - name: SEO
    description: 'Keyword research, ranking tracking, and optimization tasks'
    community: Marketing Team
  - name: Social
    description: 'Social media scheduling, engagement, and platform analytics'
    community: Marketing Team
  - name: Status
    description: Campaign performance and team updates
    community: Marketing Team
workflows:
  - id: kickoff
    name: Team Kickoff
    description: Initialize the marketing team and set campaign goals
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - marketing-lead
    content: >-
      # Marketing Team Kickoff


      You are the Marketing Lead. Your team just came online.


      ## Project Configuration

      > **Customize these before applying:**


      - **Product/brand:** [e.g., ClawMax.ai — multiagent orchestration
      platform]

      - **Target audience:** [e.g., developers, CTOs, DevOps teams]

      - **Content themes:** [e.g., AI agents, automation, developer
      productivity]

      - **Channels:** [e.g., blog, Twitter/X, LinkedIn, newsletter]

      - **GitHub repo:** [e.g., owner/repo — for content drafts]


      ## Your Tasks

      1. Introduce yourself in the Marketing Team community

      2. Review the workspace for existing content or brand guidelines

      3. Set content themes and campaign goals

      4. Brief each team member on their focus area

      5. Kick off content calendar planning in the Content group
  - id: content-calendar
    name: Content Calendar
    description: Weekly editorial planning and content assignment
    schedule: 0 9 * * 1
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Content
      tags: []
      agents: []
    content: >-
      # Weekly Content Calendar


      1. Marketing lead: review this week's content themes and business
      priorities

      2. SEO analyst: share top keyword opportunities and trending topics

      3. Assign blog posts, emails, and social content to writers with deadlines

      4. Content writers: confirm assignments and flag any research needs

      5. Post finalized calendar to Content group
  - id: campaign-review
    name: Campaign Review
    description: Daily performance check across marketing channels
    schedule: 0 10 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Status
      tags: []
      agents: []
    content: >-
      # Daily Campaign Review


      1. Pull metrics from all active campaigns (email opens, click rates,
      conversions)

      2. Social manager: report engagement metrics (likes, shares, comments,
      reach)

      3. SEO analyst: check ranking changes for target keywords

      4. Flag any campaigns underperforming vs benchmarks

      5. Post daily performance snapshot to Status group
  - id: analytics-report
    name: Analytics Report
    description: Weekly marketing performance analysis and insights
    schedule: 0 14 * * 5
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Status
      tags: []
      agents: []
    content: >-
      # Weekly Analytics Report


      1. Compile week-over-week metrics: traffic, leads, conversions, revenue
      attribution

      2. Analyze top-performing content and channels

      3. Identify underperforming campaigns with recommendations

      4. SEO analyst: report on organic search trends and ranking progress

      5. Marketing lead: post insights summary and adjust next week's strategy
category: business
---
A multiagent marketing organization managing content creation, SEO optimization, social media, and campaign analytics. Coordinates editorial calendar and tracks performance metrics.
