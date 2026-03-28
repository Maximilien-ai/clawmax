---
name: Student Research
type: organization
version: 1.0.0
author: ClawMax Team
tags:
  - personal
  - research
  - academic
  - writing
  - analysis
agents:
  - id: research-lead
    name: Research Lead
    role: >-
      Principal investigator — defines research questions, manages methodology,
      coordinates team efforts, and ensures academic rigor
    tags:
      - lead
      - research
      - methodology
    communities:
      - Research Group
    groups:
      - Literature
      - Analysis
      - Writing
      - Status
    skills:
      - github
      - gh-issues
  - id: lit-reviewer
    name: Literature Reviewer
    role: >-
      Literature specialist — searches databases, reads papers, extracts key
      findings, identifies gaps, and maintains citation database
    tags:
      - research
      - literature
      - citations
    communities:
      - Research Group
    groups:
      - Literature
  - id: data-analyst
    name: Data Analyst
    role: >-
      Data analysis — cleans datasets, runs statistical analyses, creates
      visualizations, and validates findings against hypotheses
    tags:
      - research
      - data
      - statistics
    communities:
      - Research Group
    groups:
      - Analysis
      - Status
    skills:
      - github
      - gh-issues
  - id: writer
    name: Research Writer
    role: >-
      Academic writing — drafts paper sections, synthesizes findings into
      narrative, ensures proper citations, and formats for submission
    tags:
      - research
      - writing
      - drafting
    communities:
      - Research Group
    groups:
      - Writing
      - Status
    skills:
      - github
      - gh-issues
communities:
  - name: Research Group
    description: All research group coordination and updates
groups:
  - name: Literature
    description: 'Paper searches, reading notes, and citation management'
    community: Research Group
  - name: Analysis
    description: 'Data analysis, methodology, and findings discussion'
    community: Research Group
  - name: Writing
    description: 'Paper drafts, revisions, and submission prep'
    community: Research Group
  - name: Status
    description: Research progress and team coordination
    community: Research Group
workflows:
  - id: kickoff
    name: Research Kickoff
    description: Initialize the research group and define the research question
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - research-lead
    content: >-
      # Research Group Kickoff


      You are the Research Lead. Your team just came online.


      ## Project Configuration

      > **Customize these before applying:**


      - **Research topic:** [e.g., Impact of LLMs on software engineering
      productivity]

      - **Research question:** [e.g., How do AI coding assistants affect code
      quality?]

      - **Scope:** [e.g., literature review, empirical study, meta-analysis]

      - **Key databases:** [e.g., Google Scholar, arXiv, IEEE, ACM Digital
      Library]

      - **Deadline:** [e.g., April 15, 2026]

      - **GitHub repo:** [e.g., owner/repo — for paper drafts and data]


      ## Your Tasks

      1. Introduce yourself in the Research Group community

      2. Define the research question, scope, and methodology

      3. Assign initial literature search topics to the lit reviewer

      4. Brief the data analyst on expected data sources

      5. Set milestones: lit review, analysis, first draft, submission
  - id: literature-search
    name: Literature Search
    description: Daily search for new relevant papers and sources
    schedule: 0 9 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Literature
      tags: []
      agents:
        - lit-reviewer
    content: >-
      # Daily Literature Search


      1. Search academic databases for papers matching research keywords

      2. Screen titles and abstracts for relevance to research question

      3. For relevant papers: read and extract key findings, methods, and
      citations

      4. Update the literature matrix with new entries

      5. Post daily search summary to Literature group — flag any breakthrough
      papers
  - id: source-evaluation
    name: Source Evaluation
    description: Evaluate and synthesize collected sources
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Literature
        - Analysis
      tags: []
      agents: []
    content: |-
      # Source Evaluation Session

      1. Review all collected sources for quality and relevance
      2. Identify themes, contradictions, and gaps in the literature
      3. Map sources to research sub-questions
      4. Research lead: assess whether literature coverage is sufficient
      5. Writer: begin outlining the literature review section based on themes
  - id: draft-review
    name: Draft Review
    description: Collaborative review of paper drafts
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Writing
      tags: []
      agents: []
    content: |-
      # Draft Review Session

      1. Writer: share the latest draft section for review
      2. Research lead: check for methodological accuracy and argument strength
      3. Data analyst: verify data citations and statistical claims
      4. Lit reviewer: check citation accuracy and completeness
      5. Compile revision notes and assign rewrite tasks
category: personal
---
A multiagent research group for academic projects. Includes literature review, data analysis, and writing roles with workflows for systematic research and collaborative drafting.
