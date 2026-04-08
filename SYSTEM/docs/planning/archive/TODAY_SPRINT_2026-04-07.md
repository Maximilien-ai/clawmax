# Sprint: April 7, 2026

> Primary theme: partner-ready workspace integrations
> Delivery target: preserve current integration value, redesign the flow, and prepare Blaxel + Redis for partner conversations by end of day April 8

## Current Context

- Cloud runtime work is still active with the CLI team and remains the top deployment blocker.
- Local/product demo paths improved materially:
  - chat file links
  - notification file links
  - shared workspace dashboard file links
  - workflow-to-chat deep link behavior
- Workspace isolation had two recent fixes:
  - prevent creating a new workspace on top of an existing non-empty directory
  - stop temporary cross-workspace dashboard reads from mutating the globally active workspace in memory
- The workspace auto-switch issue should remain tracked until it survives more real use.

## Primary Outcome

Create a credible, partner-ready integrations plan and first implementation slice that:

1. keeps current partner value working:
   - Senso
   - Opik
   - GitHub
2. redesigns Workspaces Integrations into:
   - core provider setup
   - optional partner pages
3. prepares the product for:
   - Blaxel
   - Redis

## Today / Next Execution Order

1. **Plan + contract**
   - define partner metadata contract
   - define partner allowlist behavior
   - define safe skill-install policy

2. **Integrations redesign**
   - refactor current wizard shape without losing Senso / Opik / GitHub
   - add partner selection step and page routing

3. **Partner definitions**
   - scaffold local partner definitions for:
     - senso
     - opik
     - github
     - blaxel
     - redis

4. **Blaxel / Redis first pass**
   - add config capture pages
   - add validation/config persistence
   - add copy, links, and placeholder logo support

5. **Template / skills follow-through**
   - decide curated install path for partner-owned skills
   - add template apply hooks for configured partner toggles

## Non-Goals For Today

- do not build a fully generic arbitrary npm / npx skill execution platform
- do not externalize everything to `Maximilien-ai/partners` immediately
- do not broaden every existing template to use all partners in one pass

## Watch Items

- cloud image/runtime validation once CLI reports ready
- workspace auto-switch issue: keep monitoring until more real usage confirms it is gone

## Success Criteria

- partner-integrations implementation can start immediately from a concrete contract
- no regression to current Senso / Opik / GitHub flow
- Blaxel and Redis are represented as real product concepts, not just notes
- backlog and sprint docs reflect the new direction clearly
