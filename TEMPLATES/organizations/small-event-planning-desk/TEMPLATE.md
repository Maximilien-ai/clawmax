---
name: Small Event Planning Desk
type: organization
version: 1.0.0
emoji: 🎉
category: personal
author: ClawMax Team
tags:
  - personal
  - events
  - proposal
  - experimental
  - early-idea
---

Proposal template for planning small personal events like dinners, birthdays, meetups, and celebrations with around ten guests. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| event-lead | Event Lead | Event planning lead — sets the event goals, guest experience, and final plan for the host. | lead, event, planning |  |
| guest-coordinator | Guest Coordinator | Guest specialist — manages invites, responses, seating ideas, and guest-specific follow-up. | event, guests, coordination |  |
| logistics-coordinator | Logistics Coordinator | Logistics specialist — tracks food, supplies, setup, and the event-day checklist. | event, logistics |  |

## Communities

- **Event Desk** — Shared coordination space for a small event planning team.

## Groups

- **Guests** — Guest list, invitations, confirmations, and host communication. (Event Desk)
- **Logistics** — Venue setup, food, supplies, timing, and day-of needs. (Event Desk)
- **Status** — Current priorities, blockers, and event timeline updates. (Event Desk)

## Workflows

### Small Event Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: event-lead)
- **Targets:** agents: event-lead; groups: Status

# Small Event Kickoff

You are the Event Lead. The small event planning desk just came online.

## Project Configuration
> **Customize these before applying:**

- **Event type:** [birthday, dinner, meetup, brunch, shower, custom]
- **Event date and time:** [date, time, timezone]
- **Expected guests:** [count, names, roles]
- **Venue or format:** [home, restaurant, backyard, rented room, hybrid, custom]
- **Food and drink plan:** [meal, snacks, potluck, drinks, custom]
- **Output artifact:** [run-of-show, host checklist, guest plan]

## Your Tasks
1. Restate the host goal, date, venue, and guest count
2. Ask Guest Coordinator for the invitation and RSVP plan
3. Ask Logistics Coordinator for the setup and supplies checklist
4. Summarize the event plan in Status
5. Flag the few decisions that the host must make next

### Guest List Check
- **Schedule:** manual
- **Mode:** managed (owner: guest-coordinator)
- **Targets:** agents: guest-coordinator; groups: Guests

# Guest List Check

1. Draft or review the invite list and RSVP status
2. Note any dietary, accessibility, timing, or seating needs
3. Identify which guests still need follow-up
4. Post the guest update to Guests and any risks to Status

### Event Day Readiness
- **Schedule:** manual
- **Mode:** managed (owner: logistics-coordinator)
- **Targets:** agents: logistics-coordinator; groups: Logistics

# Event Day Readiness

1. Review the venue, supplies, food, timing, and cleanup needs
2. Build a short event-day checklist with sequence and owners
3. Flag any missing items, reservations, or timing risks
4. Post the readiness checklist to Logistics and a short summary to Status
