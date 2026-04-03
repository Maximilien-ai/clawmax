---
name: Lu.ma Event Analysis Desk
type: organization
version: 1.0.0
emoji: 📅
category: business
author: ClawMax Team
tags:
  - business
  - events
  - analytics
  - luma
  - proposal
  - experimental
  - early-idea
---

Proposal template for analyzing Lu.ma events, attendees, invites, and engagement signals so organizers can understand what is working and what to change next.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| analysis-lead | Analysis Lead | Event analytics lead — defines the question, decision lens, and final recommendations for organizers. | lead, events, analytics | luma-event-insights |
| event-analyst | Event Analyst | Event specialist — compares event performance, timing, topics, format, and operational patterns across one or more Lu.ma events. | events, analysis | luma-event-insights |
| audience-analyst | Audience Analyst | Audience specialist — studies attendees, repeat guests, VIPs, no-shows, and who actually shows up versus who registers. | attendees, audience | luma-event-insights |
| invite-analyst | Invite Analyst | Invite specialist — reviews invite flow, RSVP conversion, waitlists, declines, and distribution channel quality. | invites, conversion | luma-event-insights |
| signal-analyst | Signal Analyst | Signal specialist — turns chats, comments, and external signals into themes, sentiment, and organizer takeaways. | signals, sentiment | luma-event-insights |

## Communities

- **Lu.ma Analysis** — Shared coordination space for Lu.ma event analysis, attendee patterns, invite funnel review, and engagement signals.

## Groups

- **Events** — Event-level performance, schedule patterns, themes, and comparisons across events. (Lu.ma Analysis)
- **Attendees** — Attendee makeup, repeat attendance, VIP presence, no-show patterns, and cohort behavior. (Lu.ma Analysis)
- **Invites** — Invite funnel, RSVP conversion, declines, waitlist behavior, and distribution patterns. (Lu.ma Analysis)
- **Signals** — Chat, comments, social echoes, and high-signal attendee or organizer feedback. (Lu.ma Analysis)
- **Status** — Current analysis scope, data gaps, risks, and final recommendations. (Lu.ma Analysis)

## Workflows

### Lu.ma Analysis Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: analysis-lead)
- **Targets:** agents: analysis-lead; groups: Status

# Lu.ma Analysis Kickoff

You are the Analysis Lead. The Lu.ma event analysis desk just came online.

## Project Configuration
> **Customize these before applying:**

- **Lu.ma event URL, slug, or event list:** [single event, series, organizer page, custom]
- **Organizer question:** [attendance, invites, no-shows, VIP mix, trend shifts, engagement, custom]
- **Time window:** [last event, last 3 events, last 90 days, custom]
- **Audience focus:** [all attendees, VIPs, new attendees, repeat attendees, invitees, custom]
- **Output artifact:** [analysis memo, dashboard brief, organizer recap, investor-style summary]
- **Data access path:** [Lu.ma API key, exported CSV, manual event links, custom skill, custom]

## Required Inputs Before Running
1. Confirm the exact Lu.ma event or event set to analyze
2. Confirm where the organizer can get the data
3. Confirm whether this workspace already has a Lu.ma-fetching skill or API integration

## Data Access Notes
- If the organizer has Lu.ma API access, provide the API key or the event export path through your secure runtime setup
- If Lu.ma data is not already wired into this workspace, create or import a custom skill that can fetch event, attendee, invite, and engagement data first
- If direct API access is unavailable, use exported attendee/invite/event CSVs and organizer notes as the input source

## Your Tasks
1. Restate the event scope, organizer question, time window, and output artifact
2. Ask Event Analysts for the event-level performance and comparison plan
3. Ask Audience Analyst for the attendee and repeat-guest lens
4. Ask Invite Analyst for the invite funnel and RSVP conversion lens
5. Ask Signal Analyst for the comment/chat/external-signal lens
6. Post the final analysis plan plus missing inputs to Status

### Lu.ma Insight Brief
- **Schedule:** manual
- **Mode:** managed (owner: analysis-lead)
- **Targets:** agents: analysis-lead; groups: Status

# Lu.ma Insight Brief

1. Collect the strongest event, attendee, invite, and signal findings
2. Separate reliable facts from soft interpretation or missing data
3. Summarize the top patterns, anomalies, and organizer takeaways
4. Recommend what to repeat, change, test, or monitor in the next event cycle
5. Post the final brief to Status and link the supporting evidence from Events, Attendees, Invites, and Signals
