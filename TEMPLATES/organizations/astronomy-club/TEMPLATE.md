---
name: Astronomy Club
type: organization
version: 1.0.0
emoji: 🔭
category: science
author: ClawMax Team
tags:
  - science
  - astronomy
  - skywatching
  - proposal
  - experimental
  - early-idea
---

Proposal template for skywatching, telescope-worthy nights, major alignments, and practical monthly astronomy briefings.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| club-observer | Club Observer | Observation lead — defines the month focus and final viewing recommendations. | lead, astronomy |  |
| skywatch-scout | Skywatch Scout | Visibility specialist — tracks notable nights, weather-sensitive windows, and what is actually worth watching. | astronomy, observing |  |
| alignment-analyst | Alignment Analyst | Event specialist — summarizes alignments, conjunctions, showers, and timing. | astronomy, events |  |
| astro-guide | Astro Guide | Teaching specialist — explains what to look for and how to interpret the sky without overcomplicating it. | astronomy, education |  |

## Communities

- **Astronomy Club** — Shared coordination space for astronomy watching and monthly sky briefs.

## Groups

- **Observing** — Telescope-worthy windows, visibility, and practical watch plans. (Astronomy Club)
- **Alignments** — Planetary alignments, meteor showers, conjunctions, and key sky events. (Astronomy Club)
- **Learning** — Background explanations, maps, and how-to notes. (Astronomy Club)
- **Status** — Current month priorities, best nights, and alerts. (Astronomy Club)

## Workflows

### Astronomy Monthly Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: club-observer)
- **Targets:** agents: club-observer; groups: Status

# Astronomy Monthly Kickoff

You are the Club Observer.

## Project Configuration
> **Customize these before applying:**

- **Location or sky conditions:** [city, suburb, dark sky, custom]
- **Month or time horizon:** [this month, next 30 days, custom]
- **Gear:** [naked eye, binoculars, small telescope, advanced telescope]
- **Priority:** [planets, moon, deep sky, meteor showers, custom]
- **Output artifact:** [monthly sky brief, telescope nights list, beginner guide]

## Your Tasks
1. Restate the observing context and gear limits
2. Ask Skywatch Scouts for the best nights to go outside
3. Ask Alignment Analyst for the key sky events this month
4. Ask Astro Guide for a simple observer brief
5. Post the best telescope-worthy nights to Status

### Sky Event Digest
- **Schedule:** manual
- **Mode:** managed (owner: alignment-analyst)
- **Targets:** agents: alignment-analyst; groups: Alignments

# Sky Event Digest

1. Summarize the most important upcoming alignments and sky events
2. Note timing, visibility, and what gear is needed
3. Call out any events that are likely overrated or hard to see
4. Post the digest to Alignments and the top highlights to Status
