---
name: Marketing Team
type: organization
version: 1.0.0
category: business
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
---

A multiagent marketing organization managing content creation, SEO optimization, social media, and campaign analytics. Coordinates editorial calendar and tracks performance metrics.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| marketing-lead | Marketing Lead | Head of marketing — sets campaign strategy, manages editorial calendar, approves content, and tracks ROI across channels | lead, marketing, management | github, gh-issues |
| content-writer | Content Writer | Content creation — writes blog posts, landing pages, email campaigns, and whitepapers based on editorial calendar | marketing, content, writing | github, gh-issues |
| seo-analyst | SEO Analyst | Search optimization — conducts keyword research, audits on-page SEO, tracks rankings, and recommends content optimizations | marketing, seo, analytics | github, gh-issues |
| social-mgr | Social Media Manager | Social media — manages posting schedule, engages with audience, tracks social metrics, and adapts content for each platform | marketing, social, engagement |  |

## Communities

- **Marketing Team** — All marketing team coordination and announcements

## Groups

- **Content** — Content creation pipeline, drafts, and editorial calendar (Marketing Team)
- **SEO** — Keyword research, ranking tracking, and optimization tasks (Marketing Team)
- **Social** — Social media scheduling, engagement, and platform analytics (Marketing Team)
- **Status** — Campaign performance and team updates (Marketing Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: marketing-lead; tags: lead

# Marketing Team Kickoff

You are the Marketing Lead. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Product/brand:** [e.g., ClawMax.ai — multiagent orchestration platform]
- **Target audience:** [e.g., developers, CTOs, DevOps teams]
- **Content themes:** [e.g., AI agents, automation, developer productivity]
- **Channels:** [e.g., blog, Twitter/X, LinkedIn, newsletter]
- **GitHub repo:** [e.g., owner/repo — for content drafts]

## Your Tasks
1. Introduce yourself in the Marketing Team community
2. Review the workspace for existing content or brand guidelines
3. Set content themes and campaign goals
4. Brief each team member on their focus area
5. Kick off content calendar planning in the Content group

### Content Calendar
- **Schedule:** 0 9 * * 1
- **Mode:** managed
- **Targets:** groups: Content

# Weekly Content Calendar

1. Marketing lead: review this week's content themes and business priorities
2. SEO analyst: share top keyword opportunities and trending topics
3. Assign blog posts, emails, and social content to writers with deadlines
4. Content writers: confirm assignments and flag any research needs
5. Post finalized calendar to Content group

### Campaign Review
- **Schedule:** 0 10 * * *
- **Mode:** automated
- **Targets:** groups: Status

# Daily Campaign Review

1. Pull metrics from all active campaigns (email opens, click rates, conversions)
2. Social manager: report engagement metrics (likes, shares, comments, reach)
3. SEO analyst: check ranking changes for target keywords
4. Flag any campaigns underperforming vs benchmarks
5. Post daily performance snapshot to Status group

### Analytics Report
- **Schedule:** 0 14 * * 5
- **Mode:** managed
- **Targets:** groups: Status

# Weekly Analytics Report

1. Compile week-over-week metrics: traffic, leads, conversions, revenue attribution
2. Analyze top-performing content and channels
3. Identify underperforming campaigns with recommendations
4. SEO analyst: report on organic search trends and ranking progress
5. Marketing lead: post insights summary and adjust next week's strategy
