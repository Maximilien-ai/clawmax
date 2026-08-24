# Release Review Audit - 2026-08-13

> Archived after the RC39 reviewer queue was superseded.

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

## RC39 Reviewer Queue

The RC39 queue replaces the unfinished RC38 queue with three end-to-end
journeys for Praveen's resolved dashboard reports:

1. Agent discovery plus model-fit and activity details under partial data.
2. Long-running, interrupted, and incomplete agent chat streams.
3. Workflow concurrency, cancellation, restart reconciliation, and newest-run presentation.

The seven RC38 journeys are preserved in the cumulative historical set and move
to Archived when RC39 starts; unfinished prior criteria are not presented as new
tester work. Release identity, health, unit/contract assertions, and issue-level
mechanics remain engineering evidence. The three retained journeys exercise the
user-visible consequences where independent judgment or a persistent runtime
still adds value.

Private product-plugin acceptance remains in the private plugin repository. This
public audit states only the ownership boundary and does not enumerate private
plugin implementation details or catalogs.
