# Sprint: March 31 – April 4, 2026

> **Pace:** 4 hours/day, 5 days = 20 hours total
> **Branch:** feature branches per item, merge to main daily
> **Testing:** run `./SYSTEM/test.sh integration` before each merge

## Goals

1. Fix bugs discovered during testing + user/team reports
2. Improve DAG UX (run buttons, execution counts)
3. Per-workspace budget isolation
4. Activity page improvements
5. Integration test expansion
6. Address CLI/backend team reported issues as they come in

## Monday (4 hrs) — Bug Fixes + DAG Polish

### DAG UX (2 hrs)
- [ ] **Run/restart button per node** — green ▶ on idle nodes, ↻ on completed nodes in DAG view
- [ ] **Execution count per node** — show runCount badge on each workflow node
- [ ] **Budget exceeded error message** — clear "workspace budget exceeded" when workflow fails due to budget

### Bug Fixes (2 hrs)
- [ ] **Workflow import ID mismatch** — use template's `id` field in createWorkflow instead of auto-generating from name
- [ ] **Activity page column sorting** — add sortable columns (age, agent, type, file)
- [ ] Address any issues reported by CLI/backend teams over weekend

## Tuesday (4 hrs) — Budget + Testing

### Per-Workspace Budget (2 hrs)
- [ ] **Workspace slug in Opik traces** — tag metering data with workspace ID
- [ ] **Per-workspace cost tracking** — separate budget enforcement per workspace
- [ ] **Budget notification improvement** — clear messaging when budget blocks execution

### Integration Test Expansion (2 hrs)
- [ ] **Test skill: workspace ls** — skill that lists workspace directory, add to system-test agents
- [ ] **Test: agent memory creation** — verify agents can create and persist memory files
- [ ] **Test: workflow with group communication** — verify agents post to groups during workflow execution
- [ ] Increase coverage toward 60%

## Wednesday (4 hrs) — Workflow v2 Continued

### Workflow Improvements (2 hrs)
- [ ] **DAG auto-advance on cron triggers** — cron-triggered completions should cascade
- [ ] **Workflow re-run resets downstream** — reset dependents to idle on re-trigger
- [ ] **Rate limit notification** — surface API rate limits as warning with retry suggestion

### Template Improvements (2 hrs)
- [ ] **Project context in IDENTITY.md on apply** — write repo/backlog info to every agent's identity
- [ ] **AI Generate outputs TEMPLATE.md** — wizard generates markdown format
- [ ] Address user-reported template issues

## Thursday (4 hrs) — Polish + Team Issues

### UX Polish (2 hrs)
- [ ] **Chat message normalization** — server-side: strip JSON wrappers, ANSI codes at API layer
- [ ] **Imported Shipables skills emoji** — skills from registry show emoji in cards
- [ ] **DAG line routing** — route connector lines around node bounding boxes

### Team Issues (2 hrs)
- [ ] Address CLI team issues (gateway process management, etc.)
- [ ] Address backend team issues
- [ ] Address user-reported issues from the week

## Friday (4 hrs) — Testing + Release

### Testing (2 hrs)
- [ ] Run full integration test suite
- [ ] Manual testing of all new features
- [ ] Fix any issues found
- [ ] Target: 70%+ test coverage on critical modules

### Release (2 hrs)
- [ ] Update CHANGELOG, README, STATUS
- [ ] Archive completed sprint plan
- [ ] Tag v1.1.22 (or higher based on changes)
- [ ] Update external repos (templates, workflows) if specs changed
- [ ] Prep next week's sprint

## Metrics

| Metric | Start (Mar 29) | Target (Apr 4) |
|--------|----------------|----------------|
| Unit tests | 78 | 100+ |
| Integration tests | 153 | 170+ |
| Test coverage (critical modules) | ~50% | 60-70% |
| Open backlog items | ~25 | <20 |
| Templates | 15 | 15+ |
| Workflows passing DAG | yes | yes + cron cascade |

## Backlog Reference

Active items from [BACKLOG.md](../BACKLOG.md):
- Budget: unclear error, per-workspace isolation, Opik workspace slug
- Activity: column sorting
- DAG: run button, execution count, line routing, cron cascade
- Testing: workspace ls skill, agent memory, group communication
- Workflow: ID mismatch import, re-run reset, rate limit notification
- Template: project context in identity, AI generate TEMPLATE.md
- Chat: server-side normalization
- Skills: Shipables emoji
- Gateway: process management (CLI team)
