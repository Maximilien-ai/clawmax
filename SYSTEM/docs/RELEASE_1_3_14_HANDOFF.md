# ClawMax v1.3.14 Handoff

## Scope

`v1.3.14` is the dashboard reliability release on top of `v1.3.13`.

Shipped areas:

- workflow artifact notifications now prefer the real writer identity and suppress duplicate generic follow-up notifications
- agent status panels surface gateway restart-loop and session-drift diagnostics
- `Activity & Budget` refreshes automatically on return
- Communications supports bulk clear-history and uses the current communities/groups API routes
- the maintenance banner is environment-driven, renders correctly in local dev, and dismisses only for the current page session
- dashboard dev/prod serving is separated so Vite dev no longer risks stale built HTML taking precedence
- `SYSTEM/start.sh --restart -f` now reliably restarts old frontend/backend processes before tailing logs

## Web Team

Prepare the linked status page used by the maintenance banner.

The page should explicitly cover:

- when the maintenance window starts and ends
- when the maintenance is actively happening
- what happened after the window completes
- how users can save workspace changes before the window
- how users can export their workspace before the window
- how users can stop a workflow if they have intermediary work they want to preserve before maintenance
- what data is preserved

Required wording constraint:

- do not claim that every in-progress run is preserved automatically
- do say that completed workflow outputs and saved workspace data are not expected to be lost
- tell users with in-progress workflows to stop/export before the maintenance window if they need a clean checkpoint

Recommended status-page sections:

- `Scheduled window`
- `During maintenance`
- `After maintenance`
- `Save or export before the window`
- `In-progress workflows`
- `Data safety`

## CLI Team

Be aware of the following current dashboard/runtime behaviors:

- maintenance notices can now be surfaced from env without hardcoded ClawMax.ai messaging
- workflow artifact notifications are now attributed more aggressively to the actual agent/writer
- duplicate generic artifact notifications are suppressed once a writer-attributed notification exists
- dashboard agent-status diagnostics now call out restart-loop and session-drift patterns that may reflect CLI/gateway runtime issues
- the dashboard now expects the current communities/groups API shape and paths
- packaged/dashboard runtime version should align to `1.3.14`

CLI follow-through to watch:

- any gateway/session instability surfaced by the new dashboard diagnostics should be treated as a runtime-quality signal, not only a UI issue
- if maintenance guidance or workspace export/stop semantics differ from actual CLI/runtime behavior, the CLI/runtime contract needs to be corrected or documented before broader operator rollout
