# ClawMax Status

**Current Version**: v1.1.8
**Last Updated**: March 22, 2026
**Status**: Release shipped, CI stabilization in progress, next sprint queued

---

## Current State

- `v1.1.8` is released and pushed to GitHub
- BYOK preview is in the dashboard and runtime execution now follows the intended user/system key policy
- GitHub OAuth is working locally, including redirect back to the dashboard app
- Local `./SYSTEM/test.sh` is passing again
- GitHub Actions now runs on `main` pushes and `v*` tags
- Latest follow-up work is focused on making clean-room CI deterministic

## Shipped Recently

### Auth, BYOK, and Release Readiness
- GitHub OAuth login/logout flow
- dashboard login hero refresh and post-auth redirect fixes
- visible user info + logout in the top bar
- BYOK preview wizard for OpenAI/Anthropic keys
- strict provider key precedence:
  - user agent/workflow execution prefers BYOK, then `USER_*`
  - system/dashboard-owned execution prefers `SYSTEM_*`
  - shell exports no longer implicitly control dashboard provider policy
- release checklist, OAuth docs, and env example refresh

### Dashboard UX and Scale
- workspace drag reordering
- templates table/list mode with sorting, select-all, bulk delete, and apply flows
- communication table/list mode with sorting and bulk actions
- agent config validation before save
- improved mobile agent detail panel
- templates/workflows/logs page shell alignment

### Quality and Contracts
- strict system template contract tests for `TEMPLATES/*`
- regression tests for:
  - workspace ordering
  - agent config validation
  - agent model parsing and persistence
  - runtime auth/model override execution
  - safe env / BYOK precedence
- CI now triggers on `main` and release tags

## Active Risks

- GitHub Actions on `main` is still being stabilized for true clean-room runs
- live GitHub issue list is stale and includes items already fixed in code
- secure multi-user BYOK storage is still deferred; current flow is intentionally a preview/dev slice
- OAuth still needs one clean-room test pass on a fresh machine/config, even though local dev flow is working

## Recommended Next Work

1. Finish CI clean-room stabilization and confirm a green `main` run on GitHub
2. Close or archive stale GitHub issues already fixed in code (`#38`, `#31`, `#30`, `#28`)
3. Build workflow table view for large-scale workflow management
4. Decide the next security/product slice:
   - secure per-user BYOK storage
   - `#29` Forward to group
   - workflow cron reliability (`#14`)

## Tomorrow Start Here

1. Check the latest GitHub Actions run on `main`
2. If green, do issue cleanup and start workflow table view
3. If red, fix the remaining clean-room failure before any feature work
4. Keep BYOK secure-storage work deferred until CI and workflow scale UX are in better shape
