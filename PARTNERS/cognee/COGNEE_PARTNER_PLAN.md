# Cognee Partner Plan

Status: draft for review
Target: possible ClawMax `1.7.9` exploration, not release-bound until reviewed
Created: 2026-06-09

## Summary

Cognee looks like a good fit for a ClawMax partner because it maps to three ClawMax needs:

- agent and team memory,
- retrieval over workspace/team context,
- feedback loops where agents can improve from prior interactions.

The current Cognee product surface appears to expose this through four core operations:

- `remember`: store memory, documents, and interaction context,
- `recall`: retrieve relevant memory/context,
- `improve`: update memory from feedback and observed outcomes,
- `forget`: remove stored context.

Cognee also exposes HTTP API and MCP paths, which gives us two possible integration modes:

- dashboard-managed API integration, similar to Resend and Opik,
- skill/MCP-driven agent integration, where agents call Cognee capabilities directly.

References:

- Cognee docs: https://docs.cognee.ai/
- Cognee API quickstart: https://docs.cognee.ai/api-reference/quickstart
- Cognee MCP overview: https://docs.cognee.ai/cognee-mcp/mcp-overview
- Cognee OpenClaw integration: https://docs.cognee.ai/integrations/openclaw-integration

## Proposed Product Shape

### Partner Integrations Tab

Add Cognee as an optional partner under the context/memory category.

Initial fields:

- `COGNEE_API_KEY`: secret, server/runtime managed when provisioned by cloud/on-prem, user-provided when BYOK.
- `COGNEE_BASE_URL`: optional URL for Cognee Cloud or self-hosted Cognee.
- `COGNEE_PROJECT_ID` or namespace: optional, exact name to confirm from Cognee docs/API.
- `COGNEE_DEFAULT_COLLECTION` or dataset: optional workspace default, exact name to confirm.

V1 validation:

- show configured if `COGNEE_API_KEY` is present,
- validate live if `COGNEE_BASE_URL` and API auth contract are confirmed,
- return explicit states: not configured, configured locally, configured on server, validation failed.

The page should link to Cognee docs and sign-up/setup docs so users can obtain keys and choose Cloud vs self-hosted.

### Template Apply Surface

When Cognee is configured, template apply should optionally expose:

- `Enable Cognee memory for this template`,
- `Share memory across this team`,
- `Ingest template docs/workflow outputs into Cognee`.

Default should be off unless a template explicitly declares Cognee support. Memory/context providers can retain sensitive content, so enabling should be deliberate and visible.

Template apply should only inject Cognee skills/env defaults into the agents created by that apply run. It should not mutate unrelated agents or global workspace behavior.

### Partner Skills

Partner Skills should expose the official Cognee OpenClaw path first.

The Cognee docs already describe an OpenClaw plugin:

```text
@cognee/cognee-openclaw
```

That plugin is documented as indexing OpenClaw memory files, recalling relevant memory before agent runs, and keeping deleted memory files in sync. This should be the preferred integration path if it is production-ready in our supported OpenClaw runtime.

Current first-pass behavior:

- add Cognee partner card in the Partner Skills import surface,
- list the official Cognee OpenClaw plugin/skills when we identify the canonical package and supported versions,
- make import idempotent so existing skills are skipped, not treated as a full import failure.

If the official plugin is missing required ClawMax product behavior, create first-party ClawMax skills with clear `clawmax-cognee-*` names.

Recommended first-party skills:

- `clawmax-cognee-memory`: remember/recall agent memory and workspace facts.
- `clawmax-cognee-team-context`: shared team context for communities/groups.
- `clawmax-cognee-learn`: opt-in feedback loop for improving future runs from completed chats/workflows.
- `clawmax-cognee-ingest`: ingest workspace docs, template outputs, workflow outputs, and selected artifacts.

These skills should use the configured partner secrets and never ask agents to manage API keys directly.

## Integration Modes

### Mode A: Dashboard-Managed API

Use the dashboard server as the stable integration boundary.

Good for:

- partner readiness checks,
- workspace-level configuration,
- template apply hooks,
- managed cloud/on-prem secrets,
- audit logging and permission gates.

Implementation sketch:

