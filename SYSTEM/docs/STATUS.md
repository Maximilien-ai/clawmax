# ClawMax Status

**Current Version**: v1.1.16
**Last Updated**: March 28, 2026
**Status**: Deep Agents Hackathon features merged, all tests passing (121 integration + 25 unit)

---

## Current State

- `v1.1.16` released — Deep Agents Hackathon (March 27) features merged to main
- 14 organization templates across Business, Technical, and Personal categories
- Template wizard, Shipables.dev skill marketplace, bulk operations, GitHub coordination
- 121 integration tests + 25 unit tests all passing
- AI generator works with both OpenAI and Anthropic keys

## v1.1.16 — Deep Agents Hackathon Release

Built at the [Deep Agents Hack](https://luma.com/deepagentshack) hackathon (March 27, 2026). Major template and skills infrastructure release.

### Template System
- **Template Wizard** — 5-step creation: Team Type, Composition, Communication, Workflows, Preview
- **AI Generate** — describe a team in natural language, AI fills all wizard steps
- **14 organization templates** — Sales, HR, Support, Legal, Marketing, Convenience Store, Specialty Retailer, Dev Team, Data Team, RAG Team, Engineering, Small Startup, Student Research, Technical Writing
- **TEMPLATE.md format** — templates as YAML frontmatter + markdown (auto-detected alongside template.json)
- **Category filters** — Business/Technical/Personal pill buttons on Templates page
- **Kickoff workflows** — every template has a kickoff with user-fillable Project Configuration
- **Editable workflow content** — customize all workflows (kickoff fields, instructions) before applying
- **GitHub coordination toggle** — checkbox adds github/gh-issues skills + injects repo instructions into all workflows

### Skills & Marketplace
- **Shipables.dev integration** — search, browse, and install from 1,000+ skills registry
- **Category browsing** — quick-filter pills (github, slack, api, data, ai, web, devops, crm)
- **Bulk skill assignment** — add skills to multiple agents at once from Agents page
- **One-click install** — install button per skill with "Installed" state tracking

### Bug Fixes
- **AI generator Anthropic fallback** — works with Anthropic-only BYOK keys (issue #49)
- **Smart model defaults** — defaults to Anthropic model when only Anthropic key is set
- **Null guard fixes** — Activity, Agents, Workflows, TopBar pages guarded against undefined API data
- **OAuth default fix** — shows setup instructions instead of broken button when not configured
- **Chat error styling** — ANSI code stripping, dark mode, error message detection, dismiss button
- **Template import fix** — generates IDENTITY.md from template data when no agent files exist
- **Workflow creation fix** — auto-assigns owner for managed workflows, accepts "once" schedule

### Testing
- 121 integration tests (up from 113)
- 25 unit tests (up from 15)
- New coverage: TEMPLATE.md parsing, template categories, Shipables registry, workflow overrides, bulk skills, defensive agent import

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
