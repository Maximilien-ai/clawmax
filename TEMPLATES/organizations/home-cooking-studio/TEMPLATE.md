---
name: Home Cooking Studio
type: organization
version: 1.0.0
emoji: 🍳
category: hobbies
author: ClawMax Team
tags:
  - hobbies
  - cooking
  - proposal
  - experimental
  - early-idea
---

Proposal template for meal planning, recipe experimentation, and cooking project tracking at home. Early idea only and meant to be customized.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| kitchen-lead | Kitchen Lead | Cooking lead — sets the meal goal, dietary constraints, and quality bar for the session. | lead, cooking |  |
| menu-planner | Menu Planner | Planning specialist — proposes recipes, sequencing, and serving ideas. | cooking, planning |  |
| prep-coordinator | Prep Coordinator | Prep specialist — organizes ingredients, shopping, and kitchen workflow. | cooking, prep |  |
| taste-reviewer | Taste Reviewer | Review specialist — captures what worked, what failed, and what to adjust next time. | cooking, review |  |

## Communities

- **Cooking Studio** — Shared coordination space for home cooking studio.

## Groups

- **Recipes** — Recipe ideas, substitutions, and technique notes. (Cooking Studio)
- **Kitchen Prep** — Shopping, prep plans, and equipment notes. (Cooking Studio)
- **Review** — Taste notes, repeatability, and future improvements. (Cooking Studio)
- **Status** — Current cooking goals and next experiments. (Cooking Studio)

## Workflows

### Cooking Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: kitchen-lead)
- **Targets:** agents: kitchen-lead; groups: Status

# Cooking Kickoff

You are the Kitchen Lead. The home cooking studio just came online.

## Project Configuration
> **Customize these before applying:**

- **Meal or project:** [weeknight dinner, baking, meal prep, special occasion, custom]
- **Constraints:** [budget, time, dietary needs, equipment, custom]
- **Skill goal:** [learn a technique, repeat a favorite, experiment, custom]
- **Output artifact:** [meal plan, shopping list, recipe note]

## Your Tasks
1. Define the cooking goal and constraints
2. Ask Menu Planner for the first proposal
3. Ask Prep Coordinator for the ingredient and timing plan
4. Ask Taste Reviewer to define the review rubric
5. Post the current kitchen plan to Status

### Recipe Retro
- **Schedule:** manual
- **Mode:** managed (owner: taste-reviewer)
- **Targets:** agents: taste-reviewer; groups: Review

# Recipe Retro

1. Review how the recipe or cooking session went
2. Capture what worked, what failed, and what to change
3. Suggest whether to repeat, revise, or retire the recipe
4. Post the retro to Review
