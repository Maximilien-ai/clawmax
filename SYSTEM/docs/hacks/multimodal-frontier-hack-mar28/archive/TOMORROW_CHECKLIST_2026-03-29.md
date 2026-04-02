# Tomorrow Checklist

## Goal

Get `hackathon/multimodal-frontier-hack-mar28` into a clean, pushable state without breaking the current demo path.

## Keep Stable Tonight

- [x] Do not change runtime behavior unless needed for a finalist presentation
- [x] Limit updates to docs, notes, and explicit follow-up tasks

## First Validation Pass

- [ ] Confirm active workspace path at runtime matches the intended demo workspace
- [ ] Confirm `senso-ingest-clawmax` and `senso-search-clawmax` still appear in the Skills tab after restart
- [ ] Confirm `Real-Time Research Desk` template applies cleanly with agents, workflows, and models intact
- [ ] Confirm Senso options still show in org-template apply

## Workflow / Runtime Checks

- [ ] Re-run kickoff -> evidence intake -> context retrieval -> brief & action
- [ ] Confirm workflow dependencies render correctly in DAG view
- [ ] Confirm workflow progress visibly updates during execution
- [ ] Confirm no workflow targets missing agents from active `openclaw.json`
- [ ] Confirm agent runtime inherits `SENSO_API_KEY` without manual host-side rescue

## Cleanup Decisions

- [ ] Decide whether temporary DAG dependency fallback UI should stay or be removed
- [ ] Decide whether active-workspace skill copies should be formalized or replaced with a cleaner workspace fix
- [ ] Decide which hackathon-only docs/artifacts belong in the repo long-term
- [ ] Decide whether `Real-Time Research Desk` is ready to keep as a system template or should remain experimental

## Push Readiness

- [x] Run `npm run typecheck` in `SYSTEM/dashboard`
- [x] Run the dashboard smoke path needed for template apply + workflow execution
- [ ] Review `git status` for hack-only edits vs generally useful product changes
- [ ] Split commits into docs-only vs product/runtime changes
- [ ] Use fuller commit messages with prefix + short summary paragraph

## Current Validation Notes

- [x] `npm run typecheck` passed in this session
- [x] Local `./SYSTEM/test.sh` reported green outside this session
- [x] Current `main` CI is green on GitHub Actions
- [ ] Confirm branch CI after PR submission
