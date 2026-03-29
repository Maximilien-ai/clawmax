# Multimodal Frontier Hackathon Backlog

> Branch: `hackathon/multimodal-frontier-hack-mar28`
> Working rule: move items from backlog into execution only after the 10-template slate and top-3 selection are locked.

## Ready Now

- [x] Finalize 10 multimodal template briefs
- [x] Score every candidate against autonomy / tool use / demo speed
- [x] Confirm the three showcase execution templates
- [x] Confirm the simpler Senso-first foundation execution target
- [x] Define shared Senso-backed skills
- [x] Confirm Senso workspace strategy for shared memory and evidence
- [x] Define sponsor-tool mapping for each selected template
- [x] Create demo data packs for selected templates
- [x] Add local `SENSO_API_KEY` without committing it
- [x] Search Shipables.dev / SkillsHub for required skills

## Template Slate

- [x] Retail Watchtower
- [x] Customer Signal Desk
- [x] Brand Pulse Room
- [x] Store Ops Copilot
- [x] Multimodal Incident Response Team
- [x] Visual QA Lab
- [x] Real-Time Research Desk
- [x] Clinic Intake Triage
- [x] Community Safety Monitor
- [x] Creative Review Studio

## Selected For Execution

- [x] Visual QA Lab
- [x] Customer Signal Desk
- [x] Retail Watchtower

## Foundation Execution Target

- [x] Real-Time Research Desk

## Shared Skills

- [x] `senso-ingest`
- [x] `senso-search`
- [ ] `senso-generate`
- [ ] `signal-triage`
- [ ] `action-router`
- [ ] `learning-loop`
- [ ] `senso-mcp`
- [ ] `demo-narrator`

## Demo Infrastructure

- [ ] Decide whether demo artifacts live in this repo or a special GitHub repo
- [x] Prepare screenshots / workflow traces / prompt snippets for the 3-minute demo
- [ ] Make sponsor-tool usage explicit in UI and docs
- [x] Prepare “before / after / acted” narrative for each selected template
- [x] Create a one-page ClawMax.ai follow-up presentation with QR code in the hack folder

## Skill Ecosystem

- [x] Reuse Shipables.dev skills wherever they fit
- [x] Reuse SkillsHub/workspace skills wherever they fit
- [x] Publish any missing generally useful hackathon skill we create

## Completed Today

- [x] `Real-Time Research Desk` concrete template asset
- [x] Hackathon screenshot pack curated for the research desk demo
- [x] Fallback final brief artifact created for demo safety
- [x] Short live-demo talking points created
- [x] `senso-ingest-clawmax` visible in the active demo workspace
- [x] `senso-search-clawmax` visible in the active demo workspace

## Cleanup / Test Tomorrow

- [ ] Verify `Real-Time Research Desk` applies cleanly into the active workspace without path mismatches
- [ ] Re-test workflow dependency rendering and remove temporary DAG fallbacks if the real lines render correctly
- [ ] Re-run kickoff -> intake -> retrieval -> brief with no manual operator hints
- [ ] Confirm workflow progress updates visually during live runs
- [ ] Confirm Senso auth/env propagation works for agent runtime without host-side intervention
- [ ] Confirm agent membership and targeting match active `openclaw.json`
- [ ] Decide which hackathon-only files should be kept, cleaned up, or published
- [ ] Run branch CI after PR creation and resolve any branch-only failures

## Stretch

- [ ] Add a fourth template if the first three execute quickly
- [ ] Publish a reusable multimodal template pack
- [ ] Add a judge-facing README with architecture and sponsor mapping
