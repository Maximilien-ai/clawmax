# Partner Integrations Plan

> Date: April 7, 2026
> Goal: have a credible partner-ready integrations story by end of day April 8, 2026 for Blaxel and Redis conversations

## Product Goal

Redesign Workspaces Integrations so the user first configures core execution providers and then optionally configures third-party partner integrations on dedicated pages.

This must preserve current value and behavior for:

- Senso
- Opik
- GitHub

Then add:

- Blaxel
- Redis

## Principles

1. Keep the core LLM/provider step first.
2. Make partner pages optional and allowlisted by environment or instance config.
3. Do not hardcode future partner behavior directly into the wizard if a small metadata contract can express it.
4. Do not allow arbitrary package execution from free-form user input for partner skill installation.
5. Preserve the current Senso-style flow where integrations can influence template apply and workflow execution.

## Configuration Direction

### Visible partners

Support a configured allowlist for which partner pages appear:

- instance provisioning / web-team-selected partner list
- env fallback: `WORKSPACES_INTEGRATIONS_THIRD_PARTIES=senso,opik,github,blaxel,redis`

### Partner metadata

Use structured metadata plus markdown copy:

- `PARTNERS/<slug>/partner.json`
- `PARTNERS/<slug>/PARTNER.md`
- optional assets such as `logo.svg`

Later support external roots, likely:

- `CLAWMAX_EXTRA_PARTNER_DIRS=/path/a,/path/b`

This keeps the first version local while making future externalization to `Maximilien-ai/partners` straightforward.

## Scope For April 8

### 1. Generic integrations redesign

- Keep first step focused on providers / execution path
- Add partner selection step
- Render one page per selected partner
- Save per-workspace partner defaults alongside existing workspace integrations

### 2. Baseline partner parity

Preserve or reframe existing integrations as partner pages:

- Senso
- Opik
- GitHub

### 3. New partner pages

#### Blaxel

Capture:

- API key / token
- account / org / project identifiers if needed
- default sandbox / environment / region if applicable
- optional enable-for-template-apply default

#### Redis

Capture:

- endpoint / URL
- token / API key
- database / namespace defaults
- optional memory scope defaults

### 4. Curated skill-install flow

Add partner-owned install actions, not arbitrary free-form npm execution.

Initial target:

- Blaxel installer via curated action for `npx skills add blaxel-ai/agent-skills`

Decision:

- expose this from the Blaxel integration page first
- optionally later promote it into Skills Import as a dedicated “Partner installer” source

### 5. Template apply hooks

Extend the current Senso model so templates can opt into configured partner integrations.

Minimum behavior:

- apply-time toggle for enabled/configured partners
- inject runtime context and defaults
- assign/install required partner skills where safe and curated

### 6. Initial template pack

Blaxel:

- sandbox app-builder team
- sandbox code-experiment team

Redis:

- memory-backed research team
- memory-backed support / recall team

Combined:

- RAG + Blaxel deploy team
- idea-to-app sandbox team with Redis memory

## File / Module Direction

Likely primary touch points:

- `SYSTEM/dashboard/client/src/components/ByokWizard.tsx`
- `SYSTEM/dashboard/server/routes/integrations.ts`
- `SYSTEM/dashboard/server/lib/workspace-integrations.ts`
- `SYSTEM/dashboard/server/lib/integration-validation.ts`
- `SYSTEM/dashboard/client/src/components/ApplyOrgTemplateModal.tsx`
- `SYSTEM/dashboard/client/src/pages/SkillsTest.tsx`
- new partner loader / schema under server + client shared types

## Risks

### Over-generalizing partner plugins

Avoid spending tomorrow building a full partner plugin system. Keep the contract simple and enough for 5 partners.

### Unsafe skill installation

Do not support arbitrary user-entered `npx` skill installers tomorrow. Keep installs curated and partner-owned.

### Template sprawl

Do not try to update every template tomorrow. Focus on initial flagship partner templates plus generic enablement hooks.

## Deliverable Standard

By end of day April 8 we should have:

- redesigned integrations wizard
- Senso / Opik / GitHub preserved in the new flow
- Blaxel page
- Redis page
- curated partner skill-install support
- apply-time partner toggles
- initial partner templates
- tests for partner definitions and workspace integration persistence

## Follow-Ons

- externalize partner definitions into `Maximilien-ai/partners`
- broader partner directory env support
- richer partner skill source in Skills Import
- more template coverage across the catalog
