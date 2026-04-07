# Partner Integrations Architecture

**Status:** Planned  
**Created:** 2026-04-07  
**Priority:** High

---

## Overview

ClawMax needs a more scalable way to present and persist workspace integrations.

Today, Workspaces Integrations is mostly a wizard around:
- LLM provider credentials and execution defaults
- selected partner-specific fields such as Senso context

The next version should preserve current value while supporting a growing set of partner integrations such as:
- Senso
- Opik
- GitHub
- Blaxel
- Redis

This document defines the architecture for:
- the integrations wizard flow
- partner metadata
- workspace persistence
- safe partner skill installation
- template-apply hooks

---

## Problem

The current integrations experience does not scale well as more third-party partners are added.

Pain points:
- partner-specific UI is too baked into the wizard
- there is no stable partner metadata contract
- there is no clean allowlist for which partners appear in a given environment
- template apply already understands some partner context, but not in a generalized way
- partner-owned skill installation needs a safe, curated path

Without a contract, every new partner increases dashboard complexity and implementation drift.

---

## Goals

1. Keep the current core provider setup flow intact.
2. Make third-party integrations optional, partner-specific pages.
3. Preserve parity for Senso, Opik, and GitHub in the new flow.
4. Add Blaxel and Redis without hardcoding them into the product forever.
5. Support externalized partner definitions later.
6. Allow partner integrations to influence template apply and workflow execution.
7. Keep partner skill installation curated and safe.

---

## Non-Goals For This Iteration

- a full plugin system for arbitrary partner code
- arbitrary user-entered `npm` / `npx` / shell execution
- dynamic remote loading of partner packages from the internet
- converting every existing template to every partner-aware pattern immediately

---

## UX Architecture

## Wizard Flow

The integrations wizard should become:

1. **Core Providers**
   - OpenAI
   - Anthropic
   - Gemini
   - Ollama / local runtime
   - workspace execution defaults

2. **Partner Selection**
   - show available partner cards from configured allowlist
   - default selection can be all visible partners unless instance config says otherwise
   - user can keep all, some, or none

3. **Partner Pages**
   - one page per selected partner
   - page content driven by partner metadata
   - page can include:
     - fields
     - links
     - logo
     - validation state
     - curated skill-install action

4. **Summary / Save**
   - show core provider readiness
   - show configured partners
   - persist non-secret workspace defaults server-side
   - keep browser-local secret handling where needed

---

## Partner Visibility / Allowlist

Partners shown in the wizard should come from instance configuration:

- web-team-selected instance options
- env fallback:
  - `WORKSPACES_INTEGRATIONS_THIRD_PARTIES=senso,opik,github,blaxel,redis`

The allowlist controls:
- which partner pages appear
- which partner toggles can appear in template apply
- which curated skill-install actions are eligible

This should be an allowlist, not discovery of every installed partner definition by default.

---

## Partner Definition Contract

Use a machine-readable definition plus human-readable copy.

Suggested local structure:

```text
PARTNERS/
  senso/
    partner.json
    PARTNER.md
    logo.svg
  opik/
    partner.json
    PARTNER.md
    logo.svg
  github/
    partner.json
    PARTNER.md
    logo.svg
  blaxel/
    partner.json
    PARTNER.md
    logo.svg
  redis/
    partner.json
    PARTNER.md
    logo.svg
```

Later, external roots should also be supported:

- `CLAWMAX_EXTRA_PARTNER_DIRS=/path/a,/path/b`

### `partner.json` responsibilities

`partner.json` should contain structured fields needed by product code:

- `slug`
- `name`
- `website`
- `docsUrl`
- `category`
- `description`
- `enabledByDefault`
- `logoPath`
- `fields`
- `validation`
- `skills`
- `templateToggle`
- `links`
- `copy`

### `PARTNER.md` responsibilities

`PARTNER.md` should contain:

- narrative copy
- positioning
- setup notes
- partner-facing docs/reference text

The UI should not depend on parsing free-form markdown for required product behavior.

---

## Workspace Persistence Model

Workspace integrations already persist non-secret defaults. Extend that shape with partner buckets.

Suggested persisted shape:

```json
{
  "openaiDefaultModel": "openai/gpt-4o-mini",
  "anthropicDefaultModel": "anthropic/claude-sonnet-4-20250514",
  "ollamaBaseUrl": "http://localhost:11434",
  "githubDefaultRepo": "owner/repo",
  "partners": {
    "senso": {
      "enabled": true,
      "contextLabel": "Workspace / Team / Project"
    },
    "opik": {
      "enabled": true
    },
    "github": {
      "enabled": true,
      "defaultRepo": "owner/repo"
    },
    "blaxel": {
      "enabled": true,
      "projectId": "proj_123",
      "defaultSandbox": "default",
      "region": "us-east-1"
    },
    "redis": {
      "enabled": true,
      "url": "rediss://...",
      "namespace": "workspace-default"
    }
  }
}
```

