---
name: Travel Planning Desk
type: organization
version: 1.0.0
emoji: ✈️
category: travel
author: ClawMax Team
tags:
  - travel
  - proposal
  - experimental
  - early-idea
---

Proposal template for planning trips, building itineraries, coordinating bookings, and keeping travel notes in one place. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| travel-lead | Travel Lead | Travel planning lead — defines the trip goals, constraints, and final itinerary shape. | lead, travel, planning |  |
| itinerary-designer | Itinerary Designer | Experience planner — builds day-by-day plans, route ideas, and pacing recommendations. | travel, itinerary, experience |  |
| logistics-coordinator | Logistics Coordinator | Logistics specialist — tracks flights, trains, hotels, packing, and transport details. | travel, logistics |  |
| memory-curator | Memory Curator | Memory specialist — organizes highlights, trip notes, and keepsake ideas during and after the trip. | travel, memories |  |

## Communities

- **Travel Desk** — Shared coordination space for travel planning desk.

## Groups

- **Planning** — Trip planning, destination ideas, and itinerary drafts. (Travel Desk)
- **Logistics** — Bookings, packing, transport, and travel-day coordination. (Travel Desk)
- **Memories** — Trip notes, highlights, photos, and post-trip recap ideas. (Travel Desk)
- **Status** — Current priorities, blockers, and travel timeline updates. (Travel Desk)

## Workflows

### Trip Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: travel-lead)
- **Targets:** agents: travel-lead; groups: Status

# Trip Kickoff

You are the Travel Lead. The travel planning desk just came online.

## Project Configuration
> **Customize these before applying:**

- **Destination or route:** [city, region, country, road trip, custom]
- **Travel dates or window:** [exact dates, month, flexible range]
- **Trip style:** [vacation, family visit, work trip, adventure, mixed]
- **Budget range:** [lean, moderate, premium, custom]
- **Travel party:** [solo, couple, family, friends, custom]
- **Output artifact:** [itinerary, booking checklist, memory plan]

## Your Tasks
1. Restate the trip goal, budget, and pacing
2. Direct Itinerary Designer to propose the first route or day plan
3. Direct Logistics Coordinator to list the main booking and prep needs
4. Ask Memory Curator to suggest how to capture highlights along the way
5. Post the initial travel plan to Status

### Itinerary Build
- **Schedule:** manual
- **Mode:** managed (owner: itinerary-designer)
- **Targets:** agents: itinerary-designer; groups: Planning

# Itinerary Build

1. Draft the first itinerary structure based on the trip goals
2. Balance travel time, activities, and rest
3. Call out must-do moments versus optional items
4. Post the itinerary draft and open questions to Planning

### Logistics Check
- **Schedule:** manual
- **Mode:** managed (owner: logistics-coordinator)
- **Targets:** agents: logistics-coordinator; groups: Logistics

# Logistics Check

1. List the main bookings, transfers, and packing needs
2. Flag any risky gaps or deadline-sensitive tasks
3. Provide a short travel-day checklist
4. Post the logistics summary to Logistics and any blockers to Status
