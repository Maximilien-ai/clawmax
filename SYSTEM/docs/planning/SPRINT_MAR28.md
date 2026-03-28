# Sprint: March 28, 2026 — Workflow v2 + Specs

> **Branch:** `sprint/mar28-workflow-v2`
> **Goal:** WORKFLOW.md format, TEMPLATE.md refinement, notification actions, workflow v2 foundations
> **Merge strategy:** Bug fixes cherry-picked to main ASAP, feature branch merged when stable

## Morning Block (3 hrs) — Specs & Formats

### 1. Simplify TEMPLATE.md frontmatter (~30 min) DONE
- [x] Audit: compare current TEMPLATE.md frontmatter with SKILL.md
- [x] Move heavy data (agents, workflows, communities, groups) into markdown body sections
- [x] Keep frontmatter minimal: name, type, version, category, author, tags
- [x] Structured body sections: `## Agents`, `## Communities`, `## Groups`, `## Workflows`
- [x] Update parser to handle both formats (backward compatible)
- [x] Regenerate all 14 TEMPLATE.md files with new format (248→~19 lines frontmatter)
- [x] Tests (28 unit tests, all passing)

### 2. Create WORKFLOW.md format (~30 min) DONE
- [x] Define WORKFLOW.md schema (YAML frontmatter + markdown body)
- [x] Frontmatter: name, schedule, executionMode, owner, targeting, enabled
- [x] Markdown body: workflow instructions (what agents do)
- [x] Parser: `parseWorkflowMd()` with `gray-matter`
- [x] Workflow system already uses .md format natively
- [x] `workflowToMarkdown()` serializer
- [x] Round-trip tests passing

### 3. Specs & Schemas (~30 min) DONE
- [x] Create `SYSTEM/docs/specs/TEMPLATE_MD_SPEC.md` — formal spec
- [x] Create `SYSTEM/docs/specs/WORKFLOW_MD_SPEC.md` — formal spec
- [x] Both specs include: format overview, YAML schema, body structure, examples, validation rules
- [ ] Add backlog item: publish specs to `Maximilien-ai/clawmax-specs` after April 4

### 4. Import/Export via .md files (~30 min) DONE
- [x] `POST /api/templates/import-md` — accept TEMPLATE.md content, validate, save
- [x] `GET /api/templates/:type/:slug/export-md` — export as TEMPLATE.md
- [x] `POST /api/workflows/import-md` — accept WORKFLOW.md content, validate, save
- [x] `GET /api/workflows/:id/export-md` — export as WORKFLOW.md
- [x] Schema validation on import for both formats
- [ ] UI: export button on template/workflow detail views

## Midday Block (2 hrs) — Template/Workflow Validation & UX

### 5. Template-agent cross-validation (~20 min) DONE
- [x] validateTemplateReferences() — checks agents, groups, communities, workflows
- [x] Warns on import if template references unknown agents/groups
- [x] Added to import-md endpoint (returns warnings)
- [x] 3 unit tests

### 6. Workflow customization UX (~40 min) DONE
- [x] Dynamic form fields for kickoff Project Configuration (parse `[placeholder]` markers)
- [x] Render as labeled inputs — smart types: dropdown, checkbox, textarea, text
- [x] Paginated wizard: one workflow per page with Previous/Next navigation
- [x] "Edit markdown" toggle for full control
- [x] Structured dropdown options in 8 templates (SLA, CRM, ATS, branch strategy, etc.)
- [x] Pre-fill GitHub repo field from the GitHub coordination checkbox

### 7. Notification actions (~1 hr) DONE
- [x] `POST /api/notifications/:id/action` endpoint — resolve with action
- [x] `GET /api/notifications/blockers/:workflowId` — query blockers
- [x] Blocker types: approval (approve/reject), choice (options), input, delegation
- [x] Render approval buttons, choice buttons, progress bar in NotificationCenter
- [x] Custom action buttons from notification actions array
- [x] Tests

## Afternoon Block (3 hrs) — Workflow v2

### 8. Workflow progress tracking (~45 min) DONE
- [x] Add `progress` and `status` fields to Workflow model
- [x] `POST /api/workflows/:id/progress` — agents report progress (0-100)
- [x] Progress creates/updates workflow-progress notification with progress bar
- [ ] Progress bar in Workflows page (per-workflow) — UI pending
- [ ] Aggregate progress for workflow collections — pending

### 9. Workflow sequencing & DAG (~1 hr) DONE (backend)
- [x] Add `dependsOn` field to workflow schema
- [x] Workflow types: `once`, `recurring`, `conditional`
- [x] `GET /api/workflows/:id/dependencies` — check if deps are met
- [x] `POST /api/workflows/:id/blocker` — agents declare blockers
- [ ] Execution engine: auto-check deps before starting — pending
- [ ] DAG visualization — future

### 10. Workflow DAG Visualization (~1 hr)
- [ ] WorkflowDAG component — CSS grid + SVG connector lines
- [ ] Group workflows into parallel lanes and sequential rows from dependsOn
- [ ] Color-code by status: gray=idle, sky=running, emerald=completed, amber=blocked
- [ ] Inline progress bars per workflow
- [ ] Click to select/open workflow detail
- [ ] Add to Workflows page as toggle view (list vs DAG)
- [ ] Test with template that has dependencies

### 11. Live execution & validation (~1 hr)
- [ ] Apply Dev Team or Technical Writing template
- [ ] Verify all workflows execute (kickoff, recurring, manual)
- [ ] Test blocker surfacing with real agent
- [ ] Fix any issues found
- [ ] Update templates and specs with learnings

## End of Day (~30 min) — Cleanup

### 11. Cleanup & release prep DONE
- [x] Check off all completed backlog items
- [x] Update BACKLOG.md with new items (gateway process management)
- [x] Run full test suite — 133 integration + 31 unit, all passing
- [ ] Archive completed planning docs
- [x] v1.1.17 released and tagged

## Dependencies & Order

```
1 (TEMPLATE.md) → 3 (specs) → 4 (import/export)
2 (WORKFLOW.md) → 3 (specs) → 4 (import/export)
5 (validation) — independent
6 (UX) — after 1
7 (notifications) → 8 (progress) → 9 (DAG) → 10 (execution)
```

Items 1-4 are parallelizable with 5-6. Items 7-10 are sequential.

## MVP if behind

If behind schedule, prioritize:
1. WORKFLOW.md format + spec (most reusable)
2. Notification actions (unblocks workflow progress)
3. Workflow progress tracking (visible value)

Skip if needed: DAG visualization, full import/export UI, dynamic form fields
