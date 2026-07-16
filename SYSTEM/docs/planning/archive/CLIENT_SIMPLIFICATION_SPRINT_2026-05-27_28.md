# Client Simplification Sprint: May 27-28, 2026

> Goal: simplify the client console surfaces without removing core capability or making the product unfamiliar to existing users

## Guardrails

- Keep existing power features, but move lower-frequency actions behind `Actions`, drawers, or expanders.
- Do not change core terminology unless the current label is clearly redundant or confusing.
- Prefer one primary action and at most two visible secondary actions per page.
- Reduce explanatory copy before removing capability.
- Stop after each major surface for manual review before continuing.

## Day 1

### 1. AI Builder first

- simplify the top layout so the conversation and recommendation stay dominant
- shorten or remove redundant helper copy
- keep one primary recommendation action plus up to two visible alternates
- move matched assets, extended reasoning, session utilities, and lower-value detail behind collapsible sections
- keep prompt controls compact and in one row where possible

### 2. Builder validation

- verify the main Builder paths still feel obvious:
  - existing agent
  - skill follow-through
  - agent template
  - team template
  - create new with AI
- check first-use onboarding + Builder entrypoint still make sense together

## Day 2

### 3. Templates and Agents

- Templates:
  - keep one primary create path
  - move import/export/refresh variants into `Actions`
  - reduce visible counts and breakdown text
- Agents:
  - keep create primary
  - move import, AI create variants, bulk utilities, and less-common actions into `Actions`
  - reduce filter/header clutter

### 4. Skills and Workflows

- Skills:
  - collapse create/import/export into one consistent menu
  - make assign-to-agent the main visible flow
- Workflows:
  - keep create primary
  - move import/export/advanced utilities into `Actions`
  - reduce above-the-fold control density

### 5. Secondary surfaces if time remains

- Communications
- Activity & Budget
- DocHub
- Organization
- Logs

## Review Checkpoints

1. After Builder simplification pass
2. After Templates + Agents pass
3. After Skills + Workflows pass

## Definition of Done for this sprint

- Builder is visibly simpler on first load
- at least three other high-traffic client surfaces have reduced first-screen complexity
- no admin-only surfaces were changed as part of this sprint
- targeted tests pass
- manual smoke review confirms existing users can still find core actions quickly
