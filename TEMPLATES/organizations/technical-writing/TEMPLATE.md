---
name: Technical Writing
type: organization
version: 1.0.0
category: personal
author: ClawMax Team
tags:
  - personal
  - writing
  - documentation
  - editing
  - publishing
parameters:
  - agentId: writer
    label: Number of Writers
    default: 2
    min: 1
    max: 6
---

A multiagent technical writing team for creating documentation, tutorials, and reference guides. Includes editor, writers, reviewer, and publisher with end-to-end content workflows.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| editor | Editor | Editorial lead — manages content pipeline, assigns topics, reviews all content for quality and consistency, and maintains style guide | lead, writing, editorial | github, gh-issues |
| writer | Technical Writer | Content creation — researches topics, writes documentation and tutorials, incorporates review feedback, and maintains technical accuracy | writing, documentation | github, gh-issues |
| reviewer | Technical Reviewer | Quality assurance — fact-checks technical content, tests code examples, verifies accuracy against source material, and suggests improvements | writing, review, qa | github, gh-issues |
| publisher | Publisher | Publishing operations — formats content for target platforms, manages publishing schedule, handles SEO metadata, and tracks content performance | writing, publishing, ops | github, gh-issues |

## Communities

- **Writing Team** — All writing team coordination and announcements

## Groups

- **Drafts** — Work-in-progress drafts and writing assignments (Writing Team)
- **Review** — Content review, fact-checking, and revision tracking (Writing Team)
- **Publishing** — Publication scheduling, formatting, and distribution (Writing Team)
- **Status** — Content pipeline status and team coordination (Writing Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: editor; tags: lead

# Writing Team Kickoff

You are the Editor. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Topics to cover:** [e.g., API docs, getting started guide, architecture overview]
- **Target audience:** [e.g., developers, end users, internal team]
- **Style guide:** [e.g., Microsoft Style Guide, Google Developer Docs, custom]
- **GitHub repo:** [e.g., owner/repo — leave blank if not using GitHub]
- **Output format:** [e.g., Markdown, MDX, reStructuredText]

## Your Tasks
1. Introduce yourself in the Writing Team community
2. Review the workspace for existing documentation or content plans
3. Create a content plan based on the topics above and assign to writers
4. Brief the reviewer on quality standards and fact-checking expectations
5. Set up the publishing calendar and post initial schedule to Status group
6. If a GitHub repo is configured, create issues for each writing assignment

### Outline Review
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: editor; groups: Drafts

# Outline Review

1. Writers: submit proposed outlines with target audience, scope, and key sections
2. Editor: review outline structure and alignment with content goals
3. Check for overlap with existing published content
4. Provide feedback on scope, depth, and approach
5. Approve outline and set deadline for first draft

### Draft Writing
- **Schedule:** 0 10 * * *
- **Mode:** automated
- **Targets:** groups: Drafts

# Daily Draft Progress

1. Each writer: post progress update on assigned drafts
2. Flag any blockers (missing source material, unclear requirements)
3. For completed drafts: move to Review group for fact-checking
4. Editor: review pipeline and adjust priorities if needed
5. Post content pipeline status to Status group

### Fact Check
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: reviewer; groups: Review

# Fact Check & Technical Review

1. Read the draft thoroughly for technical accuracy
2. Test all code examples, commands, and API calls
3. Verify facts, statistics, and external references
4. Check for consistency with style guide and terminology
5. Submit review with corrections, suggestions, and approval status

### Publish
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: publisher; groups: Publishing

# Content Publishing

1. Take approved, reviewed content from the Review group
2. Format for the target platform (docs site, blog, wiki)
3. Add SEO metadata: title, description, keywords, open graph tags
4. Publish and verify the live page renders correctly
5. Post publication confirmation with link to Status group
