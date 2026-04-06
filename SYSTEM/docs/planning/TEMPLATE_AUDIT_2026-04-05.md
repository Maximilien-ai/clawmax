# Template Audit: April 5, 2026

> Scope: organization templates under `TEMPLATES/organizations/**/template.json`
> Excluded: nested agent templates under `small-startup-team/agents/**`
> Goal: verify each org template has a kickoff with structured input fields, useful intermediate workflow steps, and a meaningful completion/output step

## Summary

- Audited: `53` organization templates
- Structurally strong: `36`
- Usable but should improve: `16`
- Internal/special-case exception: `1`

## Audit Rule

A strong template should have:

1. A kickoff workflow with structured customization fields that can surface in the workflow input form
2. At least one useful intermediate step, ideally decomposed into sequential and/or parallel specialist work
3. A clear completion/output step that produces a useful result artifact, summary, review, digest, plan, report, or other user-facing outcome

## Strong Templates

These already fit the intended ClawMax pattern well enough for demos:

- `ai-model-eval-lab`
- `ai-research-lab`
- `arxiv-digest-lab`
- `biological-research-lab`
- `blog-launch-studio`
- `chief-of-staff`
- `clawmax-dev-team`
- `competitive-analysis-desk`
- `computer-science-lab`
- `conference-ops-hub`
- `dev-team`
- `email-calendar-manager`
- `engineering-team`
- `hr-team`
- `idea-to-site-studio`
- `investing-research-desk`
- `legal-team`
- `lu-ma-event-analysis-desk`
- `market-signal-desk`
- `marketing-team`
- `materials-discovery-lab`
- `mathematics-proof-studio`
- `meeting-capture-follow-up`
- `meeting-prep-desk`
- `personal-research-desk`
- `physics-research-group`
- `product-research-team`
- `real-time-research-desk`
- `sales-team`
- `small-startup-team`
- `speaker-event-studio`
- `specialty-retailer`
- `statistics-research-lab`
- `student-research`
- `tax-planning-desk`
- `technical-writing`

## Priority Fix Queue

These are the templates most worth improving next because they either lack a real final output step or are still too coarse for demos:

1. `rag-team`
   - No real kickoff customization block
   - No clear final synthesis/output workflow
   - High-value technical template, so this should move up

2. `support-team`
   - Good kickoff and operating lanes
   - Missing an explicit final support summary / escalation / KB output step

3. `data-team`
   - Has intermediate workflows
   - Missing a clear final report/review/synthesis step

4. `convenience-store`
   - Has multiple lanes
   - Missing a clear completion/output workflow

5. `travel-planning-desk`
   - Kickoff is good
   - Needs a final itinerary / booking packet / trip brief workflow

6. `small-event-planning-desk`
   - Kickoff plus useful middle steps
   - Needs a final host packet / run-of-show / final checklist step

## Secondary Fix Queue

These are lighter-weight personal/lifestyle templates that still need a stronger completion pattern or more decomposition:

- `family-ops-hub`
- `home-cooking-studio`
- `homework-support-team`
- `movie-club`
- `movie-trivia-night`
- `astronomy-club`
- `friday-night-movie-picker`
- `household-bills-desk`
- `photography-studio`
- `trip-memory-studio`

## Internal / Special Case

- `clawmax-system-test`
  - Missing a standard “Project Configuration” kickoff shape
  - This is acceptable as an internal/system validation template, so it should not block demo-template readiness

## Recommended Tomorrow Order

If template improvement work happens tomorrow, start here:

1. `rag-team`
2. `support-team`
3. `data-team`
4. `convenience-store`
5. `travel-planning-desk`
6. `small-event-planning-desk`

## Notes

- Several two-workflow personal templates are not strictly broken, but they are still thin compared with the newer kickoff → specialist lanes → final-output pattern.
- For demos, the most important gap is not raw template count. It is whether the template produces a visible, useful ending artifact without the user having to infer the outcome from chat alone.
