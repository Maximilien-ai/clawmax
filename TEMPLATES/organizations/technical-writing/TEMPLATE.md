---
name: Technical Writing
type: organization
version: 1.0.0
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
agents:
  - id: editor
    name: Editor
    role: >-
      Editorial lead — manages content pipeline, assigns topics, reviews all
      content for quality and consistency, and maintains style guide
    tags:
      - lead
      - writing
      - editorial
    communities:
      - Writing Team
    groups:
      - Drafts
      - Review
      - Publishing
      - Status
    skills:
      - github
      - gh-issues
  - id: writer
    name: Technical Writer
    role: >-
      Content creation — researches topics, writes documentation and tutorials,
      incorporates review feedback, and maintains technical accuracy
    tags:
      - writing
      - documentation
    communities:
      - Writing Team
    groups:
      - Drafts
      - Review
    skills:
      - github
      - gh-issues
  - id: reviewer
    name: Technical Reviewer
    role: >-
      Quality assurance — fact-checks technical content, tests code examples,
      verifies accuracy against source material, and suggests improvements
    tags:
      - writing
      - review
      - qa
    communities:
      - Writing Team
    groups:
      - Review
      - Status
    skills:
      - github
      - gh-issues
  - id: publisher
    name: Publisher
    role: >-
      Publishing operations — formats content for target platforms, manages
      publishing schedule, handles SEO metadata, and tracks content performance
    tags:
      - writing
      - publishing
      - ops
    communities:
      - Writing Team
    groups:
      - Publishing
      - Status
    skills:
      - github
      - gh-issues
communities:
  - name: Writing Team
    description: All writing team coordination and announcements
groups:
  - name: Drafts
    description: Work-in-progress drafts and writing assignments
    community: Writing Team
  - name: Review
    description: 'Content review, fact-checking, and revision tracking'
    community: Writing Team
  - name: Publishing
    description: 'Publication scheduling, formatting, and distribution'
    community: Writing Team
  - name: Status
    description: Content pipeline status and team coordination
    community: Writing Team
workflows:
  - id: kickoff
    name: Team Kickoff
    description: Initialize the writing team and set editorial direction
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - editor
    content: >-
      # Writing Team Kickoff


      You are the Editor. Your team just came online.


      ## Project Configuration

      > **Customize these before applying:**


      - **Topics to cover:** [e.g., API docs, getting started guide,
      architecture overview]

      - **Target audience:** [e.g., developers, end users, internal team]

      - **Style guide:** [e.g., Microsoft Style Guide, Google Developer Docs,
      custom]

      - **GitHub repo:** [e.g., owner/repo — leave blank if not using GitHub]

      - **Output format:** [e.g., Markdown, MDX, reStructuredText]


      ## Your Tasks

      1. Introduce yourself in the Writing Team community

      2. Review the workspace for existing documentation or content plans

      3. Create a content plan based on the topics above and assign to writers

      4. Brief the reviewer on quality standards and fact-checking expectations

      5. Set up the publishing calendar and post initial schedule to Status
      group

      6. If a GitHub repo is configured, create issues for each writing
      assignment
  - id: outline-review
    name: Outline Review
    description: Review and approve content outlines before writing begins
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Drafts
      tags: []
      agents:
        - editor
    content: >-
      # Outline Review


      1. Writers: submit proposed outlines with target audience, scope, and key
      sections

      2. Editor: review outline structure and alignment with content goals

      3. Check for overlap with existing published content

      4. Provide feedback on scope, depth, and approach

      5. Approve outline and set deadline for first draft
  - id: draft-writing
    name: Draft Writing
    description: Daily writing check-in and draft progress tracking
    schedule: 0 10 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Drafts
      tags: []
      agents: []
    content: |-
      # Daily Draft Progress

      1. Each writer: post progress update on assigned drafts
      2. Flag any blockers (missing source material, unclear requirements)
      3. For completed drafts: move to Review group for fact-checking
      4. Editor: review pipeline and adjust priorities if needed
      5. Post content pipeline status to Status group
  - id: fact-check
    name: Fact Check
    description: Technical review and fact-checking of completed drafts
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Review
      tags: []
      agents:
        - reviewer
    content: |-
      # Fact Check & Technical Review

      1. Read the draft thoroughly for technical accuracy
      2. Test all code examples, commands, and API calls
      3. Verify facts, statistics, and external references
      4. Check for consistency with style guide and terminology
      5. Submit review with corrections, suggestions, and approval status
  - id: publish
    name: Publish
    description: Format and publish approved content
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Publishing
      tags: []
      agents:
        - publisher
    content: |-
      # Content Publishing

      1. Take approved, reviewed content from the Review group
      2. Format for the target platform (docs site, blog, wiki)
      3. Add SEO metadata: title, description, keywords, open graph tags
      4. Publish and verify the live page renders correctly
      5. Post publication confirmation with link to Status group
category: personal
---
A multiagent technical writing team for creating documentation, tutorials, and reference guides. Includes editor, writers, reviewer, and publisher with end-to-end content workflows.
