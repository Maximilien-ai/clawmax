# ClawMax Status

**Current Version**: v1.2.5
**Last Updated**: April 3, 2026
**Status**: Point release ready — test harness stability, template DAG/tag audit, and shared dashboard readability fixes are on main

---

## Current State

- `v1.2.5` ready on main — system-test harness fixes, template dependency/tag audit, and shared dashboard spend/markdown improvements are on main
- 53 organization templates + 25 reusable agent templates across Business, Technical, Personal, Events, Science, Travel, Hobbies, Family, Markets, and launch/research use cases
- Interactive DAG visualization with edit mode, zoom, progress bars, and dependency management
- Workspaces Integrations for hosted/local models plus Senso, Opik, and GitHub status
- Shareable workspace dashboards with compact/standard/detail display modes
- Docker deployment support in the public repo
- Specs published: [templates](https://github.com/Maximilien-ai/templates) + [workflows](https://github.com/Maximilien-ai/workflows)

## v1.2.5 — Test Harness and Dashboard Reliability

### Test Harness and Template Apply
- `SYSTEM/test.sh` now recreates `ClawMax System Test` before apply so stale workflow files do not leak into the integration run
- integration tests now wait for template-imported workflows to become visible before asserting and triggering them
- audited multi-workflow org templates so kickoff/follow-on dependencies are preserved
- normalized template tags so every community, group, and workflow has tags

### Shared Dashboard Readability
- notifications, workflow summaries, and group chats now render markdown properly
- dashboard activity panels now scroll internally instead of stretching awkwardly
- workflow spend now includes traced agent-call cost from workflow runs

## v1.2.4 — Setup, Doctor, and Dashboard Polish

### Setup and Auth
- `setup.sh` now offers local dev Email OTP, bypass, GitHub OAuth, and production Email OTP
- local dev setup now asks for the login email and points developers to `.clawmax-otp-dev.json`
- auth docs now show the recommended local-tool/bootstrap defaults for Email OTP and remove stale GitHub auth guidance

### Doctor and Navigation
- Doctor UI now survives partial or error payloads without crashing
- doctor backend returns a consistent empty-state response when no agents directory exists
- sidebar now groups `Templates/Skills` separately from `Activity/System & Logs`
- template prereq warnings now point users to the in-product Doctor flow instead of the old shell script

### Workspace Dashboards
- shared workspace dashboards now render correctly in both light and dark mode
- compact dashboard defaults are tighter and closer to a true one-page summary
- standard/detail dashboards now give workflows full-width room when result sections are long

## v1.2.3 — Auth and Template Expansion

### Authentication
- added Email OTP dashboard auth mode for single-user cloud/on-prem installs
- local developer OTP mode now writes the latest code to `.clawmax-otp-dev.json` and the login UI points developers to it
- OTP delivery now uses ClawMax-styled HTML + text emails aligned with the web/backend email pattern
- added focused OTP auth tests and wired them into `SYSTEM/test.sh`

### Templates
- added 10 new proposal templates across movies, astronomy, paper digests, market signals, AI model evaluation, product research, competitive analysis, rapid websites, and blog launch
- expanded the reusable agent template library to 25 roles
- synced the public `Maximilien-ai/templates` repo to 50 validated template directories

## v1.2.2 — Events and Chat Point Release

### Templates and Discovery
- added `Small Event Planning Desk`, `Speaker Event Studio`, and `Conference Ops Hub`
- Templates explorer now has a first-class `Events` filter chip
- the new event templates are mirrored into the public templates repo for customer sharing

### Communication and Chat
- group/community posts now fan out to all members by default unless the user narrows with explicit `@mentions`
- agent chat now streams live stdout deltas through the SSE path instead of waiting for the full turn to finish
- the agent chat route now passes the explicit dashboard session id through to OpenClaw for better continuity

### Tracker and Docs
- closed the default-channel-mentions UX issue
- refreshed `TESTING_GUIDE.md` for the current system-test flow and custom-port behavior
- created a focused follow-up issue for event-template customer validation and refinement (`#95`)

## v1.2.1 — Follow-through Point Release

### Integrations
- optional integration validation no longer blocks save for Gemini, Ollama, Opik, or other optional providers
- warning toasts now name the failing integrations and render above the modal
- discovered Gemini and Ollama models now appear in the preferred-model selector
- Ollama installed models can be refreshed and selected inline

### Runtime and Validation
- workspace-level Senso and GitHub defaults now persist and flow into apply/runtime paths
- `TEMPLATE.md` imports now validate against the shared schema before save
- rerunning an upstream workflow now resets the downstream DAG branch for a truthful fresh run
- group-targeted workflows now explicitly use the current workflow group channel rather than stale session-label assumptions

### Discovery
- Templates and Workflows search now suggests nearby starting points when exact matches are weak or absent

### Export, Test, and Catalog Polish
- workspace zip exports download reliably and include a recovery manifest
- deleting agents fully removes shared test residue from `~/.openclaw/agents`
- `SYSTEM/test.sh` supports custom dashboard ports and resolves the real system-test workspace cleanly
- packaged ClawMax repo skills like `workspace-ls` now appear in Skills Manager

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
- Email OTP login for single-user cloud/on-prem and local developer flows
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

- duplicate agent IDs across multiple workspaces can still confuse temp chat/runtime resolution and show the wrong model/provider/session history in ad-hoc chats (`#94`)
- Anthropic per-agent auth/runtime behavior still needs explicit cleanup (`#8`)
- GitHub Actions on `main` is still being stabilized for true clean-room runs (`#11`)
- secure multi-user BYOK storage is still deferred; current flow is intentionally a preview/dev slice
- event planning templates are still proposal/early-idea and need real customer validation (`#95`)

## Recommended Next Work

1. Finish `#94` temp chat/runtime wrong-workspace resolution end-to-end
2. Fix `#8` Anthropic per-agent auth/runtime behavior cleanly
3. Validate and refine the new event templates with real customer feedback (`#95`)
4. Keep `#11` open until a true fresh-machine setup run is completed

## Tomorrow Start Here

1. Start with `#94`
2. Then fix `#8`
3. Review customer feedback on the new event templates (`#95`)
4. If there is time, reassess whether `#11` can be executed on a truly fresh machine
