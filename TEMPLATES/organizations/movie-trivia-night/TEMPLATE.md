---
name: Movie Trivia Night
type: organization
version: 1.0.0
emoji: 🎲
category: hobbies
author: ClawMax Team
tags:
  - hobbies
  - movies
  - games
  - trivia
  - proposal
  - experimental
  - early-idea
---

Proposal template for planning a movie trivia game night with rounds, scoring, hosting notes, and themed questions.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| trivia-host | Trivia Host | Game lead — defines the theme, pacing, and final structure of the trivia night. | lead, games, movies |  |
| question-writer | Question Writer | Question specialist — drafts themed questions, clues, and answer variants. | games, questions |  |
| round-designer | Round Designer | Round specialist — shapes categories, difficulty curve, and game variety. | games, design |  |
| score-keeper | Score Keeper | Scoring specialist — defines points, tie-breakers, and answer validation rules. | games, scoring |  |

## Communities

- **Movie Trivia** — Shared coordination space for movie trivia game setup and hosting.

## Groups

- **Questions** — Question ideas, categories, and difficulty tuning. (Movie Trivia)
- **Host Notes** — Run-of-show, pacing, and hosting guidance. (Movie Trivia)
- **Scoring** — Round structure, points, tie-breakers, and answer key. (Movie Trivia)
- **Status** — Current game plan, rounds ready, and open gaps. (Movie Trivia)

## Workflows

### Trivia Night Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: trivia-host)
- **Targets:** agents: trivia-host; groups: Status

# Trivia Night Kickoff

You are the Trivia Host.

## Project Configuration
> **Customize these before applying:**

- **Theme:** [general movies, one franchise, decade, director, genre, custom]
- **Audience size:** [small, medium, party, custom]
- **Difficulty:** [easy, mixed, hard]
- **Rounds planned:** [3, 4, 5, custom]
- **Output artifact:** [ready-to-host trivia pack, host script, answer key]

## Your Tasks
1. Restate the game-night goal and constraints
2. Ask Question Writers for the first batch of questions
3. Ask Round Designer for the round structure
4. Ask Score Keeper for scoring rules and tie-breakers
5. Post the trivia plan to Status

### Trivia Pack Build
- **Schedule:** manual
- **Mode:** managed (owner: round-designer)
- **Targets:** agents: round-designer; groups: Questions

# Trivia Pack Build

1. Organize questions into rounds with a clear difficulty curve
2. Make sure the set is fun, fair, and varied
3. Pair each round with a clean answer key
4. Post the draft pack to Questions and the host summary to Status
