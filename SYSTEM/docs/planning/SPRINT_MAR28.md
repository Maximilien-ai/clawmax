# Sprint: March 28, 2026 — Workflow v2 + Specs

> **Branch:** `sprint/mar28-workflow-v2`
> **Goal:** WORKFLOW.md format, TEMPLATE.md refinement, notification actions, workflow v2 foundations
> **Merge strategy:** Bug fixes cherry-picked to main ASAP, feature branch merged when stable

## Morning Block (3 hrs) — Specs & Formats

### 1. Simplify TEMPLATE.md frontmatter (~30 min)
- [x] Audit: compare current TEMPLATE.md frontmatter with SKILL.md
- [ ] Move heavy data (agents, workflows, communities, groups) into markdown body sections
- [ ] Keep frontmatter minimal: name, type, version, category, author, tags, description
- [ ] Structured body sections: `## Agents`, `## Communities`, `## Groups`, `## Workflows`
- [ ] Update parser to handle both formats (backward compatible)
- [ ] Regenerate all 14 TEMPLATE.md files with new format
- [ ] Tests

### 2. Create WORKFLOW.md format (~30 min)
- [ ] Define WORKFLOW.md schema (YAML frontmatter + markdown body)
- [ ] Frontmatter: name, schedule, executionMode, owner, targeting, enabled
- [ ] Markdown body: workflow instructions (what agents do)
- [ ] Parser: `gray-matter` to read, validate against workflow schema
- [ ] Workflow system auto-detects .json vs .md
- [ ] `workflowToMarkdown()` serializer
- [ ] Tests

### 3. Specs & Schemas (~30 min)
- [ ] Create `SYSTEM/docs/specs/TEMPLATE_MD_SPEC.md` — formal spec for TEMPLATE.md format
- [ ] Create `SYSTEM/docs/specs/WORKFLOW_MD_SPEC.md` — formal spec for WORKFLOW.md format
- [ ] Both specs include: format overview, YAML schema, body structure, examples, validation rules
- [ ] Add backlog item: publish specs to `Maximilien-ai/clawmax-specs` after April 4

### 4. Import/Export via .md files (~30 min)
- [ ] `POST /api/templates/import-md` — accept TEMPLATE.md content, validate, save
- [ ] `GET /api/templates/:type/:slug/export-md` — export as TEMPLATE.md
- [ ] `POST /api/workflows/import-md` — accept WORKFLOW.md content, validate, save
- [ ] `GET /api/workflows/:id/export-md` — export as WORKFLOW.md
- [ ] Schema validation on import for both formats
- [ ] UI: export button on template/workflow detail views

## Midday Block (2 hrs) — Template/Workflow Validation & UX

### 5. Template-agent cross-validation (~20 min)
- [ ] Validate all templates reference agents for which we have templates or valid IDs
- [ ] Warn on import if template references unknown agents
- [ ] Add validation to template save/import endpoints
- [ ] Test

### 6. Workflow customization UX (~40 min)
- [ ] Dynamic form fields for kickoff Project Configuration (parse `[placeholder]` markers)
- [ ] Render as labeled inputs in Apply Template modal
- [ ] "Edit full content" toggle to show raw markdown textarea
- [ ] Pre-fill GitHub repo field from the GitHub coordination checkbox
- [ ] Test

### 7. Notification actions (~1 hr)
- [ ] Add action buttons to notification items: Pause, Restart, Open Chat, View Workflow
- [ ] `POST /api/notifications/:id/action` endpoint
- [ ] Actions resolve the notification after execution
- [ ] Blocker notification type: `agent-needs-decision` with structured payload
- [ ] Render basic blocker UI (choice buttons, approval yes/no)
- [ ] Test all notification types with mock data

## Afternoon Block (3 hrs) — Workflow v2

### 8. Workflow progress tracking (~45 min)
- [ ] Add `progress` field to workflow execution model (0-100%)
- [ ] `POST /api/workflows/:id/progress` — agents report progress
- [ ] Progress bar in Workflows page (per-workflow)
- [ ] Aggregate progress for workflow collections
- [ ] Test

### 9. Workflow sequencing & DAG (~1 hr)
- [ ] Add `depends_on` field to workflow schema
- [ ] Workflow types: `once`, `recurring`, `conditional`
- [ ] Execution engine: check dependency completion before starting
- [ ] Parallel execution when no dependencies
- [ ] Sequential gates for ordered workflows
- [ ] Test

### 10. Live execution & validation (~1 hr)
- [ ] Apply Dev Team or Technical Writing template
- [ ] Verify all workflows execute (kickoff, recurring, manual)
- [ ] Test blocker surfacing with real agent
- [ ] Fix any issues found
- [ ] Update templates and specs with learnings

## End of Day (~30 min) — Cleanup

### 11. Cleanup & release prep
- [ ] Check off all completed backlog items
- [ ] Update BACKLOG.md with new items
- [ ] Run full test suite (target: 130+ tests)
- [ ] Archive completed planning docs
- [ ] Commit, push, consider point release if stable

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
