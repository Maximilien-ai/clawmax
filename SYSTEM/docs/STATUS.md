# ClawMax Status

**Current Version**: v1.2.1
**Last Updated**: April 2, 2026
**Status**: Point release ready — integrations follow-through, import validation, and discovery suggestions are on main

---

## Current State

- `v1.2.1` ready on main — integrations polish, runtime follow-through, import validation, and discovery suggestions
- 39 organization templates + 12 reusable agent templates across Business, Technical, Personal, Science, Travel, Hobbies, and Family
- Interactive DAG visualization with edit mode, zoom, progress bars, and dependency management
- Workspaces Integrations for hosted/local models plus Senso, Opik, and GitHub status
- Shareable workspace dashboards with compact/standard/detail display modes
- Docker deployment support in the public repo
- Specs published: [templates](https://github.com/Maximilien-ai/templates) + [workflows](https://github.com/Maximilien-ai/workflows)

## v1.2.1 — Follow-through Point Release

### Integrations
- optional integration validation no longer blocks save for Gemini, Ollama, Opik, or other optional providers
- warning toasts now name the failing integrations and render above the modal
- discovered Gemini and Ollama models now appear in the preferred-model selector
- Ollama installed models can be refreshed and selected inline

### Runtime and Validation
- workspace-level Senso and GitHub defaults now persist and flow into apply/runtime paths
- `TEMPLATE.md` imports now validate against the shared schema before save

### Discovery
- Templates and Workflows search now suggests nearby starting points when exact matches are weak or absent

## v1.2.0 — Expansion Release

### Templates & Discovery
- 39 organization templates now shipped in the app and public templates repo
- new proposal families: Science, Travel, Hobbies, Family, and expanded Personal assistant/finance templates
- 12 reusable agent templates with richer detail files for swapping roles into teams
- template emojis across the catalog
- collapsible Agent / Organization / Workflow sections in Templates explorer
- template delete confirmation dialog for user-created templates

### Workspace Visibility
- shareable workspace dashboards with generated links
- compact / standard / detail display modes
- compact dashboard summary charts
- normalized workflow kickoff inputs and result artifacts in shared dashboards

### Integrations & Runtime
- Workspaces Integrations shell replacing the earlier BYOK-only framing
- Gemini and Ollama provider support
- Senso / Opik / GitHub surfaced as optional integrations with saved defaults and validation flow
- structured workflow input capture persisted in execution records

### Delivery
- canonical Docker deployment support in the public repo
- backlog / issue tracker cleanup and alignment

## Shipped Previously

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
