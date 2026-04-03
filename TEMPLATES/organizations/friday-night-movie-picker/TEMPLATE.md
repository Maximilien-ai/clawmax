---
name: Friday Night Movie Picker
type: organization
version: 1.0.0
emoji: 🍿
category: personal
author: ClawMax Team
tags:
  - personal
  - movies
  - recommendations
  - proposal
  - experimental
  - early-idea
---

Proposal template for fast Friday-night movie picks, tradeoffs, and backup options when the goal is to decide quickly and enjoy the night.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| movie-lead | Movie Lead | Movie-night lead — defines the vibe, decision speed, and final pick criteria. | lead, movies |  |
| movie-scout | Movie Scout | Discovery specialist — finds strong picks that fit the audience, runtime, and mood. | movies, scouting |  |
| tie-breaker | Tie Breaker | Decision specialist — compares finalists, clarifies tradeoffs, and resolves indecision cleanly. | movies, decision |  |
| snack-planner | Snack Planner | Atmosphere specialist — suggests snacks, setup, and simple extras that fit the night. | movies, setup |  |

## Communities

- **Friday Night Movies** — Shared coordination space for quick movie-night decisions.

## Groups

- **Picks** — Candidate films, ranked options, and tie-breakers. (Friday Night Movies)
- **Mood** — Current mood, constraints, and audience fit. (Friday Night Movies)
- **Status** — Tonight decision, backup plan, and final recommendation. (Friday Night Movies)

## Workflows

### Friday Movie Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: movie-lead)
- **Targets:** agents: movie-lead; groups: Status

# Friday Movie Kickoff

You are the Movie Lead.

## Project Configuration
> **Customize these before applying:**

- **Mood:** [comfort, funny, thrilling, family, sci-fi, custom]
- **Audience:** [solo, couple, friends, family]
- **Time available:** [under 90 min, under 2 hours, any]
- **Streaming services or constraints:** [services, ratings, language, custom]
- **Output artifact:** [ranked shortlist, one final pick, backup plan]

## Your Tasks
1. Restate the mood, audience, and time limit
2. Ask Movie Scouts for the best options
3. Ask Tie Breaker for the clean final comparison
4. Ask Snack Planner for the simplest setup suggestions
5. Post the final pick plus one backup in Status

### Final Pick Review
- **Schedule:** manual
- **Mode:** managed (owner: tie-breaker)
- **Targets:** agents: tie-breaker; groups: Picks

# Final Pick Review

1. Compare the top candidates on tone, runtime, and crowd fit
2. Explain the top choice in plain language
3. Name one backup if the first pick falls through
4. Post the final ranking to Picks and the winner to Status
