# Template Catalog Audit: Lane and Filesystem Assumptions

Last updated: May 24, 2026

## Summary

This note records the first catalog-level audit pass for shipped organization templates, focused on the failure class tracked in GitHub issue `#132`.

Goal:

- reduce false success caused by helper-directory scans
- reduce accidental lane collisions on shared output targets
- reduce rerun behavior that depends on stale workspace residue

## Audited Batch

The audit focused on a first high-value batch of shipped templates that are either multi-lane, workflow-heavy, or likely to produce artifacts:

- `clawmax-system-test`
- `small-startup-team`
- `rag-team`
- `support-team`
- `conference-ops-hub`
- `speaker-event-studio`
- `small-event-planning-desk`
- `real-time-research-desk`
- `lu-ma-event-analysis-desk`
- `sales-team`

## Findings

### Hidden/helper directory scans

No shipped organization workflow content currently instructs agents to scan helper/runtime directories such as:

- `.git`
- `.openclaw`
- `AGENTS/archive`
- `WORKFLOWS/executions`

The only explicit directory-listing workflow in the catalog is the intentional `clawmax-system-test` filesystem check, which is a test fixture and not a production workflow pattern.

### Shared output naming

Shipped templates do include example artifact names, but the current audited batch does not show duplicate explicit artifact filenames reused across multiple workflows in the same template.

That lowers the risk of two lanes implicitly writing to the same named target during one template run.

### Rerun-sensitive behavior

The audited batch primarily uses:

- channel/status posts
- summary briefs
- example artifacts

rather than hard-coded helper-directory scans or execution-history scraping.

That means the main remaining rerun risk is not hidden-directory traversal, but external runtime state or manually requested file reuse.

## Guards Added

The template regression suite now enforces two catalog-level checks:

1. shipped organization workflow content must not reference hidden/helper runtime directories
2. shipped organization templates must not reuse the same explicit artifact filename across multiple workflows in the same template

These checks live in:

- `SYSTEM/dashboard/server/lib/templates.test.ts`

and run through the normal dashboard harness.

## Current Recommendation

Keep the catalog rules simple:

- avoid helper-directory scanning in workflow instructions
- keep explicit artifact filenames unique per template workflow when examples are needed
- prefer “post to Status / current group” over telling agents to infer success from old files

## Follow-up

If new templates introduce:

- helper-directory references
- execution-folder scanning
- duplicate explicit artifact names across lanes

they should be treated as regressions unless there is a strong template-specific reason and an explicit test allowance.
