---
name: Test Template
type: organization
version: 1.1.0
tags:
  - test
  - minimal
  - fixture
agents:
  - id: test1
    name: test1
    role: Test Assistant
    model: openai/gpt-4o-mini
    tags:
      - test
      - assistant
    skills:
      - github
    communities:
      - test-community
    groups:
      - test-group
  - id: test2
    name: test2
    role: Test Engineer
    model: openai/gpt-4o-mini
    tags:
      - test
      - engineer
    skills:
      - github
    communities:
      - test-community
    groups:
      - test-group
groups:
  - name: test-group
    description: Test group for agent communication and status updates
    tags:
      - test
    channels: []
    community: test-community
communities:
  - name: test-community
    description: Test community for multiagent coordination
    tags:
      - test
    channels:
      - whatsapp
workflows:
  - id: test-status-check
    name: Status Check
    description: Agents report status every 5 minutes (limited to 5 runs)
    schedule: '*/5 * * * *'
    enabled: true
    executionMode: automated
    maxRuns: 5
    targeting:
      communities: []
      groups:
        - test-group
      tags: []
      agents: []
    content: |-
      # Status Check

      Provide a brief status update:

      1. **Current state**: What are you working on?
      2. **Any issues**: Anything blocking you?
      3. **Next action**: What will you do next?

      Keep it concise (2-3 sentences).
---
Minimal testing fixture with 2 agents, 1 group, 1 community, and a status workflow (runs every 5 min, limited to 5 runs)
