# Client Simplification Pass 1 Archive

> Completed: May 27, 2026
> Branch: `simplify-client-surfaces`

## Scope Completed

- AI Builder first-pass simplification
- client navigation regrouping and default Builder landing path
- Templates first-pass simplification
- Agents first-pass simplification
- Skills first-pass simplification

## What Shipped

### Builder

- reduced duplicated intro/start text
- kept the conversation area dominant
- removed non-actionable share/session header clutter
- restored a visible clear/reset flow
- widened the main layout on larger screens
- improved light-mode readability for transcript controls

### Navigation

- grouped primary client surfaces into clearer product clusters
- made Builder the default entry surface
- collapsed lower-frequency system pages under `System`

### Templates

- simplified header copy and action labels
- promoted one clear primary `Create` action
- added type tabs for `All`, `Agents`, `Teams`, and `Companies`
- removed workflow templates from the Templates client surface
- removed redundant section twisties once tabs became the primary navigator
- added export and resettable narrowing flows

### Agents

- simplified header naming and counts
- promoted `Create` as the primary action
- moved refresh/restart into `Actions`

### Skills

- aligned header actions with Templates
- moved selected-agent focus inline with the page title
- reduced above-the-fold control density
- added matching grid/list view behavior
- replaced the fake compact-card list with a real denser list renderer

## Follow-Through Left Open

- Workflows simplification pass
- Communications simplification pass
- another pass on Activity / DocHub / other lower-frequency client surfaces
- client-feedback-driven tuning of what stays visible by default

## Validation

- targeted `npm run typecheck`
- iterative manual review during implementation
