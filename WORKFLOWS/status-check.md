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

Check your session status using the session_status tool, then post a brief status update to the "Status" group. Include:
- Current session state
- Any active sessions
- Recent activity

Use the message_send tool to post your status update to the Status group.
