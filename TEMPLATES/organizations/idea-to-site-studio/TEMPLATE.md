---
name: Idea To Site Studio
type: organization
version: 1.0.0
emoji: 🌐
category: technical
author: ClawMax Team
tags:
  - technical
  - website
  - prototype
  - github
  - proposal
  - experimental
  - early-idea
---

Proposal template for turning an idea into a simple website quickly, with copy, implementation, and GitHub handoff.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| site-director | Site Director | Website lead — defines the idea, site shape, and release bar for the first version. | lead, website, product |  |
| prototype-builder | Prototype Builder | Builder specialist — implements the site quickly and keeps the scope tight and shippable. | website, build |  |
| copy-writer | Copy Writer | Copy specialist — writes the page messaging, CTA, and section flow for the idea. | website, copy |  |
| ship-manager | Ship Manager | Shipping specialist — keeps GitHub, deploy readiness, and final handoff organized. | website, shipping, github |  |

## Communities

- **Site Studio** — Shared coordination space for taking an idea to a simple live-ready site.

## Groups

- **Product** — Idea framing, target audience, and offer definition. (Site Studio)
- **Build** — Implementation, page structure, and technical decisions. (Site Studio)
- **Copy** — Headline, CTA, sections, and tone. (Site Studio)
- **Status** — Current build progress, repo status, and blockers. (Site Studio)

## Workflows

### Site Idea Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: site-director)
- **Targets:** agents: site-director; groups: Status

# Site Idea Kickoff

You are the Site Director.

## Project Configuration
> **Customize these before applying:**

- **Idea or product:** [idea]
- **Audience:** [audience]
- **Site goal:** [landing page, waitlist, product teaser, portfolio, custom]
- **Visual vibe:** [clean, bold, playful, premium, custom]
- **GitHub repo:** [owner/repo]
- **Output artifact:** [working site, GitHub push, launch-ready page]

## Your Tasks
1. Restate the site goal, audience, and vibe
2. Ask Copy Writer for the first page messaging
3. Ask Prototype Builders for the implementation plan
4. Ask Ship Manager for the repo and handoff path
5. Post the shipping plan to Status

### Site Build Review
- **Schedule:** manual
- **Mode:** managed (owner: ship-manager)
- **Targets:** agents: ship-manager; groups: Build

# Site Build Review

1. Review the current page structure, repo status, and remaining gaps
2. Confirm what still blocks a first public push
3. Name the fastest path to a good-enough shipped version
4. Post the build review to Build and the ship recommendation to Status