Secrets may still need browser-local handling or secure server-side storage depending on partner and deployment model.

---

## Validation Model

Validation should stay partner-specific but follow a shared result shape.

Shared validation result:

- `status`: `valid | invalid | unknown`
- `message`
- `details?`
- `fixHint?`

Each partner page can:
- validate locally
- validate with a lightweight server check
- or show unverified state if no safe check is available

Preserve current behavior:
- Senso validation
- Opik validation
- GitHub defaults

Add first-pass validation for:
- Blaxel
- Redis

---

## Skill Installation Architecture

### Constraint

Do not allow arbitrary user-entered installer commands in the first version.

### Approved model

Partner definitions may declare curated install actions.

Example:

```json
{
  "skills": {
    "installMode": "curated-installer",
    "installLabel": "Install Blaxel skills",
    "commandId": "blaxel-agent-skills"
  }
}
```

Server-side command resolution maps `commandId` to approved behavior.

For example:
- `blaxel-agent-skills` → `npx skills add blaxel-ai/agent-skills`

This gives a first-class UX without turning the Skills page into a general package executor.

### Relationship to Skills Import

Near term:
- expose curated install from the partner page

Possible later:
- add a dedicated “Partner installers” source in Skills Import

---

## Template Apply Architecture

Template apply already supports integration-aware behavior for Senso. Extend that model.

At apply time:
- detect configured/visible partners
- show opt-in toggles for eligible partners
- inject runtime context/defaults
- assign/install required partner skills where appropriate

### Example generic behavior

If Blaxel is enabled:
- inject sandbox usage instructions into workflow overrides
- assign/install curated Blaxel skills

If Redis is enabled:
- inject memory storage / retrieval instructions
- assign/install curated Redis skills

This lets generic templates become partner-aware without duplicating every template.

---

## Template Strategy

Two tracks should exist:

### 1. Generic enablement

Any template can optionally use:
- Redis for memory
- Blaxel for sandbox execution

### 2. Flagship partner templates

Create dedicated templates that showcase the strongest joint use cases.

Initial examples:

Blaxel:
- sandbox app-builder team
- sandbox code-experiment team

Redis:
- memory-backed research team
- memory-backed support / recall team

Combined:
- RAG + Blaxel deploy team
- idea-to-app sandbox team with Redis memory

---

## Externalization Strategy

The first implementation can keep partner definitions in this repo for speed.

But the contract should support moving them to:

- `/Users/maximilien/github/Maximilien-ai/partners`

Future model:
- local built-in partner definitions
- optional extra roots via `CLAWMAX_EXTRA_PARTNER_DIRS`
- env allowlist still controls visibility

This separates:
- product shell behavior
- partner content/assets/definitions

---

## Server / Client Touch Points

Likely modules:

- `SYSTEM/dashboard/client/src/components/ByokWizard.tsx`
- `SYSTEM/dashboard/server/routes/integrations.ts`
- `SYSTEM/dashboard/server/lib/workspace-integrations.ts`
- `SYSTEM/dashboard/server/lib/integration-validation.ts`
- `SYSTEM/dashboard/client/src/components/ApplyOrgTemplateModal.tsx`
- `SYSTEM/dashboard/client/src/pages/SkillsTest.tsx`
- new partner definition loader and schema files

---

## Risks

### Over-generalization

Building a full partner plugin platform now will slow delivery and increase risk.

### Unsafe installs

Allowing arbitrary `npx` or `npm` from the UI would create obvious security and reliability issues.

### Template explosion

Trying to retrofit every template immediately will fragment the rollout.

---

## Recommended Delivery Order

1. partner definition schema + loader
2. integrations wizard refactor
3. preserve Senso / Opik / GitHub in the new flow
4. add Blaxel page
5. add Redis page
6. add curated partner skill-install mechanism
7. add template apply partner toggles
8. add flagship partner templates
9. add external partner-root support

---

## Success Criteria

By end of day April 8:

- Workspaces Integrations has a partner-ready structure
- Senso, Opik, and GitHub still work in the new model
- Blaxel and Redis exist as real configurable integrations
- curated partner skill installation exists
- templates can opt into partner integrations
- at least a small flagship template set exists

