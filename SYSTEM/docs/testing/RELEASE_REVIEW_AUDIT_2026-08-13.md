# Release Review Audit - 2026-08-13

## Decision

The Review plugin is an independent acceptance queue, not a second automated
test suite. A current release check is allowed only when it requires:

- human judgment about usefulness, clarity, or product behavior; or
- an external environment engineering cannot reproduce easily, such as a real
  OAuth provider or a persistent customer-style upgrade.

Every current item records one of those reasons in `reviewReason`. Deterministic
checks remain required release evidence, but engineering owns them through unit,
integration, browser, source-contract, CI, image, and registry validation.

## Inventory Audited

- Active workspace Review records: 59 total, 51 unfinished, all grouped under
  `2.0.0 previous RCs`.
- Suggested historical sets: 14 checks for 1.9.9 and 72 checks for earlier 2.0
  candidates.
- Suggested RC37 set before pruning: 20 checks.

The unfinished historical records mixed valuable acceptance history with stale
release identity checks, catalog counts, source/UI contracts, CI architecture
checks, and repeated component-level checks. They are preserved, but a new
focused checklist moves superseded releases to Archived regardless of completion.

## RC37 Reviewer Queue

The RC37 queue is reduced from 20 to seven end-to-end journeys:

1. Explicit Builder intent and matching AI Create actions.
2. AI Editor and Expand with AI usefulness across real surfaces.
3. Lifecycle X-rays against real agent and workflow history.
4. Activity-sharing visibility, comprehension, and per-destination revocation.
5. Real Gmail OAuth connect, refresh, and disconnect.
6. Real Microsoft 365 OAuth connect, refresh, and disconnect.
7. Chat/workflow session recovery in a persistent upgraded workspace.

Current checks removed from reviewer ownership include release identity, health,
plugin inventory, skill catalog size, component-level Lifecycle graph variants,
loading-state presence, and generic restart persistence. Existing automated and
CI gates already cover these deterministically; the retained journeys exercise
their user-visible consequences where independent judgment still adds value.

Private product-plugin acceptance remains in the private plugin repository. This
public audit states only the ownership boundary and does not enumerate private
plugin implementation details or catalogs.
