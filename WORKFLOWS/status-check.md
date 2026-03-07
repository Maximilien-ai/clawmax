---
id: status-check
name: Status Check
description: Quick status check for agents in Status group
schedule: 0 * * * *
enabled: true
targeting:
  communities: []
  groups:
    - Status
  tags: []
  agents:
    - ceo
    - engineer
    - max0
created: '2026-03-07T14:12:45.476Z'
modified: '2026-03-07T15:23:12.037Z'
author: system
executionMode: manual
---
# Status Check

IMPORTANT: You MUST post your status to the Status group.

1. First, check your session using the session_status tool
2. Then IMMEDIATELY post a message to the Status group saying "I'm online and ready" using message_send tool with to="Status"

DO NOT just run session_status and stop. You MUST send a message to Status group.