- Add `cognee` to partner metadata.
- Add a Cognee config resolver with system env, workspace secret, and workspace defaults.
- Add a minimal backend helper for validation and future memory operations.
- Expose redacted readiness to the UI.

### Mode B: Agent Skill / MCP

Use Cognee through skills or MCP when the agent needs to remember, recall, or improve context during task execution.

Good for:

- generic OpenClaw tool usage,
- team memory and semantic retrieval,
- letting agents use Cognee without special-case chat routing.

Implementation sketch:

- Prefer the official Cognee OpenClaw plugin and Cognee MCP tools if available.
- Bundle first-party `clawmax-cognee-*` skills only where product-grade behavior is missing.
- Keep instructions generic: agents call the Cognee skill/tool, not dashboard-specific hidden routes.
- Avoid one-off hardcoded chat behavior like the Resend lessons learned.

## V1 Scope

V1 should be intentionally small:

- Add Cognee partner metadata and docs.
- Add Partner Integrations UI page with key/base URL fields.
- Add server-side config detection and redacted readiness.
- Add docs/sign-up links.
- Add Partner Skills listing/import path for the official Cognee OpenClaw plugin or supported Cognee skills.
- Add one minimal first-party skill if official Cognee skills do not cover the ClawMax use case.
- Add template apply toggle that only assigns Cognee skills and workspace defaults.

V1 should not:

- automatically ingest all chats by default,
- make Cognee the default memory provider for every workspace,
- store sensitive content without explicit opt-in,
- create irreversible memory writes without a delete/forget path,
- add special-case chat execution code per Cognee skill.

## Data, Privacy, And Control

Cognee memory can become durable shared context. The ClawMax UX should treat this as higher sensitivity than ordinary agent chat.

Required controls:

- opt-in per workspace/template/agent,
- visible status when memory is enabled,
- clear source labels for recalled context,
- delete/forget action where feasible,
- no automatic ingestion of secrets, `.env`, API keys, auth profiles, or private runtime logs,
- docs warning that cloud memory may leave the local deployment boundary.

V1 ingestion allowlist should start with:

- selected agent markdown files,
- selected workspace docs,
- user-approved chat summaries,
- workflow outputs explicitly selected by the user or template.

## Open Questions

- What is Cognee's canonical production auth shape for Cloud and self-hosted deployments?
- Does Cognee require project, dataset, collection, graph, or tenant identifiers beyond an API key?
- Is `@cognee/cognee-openclaw` the correct supported package for our runtime, and what versions should ClawMax allow?
- Should ClawMax call Cognee HTTP APIs directly, prefer MCP, or support both?
- What are the retention, delete, export, and namespace guarantees for remembered content?
- How should Cognee memory interact with existing ClawMax workspace memory and DocHub search?
- Should template teams share one Cognee namespace, or should each agent get its own namespace plus team recall?

## Tests To Add Before Implementation Ships

Unit tests:

- partner catalog includes Cognee metadata without enabling it globally by accident,
- Cognee config resolver handles system env, workspace secret, and missing key cases,
- Cognee readiness redacts secrets,
- template apply only injects Cognee when the toggle is enabled,
- Partner Skills import treats already-installed skills as success/skipped.

Skill tests:

- `clawmax-cognee-*` skills never ask for API keys directly,
- remember/recall commands fail clearly when configuration is missing,
- file ingestion rejects sensitive files by default,
- team context uses workspace/team namespace, not a global namespace.

Manual release checks:

- dev: partner page shows not configured, then configured after key entry,
- on-prem: runtime `COGNEE_API_KEY` shows configured and cannot be disabled if managed by deployment policy,
- cloud: managed key behaves like Opik/Resend where applicable,
- template apply: Cognee toggle assigns skills to new agents only,
- agent chat: assigned Cognee skill can recall a remembered fact without special dashboard routing.

## Recommended Next Step

Before implementation, run a short spike:

1. Confirm Cognee Cloud/self-hosted auth and namespace parameters.
2. Confirm whether official Cognee skills exist and where they are published.
3. Prototype one agent memory flow:
   - remember a short fact,
   - recall it in a later turn,
   - forget it.
4. Decide whether V1 uses HTTP API, MCP, or both.

After the spike, we can convert this plan into a mini-sprint with concrete files, tests, and release gates.
