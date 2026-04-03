---
name: Speaker Event Studio
type: organization
version: 1.0.0
emoji: 🎤
category: personal
author: ClawMax Team
tags:
  - personal
  - events
  - speakers
  - proposal
  - experimental
  - early-idea
---

Proposal template for planning medium-sized events with dozens of attendees, a few speakers, and a tighter run-of-show. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| event-director | Event Director | Event lead — defines the event goal, final agenda shape, and owner decisions needed to ship the event cleanly. | lead, event, program |  |
| speaker-coordinator | Speaker Coordinator | Speaker specialist — manages outreach, confirmations, briefing, assets, and speaker logistics. | event, speakers, coordination |  |
| program-manager | Program Manager | Program specialist — builds the agenda, pacing, and audience flow across sessions and transitions. | event, agenda, program |  |
| operations-manager | Operations Manager | Operations specialist — handles venue setup, AV, check-in, seating, and event-day execution. | event, operations, logistics |  |
| follow-up-manager | Follow Up Manager | Follow-up specialist — captures outcomes, sends thanks, and turns the event into next-step actions. | event, follow-up |  |

## Communities

- **Speaker Event** — Shared coordination space for a speaker-driven event team.

## Groups

- **Program** — Agenda design, session flow, and attendee experience. (Speaker Event)
- **Speakers** — Speaker outreach, prep, bios, assets, and communication. (Speaker Event)
- **Logistics** — Venue, AV, seating, check-in, timing, and operational readiness. (Speaker Event)
- **Follow-Up** — Post-event notes, thank-yous, recap, and next steps. (Speaker Event)
- **Status** — Current priorities, dependencies, and launch readiness. (Speaker Event)

## Workflows

### Speaker Event Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: event-director)
- **Targets:** agents: event-director; groups: Status

# Speaker Event Kickoff

You are the Event Director. The speaker event studio just came online.

## Project Configuration
> **Customize these before applying:**

- **Event name and goal:** [launch, salon, meetup, community talk, customer event, custom]
- **Date, venue, and format:** [date, location, in-person, hybrid, custom]
- **Expected attendees:** [count or range]
- **Speaker count:** [planned speakers or panelists]
- **Key audience outcome:** [leads, learning, community, recruiting, custom]
- **Output artifact:** [run-of-show, speaker packet, ops plan, recap]

## Your Tasks
1. Restate the event goal, audience, venue, and timing
2. Ask Program Manager for the first agenda draft
3. Ask Speaker Coordinator for the speaker outreach and prep plan
4. Ask Operations Manager for the venue and check-in readiness plan
5. Set the initial event status and owner decisions in Status

### Speaker Readiness Review
- **Schedule:** manual
- **Mode:** managed (owner: speaker-coordinator)
- **Targets:** agents: speaker-coordinator; groups: Speakers

# Speaker Readiness Review

1. Review speaker confirmations, bios, assets, and talk status
2. Identify who still needs briefing, timing guidance, or reminders
3. Flag missing slides, headshots, approvals, or travel details
4. Post the speaker readiness update to Speakers and any risks to Status

### Run Of Show Build
- **Schedule:** manual
- **Mode:** managed (owner: program-manager)
- **Targets:** agents: program-manager; groups: Program

# Run Of Show Build

1. Build the agenda with session timing, transitions, and owner handoffs
2. Balance speaker time, attendee energy, and buffer windows
3. Call out the top pacing, sequencing, or content risks
4. Post the run-of-show draft to Program and the key dependencies to Status

### Event Day Ops Check
- **Schedule:** manual
- **Mode:** managed (owner: operations-manager)
- **Targets:** agents: operations-manager; groups: Logistics

# Event Day Ops Check

1. Review venue readiness, AV, seating, signage, and check-in flow
2. Confirm staffing, volunteer, or host responsibilities
3. Identify the last operational blockers and contingency plans
4. Post the event-day ops plan to Logistics and a go/no-go summary to Status

### Speaker Event Follow Up
- **Schedule:** manual
- **Mode:** managed (owner: follow-up-manager)
- **Targets:** agents: follow-up-manager; groups: Follow-Up

# Speaker Event Follow Up

1. Summarize what happened, what worked, and what needs action next
2. Draft thank-you, recap, or attendee follow-up messages
3. Capture leads, commitments, and outstanding owner actions
4. Post the follow-up plan to Follow-Up and the executive summary to Status
