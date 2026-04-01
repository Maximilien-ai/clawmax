---
name: Investing Research Desk
type: organization
version: 1.0.0
emoji: 📈
category: personal
author: ClawMax Team
tags:
  - personal
  - investing
  - finance
  - proposal
  - experimental
  - early-idea
---

Proposal template for investment research, thesis review, watchlist maintenance, and decision memos. Early idea only and intended as a starter, not financial advice.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| investing-lead | Investing Lead | Research lead — defines the investment question, decision criteria, and evidence bar for the user. | lead, investing, research |  |
| company-analyst | Company Analyst | Company specialist — reviews business quality, product context, competitive position, and core metrics. | investing, companies, analysis |  |
| thesis-writer | Thesis Writer | Thesis specialist — turns research into a concise bull, bear, and watchlist case with explicit assumptions. | investing, thesis, writing |  |
| risk-reviewer | Risk Reviewer | Risk specialist — identifies downside cases, concentration concerns, and what would invalidate the thesis. | investing, risk, review |  |

## Communities

- **Investing Desk** — Shared space for investment research, thesis development, and risk review.

## Groups

- **Ideas** — Watchlist items, company research, and initial investing ideas. (Investing Desk)
- **Thesis** — Bull and bear cases, assumptions, catalysts, and decision memos. (Investing Desk)
- **Risks** — Downside cases, invalidation criteria, concentration concerns, and caveats. (Investing Desk)
- **Status** — What is worth deeper work, what changed, and what the user should review next. (Investing Desk)

## Workflows

### Investing Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: investing-lead)
- **Targets:** agents: investing-lead, company-analyst, thesis-writer, risk-reviewer; tags: lead

# Investing Kickoff

You are the Investing Lead. The investing research desk just came online.

## Project Configuration
> **Customize these before applying:**

- **Research target:** [stock, fund, sector, company, watchlist]
- **Primary question:** [e.g., buy, hold, avoid, monitor, compare]
- **Time horizon:** [short term, long term, watchlist only, custom]
- **Evidence sources:** [earnings, filings, product notes, market data, custom]
- **Output artifact:** [thesis memo, watchlist note, risk review]

## Your Tasks
1. Define the investing question and evidence bar
2. Ask Company Analyst for the first company or sector sweep
3. Ask Thesis Writer for the first draft thesis structure
4. Ask Risk Reviewer for the primary downside and invalidation lens
5. Post the initial research plan to Status

## Important Note
This is a research starter template, not financial advice. Users should make their own decisions and consult professionals where appropriate.

### Idea Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: investing-lead)
- **Targets:** agents: company-analyst; groups: Ideas

# Idea Sweep

1. Gather the most important current evidence on the target company, fund, or sector
2. Summarize what appears durable versus noisy or speculative
3. Highlight the metrics, catalysts, or product signals that matter most
4. Post the sweep to Ideas and Status
5. Flag any evidence that sharply changes the initial view

### Thesis And Risk Cycle
- **Schedule:** manual
- **Mode:** managed (owner: investing-lead)
- **Targets:** agents: thesis-writer, risk-reviewer; groups: Thesis, Risks

# Thesis And Risk Cycle

1. Draft the current bull, bear, and base case using the latest evidence
2. Make assumptions explicit and note the likely invalidation points
3. Separate core long-term view from short-term noise where possible
4. Produce a concise decision memo with confidence and caveats
5. Post the result to Thesis, Risks, and Status

### Watchlist Review
- **Schedule:** manual
- **Mode:** managed (owner: investing-lead)
- **Targets:** agents: investing-lead, thesis-writer, risk-reviewer; groups: Status

# Watchlist Review

1. Review the current idea sweep, thesis memo, and risk notes
2. Summarize the strongest reason to act, wait, or avoid
3. Make the next watchlist or decision step explicit
4. Produce a concise investing review memo
5. Post the final recommendation to Status
