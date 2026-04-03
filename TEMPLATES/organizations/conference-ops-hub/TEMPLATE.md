---
name: Conference Ops Hub
type: organization
version: 1.0.0
emoji: 🏟️
category: personal
author: ClawMax Team
tags:
  - personal
  - events
  - conference
  - proposal
  - experimental
  - early-idea
---

Proposal template for larger events with hundreds of attendees, multiple speakers, and heavier planning across program, capacity, sponsors, and follow-through. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| conference-director | Conference Director | Conference lead — sets the event strategy, decision cadence, and overall operating plan. | lead, conference, event |  |
| track-coordinator | Track Coordinator | Track specialist — owns agenda blocks, session sequencing, and the detail flow for one part of the event. | conference, program, tracks |  |
| speaker-operations-lead | Speaker Operations Lead | Speaker ops specialist — manages confirmations, prep packets, travel, timing, and on-site readiness. | conference, speakers, operations |  |
| capacity-planner | Capacity Planner | Capacity specialist — models attendance, room fit, staffing, registration flow, and contingency scenarios. | conference, capacity, operations |  |
| sponsor-manager | Sponsor Manager | Sponsor specialist — manages partner deliverables, timelines, and event-day sponsor coordination. | conference, sponsors |  |
| event-follow-up-lead | Event Follow Up Lead | Follow-up specialist — turns the event into recap, pipeline, survey review, and next-event planning. | conference, follow-up |  |

## Communities

- **Conference Ops** — Shared coordination space for large event and conference operations.

## Groups

- **Program** — Tracks, agenda, content flow, and audience programming. (Conference Ops)
- **Speakers** — Speaker pipeline, prep, assets, travel, and green-room readiness. (Conference Ops)
- **Capacity** — Venue capacity, registration volume, seating, staffing, and contingency planning. (Conference Ops)
- **Sponsors** — Partner deliverables, sponsor logistics, booths, and follow-through. (Conference Ops)
- **Follow-Up** — Post-event recap, leads, survey review, and next-event actions. (Conference Ops)
- **Status** — Current launch readiness, blockers, executive updates, and decisions. (Conference Ops)

## Workflows

### Conference Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: conference-director)
- **Targets:** agents: conference-director; groups: Status

# Conference Kickoff

You are the Conference Director. The conference ops hub just came online.

## Project Configuration
> **Customize these before applying:**

- **Conference name and goal:** [summit, customer event, hack day, community conference, custom]
- **Date, venue, and format:** [date, venue, in-person, hybrid, multi-day, custom]
- **Expected attendees:** [count or range]
- **Speaker and track count:** [speakers, sessions, tracks]
- **Sponsor or partner commitments:** [none, basic, active, custom]
- **Output artifact:** [master runbook, conference plan, executive brief]

## Your Tasks
1. Restate the conference goal, scale, and critical constraints
2. Ask Track Coordinators for the first track and session map
3. Ask Speaker Operations Lead for the speaker readiness plan
4. Ask Capacity Planner for attendee, room, and staffing assumptions
5. Ask Sponsor Manager for partner readiness if applicable
6. Post the first conference operating plan to Status

### Track Planning Review
- **Schedule:** manual
- **Mode:** managed (owner: track-coordinator)
- **Targets:** agents: track-coordinator; groups: Program

# Track Planning Review

1. Build or review the track map, session timing, and room flow
2. Identify gaps, overlaps, and risky transitions
3. Flag any missing owners, assets, or moderation needs
4. Post the track planning review to Program and the biggest risks to Status

### Speaker Ops Review
- **Schedule:** manual
- **Mode:** managed (owner: speaker-operations-lead)
- **Targets:** agents: speaker-operations-lead; groups: Speakers

# Speaker Ops Review

1. Review each speaker's confirmation, talk readiness, and asset status
2. Track travel, green-room, timing, and moderator dependencies
3. Escalate missing materials, scheduling risk, or owner gaps
4. Post the speaker ops review to Speakers and the top blockers to Status

### Capacity And Venue Plan
- **Schedule:** manual
- **Mode:** managed (owner: capacity-planner)
- **Targets:** agents: capacity-planner; groups: Capacity

# Capacity And Venue Plan

1. Review attendance assumptions, room fit, staffing, registration, and line management
2. Identify where capacity or flow could break down at peak volume
3. Recommend contingency plans for overflow, delays, and staffing gaps
4. Post the capacity plan to Capacity and the executive summary to Status

### Sponsor Readiness Check
- **Schedule:** manual
- **Mode:** managed (owner: sponsor-manager)
- **Targets:** agents: sponsor-manager; groups: Sponsors

# Sponsor Readiness Check

1. Review sponsor commitments, deadlines, placements, and deliverables
2. Identify missing assets, approvals, or event-day needs
3. Clarify what the core event team still owes sponsors or partners
4. Post the sponsor readiness check to Sponsors and any escalations to Status

### Conference Follow Up
- **Schedule:** manual
- **Mode:** managed (owner: event-follow-up-lead)
- **Targets:** agents: event-follow-up-lead; groups: Follow-Up

# Conference Follow Up

1. Summarize the event outcomes, feedback themes, and unresolved issues
2. Draft sponsor, speaker, and attendee follow-up streams
3. Capture leads, commitments, and the next conference improvements
4. Post the follow-up plan to Follow-Up and the final summary to Status
