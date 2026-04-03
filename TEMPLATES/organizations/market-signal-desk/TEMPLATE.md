---
name: Market Signal Desk
type: organization
version: 1.0.0
emoji: 📈
category: business
author: ClawMax Team
tags:
  - business
  - finance
  - stocks
  - markets
  - proposal
  - experimental
  - early-idea
---

Proposal template for tracking stocks, macro signals, company news, and investor vibe so users know what deserves attention right now.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| desk-lead | Desk Lead | Market lead — defines the watchlist, risk lens, and final attention memo. | lead, markets |  |
| market-analyst | Market Analyst | Trend specialist — tracks sectors, indices, macro changes, and what actually matters. | markets, analysis |  |
| company-tracker | Company Tracker | Company specialist — follows earnings, product moves, leadership changes, and stock-specific catalysts. | stocks, companies |  |
| sentiment-watcher | Sentiment Watcher | Sentiment specialist — reviews retail discussion, community vibe, and market narrative without treating it as truth. | sentiment, markets |  |

## Communities

- **Market Signals** — Shared coordination space for market trends, stock watchlists, and investor sentiment.

## Groups

- **Markets** — Macro trends, sectors, and cross-market moves. (Market Signals)
- **Companies** — Company-specific news, earnings, and stock catalysts. (Market Signals)
- **Sentiment** — Retail vibe, community chatter, and noisy signals to interpret carefully. (Market Signals)
- **Status** — Current attention list, risks, and watch priorities. (Market Signals)

## Workflows

### Market Attention Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: desk-lead)
- **Targets:** agents: desk-lead; groups: Status

# Market Attention Kickoff

You are the Desk Lead.

## Project Configuration
> **Customize these before applying:**

- **Watchlist or sector:** [tickers, themes, sector, custom]
- **Time horizon:** [today, this week, this month]
- **Risk style:** [conservative, balanced, aggressive]
- **Priority lens:** [news, catalysts, sentiment, macro, all]
- **Output artifact:** [watch note, daily digest, investor memo]

## Your Tasks
1. Restate the watchlist and time horizon
2. Ask Market Analysts for the biggest trend shifts
3. Ask Company Tracker for the highest-signal company developments
4. Ask Sentiment Watcher for retail narrative worth noticing or ignoring
5. Post the current attention list to Status

### Market Signal Digest
- **Schedule:** manual
- **Mode:** managed (owner: company-tracker)
- **Targets:** agents: company-tracker; groups: Companies

# Market Signal Digest

1. Summarize the strongest company or stock-specific developments
2. Note which moves are signal versus noise
3. Connect news to likely investor attention over the chosen time horizon
4. Post the company digest to Companies and the top actions to Status
