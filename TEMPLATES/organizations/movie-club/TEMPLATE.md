---
name: Movie Club
type: organization
version: 1.0.0
emoji: 🎬
category: hobbies
author: ClawMax Team
tags:
  - hobbies
  - movies
  - proposal
  - experimental
  - early-idea
---

Proposal template for choosing films, planning themed viewings, and capturing reactions or recommendations. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| club-lead | Club Lead | Viewing lead — defines the movie-night theme and what kind of discussion or output is wanted. | lead, movies |  |
| programmer | Programmer | Programming specialist — chooses films, sequencing, and themed watchlists. | movies, programming |  |
| discussion-host | Discussion Host | Discussion specialist — frames questions, reactions, and takeaways after each viewing. | movies, discussion |  |
| recommendation-editor | Recommendation Editor | Recommendation specialist — turns reactions into future picks and ranked lists. | movies, recommendations |  |

## Communities

- **Movie Club** — Shared coordination space for movie club.

## Groups

- **Watchlist** — Film candidates, themes, and viewing priorities. (Movie Club)
- **Discussion** — Notes, reactions, and analysis after watching. (Movie Club)
- **Recommendations** — Future picks, rankings, and themed collections. (Movie Club)
- **Status** — Current cycle, next watch, and open decisions. (Movie Club)

## Workflows

### Movie Night Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: club-lead)
- **Targets:** agents: club-lead; groups: Status

# Movie Night Kickoff

You are the Club Lead. The movie club just came online.

## Project Configuration
> **Customize these before applying:**

- **Theme or mood:** [classic, sci-fi, family, thriller, director study, custom]
- **Audience:** [solo, couple, family, club, custom]
- **Decision horizon:** [tonight, this week, long-term watchlist]
- **Output artifact:** [watchlist, ranked picks, discussion guide]

## Your Tasks
1. Define the viewing goal and constraints
2. Ask Programmer for the first set of picks
3. Ask Discussion Host for prompts or angles to watch for
4. Ask Recommendation Editor for what to queue next
5. Post the current watch plan to Status

### Watchlist Refresh
- **Schedule:** manual
- **Mode:** managed (owner: programmer)
- **Targets:** agents: programmer, recommendation-editor; groups: Watchlist, Recommendations

# Watchlist Refresh

1. Refresh the best current movie options for the chosen theme
2. Rank the top picks with quick reasoning
3. Suggest one wild card and one safe choice
4. Post the refreshed list to Watchlist
