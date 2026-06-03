# Resend Partner Mini-Sprint: `1.7.4`

> Goal: make Resend feel like a first-class ClawMax communication capability, not only an imported skill that happens to work.

## Release Target

- Target release: `1.7.4`
- Target date: June 4, 2026
- Scope: dev, on-prem, and cloud
- Non-goal: replacing all Communications-channel work with email. This sprint should create a reliable Resend-backed path that agents can use when the Resend Partner and skills are enabled.

## Product Outcomes

1. Agents can send email with a ClawMax sender by default.
2. Resend skills are easy to enable and use across agents.
3. Agent-generated emails have a consistent default HTML wrapper.
4. New dashboard environments can be provisioned with a default Resend API key, similar to Opik.
5. The product gives clear readiness and failure messages when sender/domain/API-key requirements are not satisfied.

## Recommended Design: First-Party `clawmax-resend` Bridge Skill

Implement a first-party ClawMax-owned Resend bridge skill, tentatively named:

```text
clawmax-resend
```

This should coexist with the official Resend skills instead of replacing them.

Use `clawmax-resend` for the default agent email path:

- no package install requirement,
- uses the dashboard/partner Resend configuration resolver,
- uses `RESEND_API_KEY` without asking the model to discover or manage secrets,
- uses the configured default sender and reply-to,
- applies the default ClawMax HTML template,
- returns structured/actionable failures,
- avoids OpenClaw embedded-session conflicts by routing direct send requests through the dashboard Resend bridge.

Keep the official Resend skills for power-user workflows:

- `resend-cli` for direct CLI/platform operations,
- `react-email` for template authoring and preview/build flows,
- upstream Resend skills for broader platform coverage.

Default assignment behavior:

- when the Resend Partner is enabled, new email/resend-focused agents should get `clawmax-resend` by default,
- existing agents can opt in by adding `clawmax-resend`,
- official Resend skills should remain optional add-ons unless the prompt asks for CLI/platform/template work.

This gives ClawMax a stable product contract for “send an email” while still preserving the full Resend ecosystem for advanced users.

## Decisions

### Default Sender

Preferred default sender:

```text
agent@send.clawmax.ai
```

Implementation requirements:

- Verify `send.clawmax.ai` in Resend before making this the production default.
- Add a dashboard/runtime default such as `RESEND_DEFAULT_FROM=agent@send.clawmax.ai`.
- Allow workspace override in Partner Integrations:
  - `From email`
  - optional `From name`
  - optional `Reply-To`
- Use `onboarding@resend.dev` only as a dev/test fallback, and show a warning when the fallback is being used.
- If Resend rejects a sender because the domain is unverified, surface that as a sender/domain readiness error, not a generic send failure.

### Resend As An Agent Capability

Resend should be available to agents when:

- the workspace has the Resend Partner enabled,
- a usable `RESEND_API_KEY` is available from system, global, or workspace secrets,
- the agent has a Resend-capable skill assigned, preferably the first-party `clawmax-resend` bridge skill for normal email sends, or official Resend skills for advanced CLI/platform/template tasks.

Expected behavior:

- Skills page shows Resend skills as configured when key + runtime dependencies are ready.
- Agent creation from prompts like “create a Resend/email agent” should infer:
  - a useful agent name such as `resend-agent` or `email-agent`,
  - email/resend tags,
  - the first-party `clawmax-resend` bridge skill,
  - official Resend partner skills only when the prompt asks for platform, CLI, or React Email work.
- Existing agents can opt in by adding `clawmax-resend`.
- The direct dashboard Resend send path should remain available for explicit email-send requests to avoid OpenClaw embedded session conflicts.

### Default HTML Template

Add a default ClawMax email wrapper for agent-sent emails.

Minimum v1 template:

- plain, readable HTML body
- agent name / workspace label
- subject line
- message content rendered safely
- footer indicating it was sent by a ClawMax agent
- fallback plain-text body

Product options:

- dashboard-level default template
- workspace-level override later
- partner-level “Use HTML template by default” toggle
- escape/sanitize untrusted content before injecting into HTML

### Default API Key Provisioning

Match the Opik-style deployment pattern:

- support a system/runtime `RESEND_API_KEY`,
- expose readiness in Partner Integrations,
- show it in Keys & Secrets with managed partner usage,
- allow workspace override where appropriate.

Proposed env:

```bash
RESEND_API_KEY=...
RESEND_DEFAULT_FROM=agent@send.clawmax.ai
RESEND_DEFAULT_FROM_NAME=ClawMax Agent
RESEND_DEFAULT_REPLY_TO=
```

On cloud/on-prem:

- deployment team can provide `RESEND_API_KEY` as an instance default,
- workspace override can still win when a user brings their own Resend key,
- UI should make clear which source is active without revealing full secret values.

## Engineering Work

### Backend

- Add a shared Resend config resolver:
  - system env
  - global/workspace secrets
  - workspace partner settings
  - safe redacted source metadata for UI
- Add the first-party `clawmax-resend` skill:
  - bundled Partner Skill,
  - no install requirement,
  - setup requirement tied to Resend Partner readiness,
  - instructions that tell the agent to use the ClawMax Resend bridge for direct email sends.
- Add sender validation and clearer error mapping:
  - missing key
  - invalid key
  - unverified sender/domain
  - rate limit
  - network error
- Add default HTML and text rendering helpers.
- Extend the direct Resend chat email path to use:
  - configured sender,
  - configured reply-to,
  - default HTML template,
  - plain text fallback.
- Keep canonical env export for agent child processes:
  - `RESEND_API_KEY`
  - sender defaults if safe to expose.

### Frontend

- Resend Partner page:
  - show active key source,
  - add sender fields,
  - add “Use default ClawMax sender” option,
  - add “Use default HTML template” option,
  - keep test-email action.
- Skills page:
  - show `clawmax-resend` as the recommended/default Resend skill,
  - ensure Resend partner skills show configured only when key + dependencies are ready,
  - keep setup/readiness copy specific and actionable.
- Agent create / AI Builder:
  - make email/resend prompts infer agent name, tags, and skills,
  - keep “AI Generate Agent” visible even when skill routing is high confidence.

### Deployment / Ops

- Add Resend env fields to deployment docs and examples.
- Verify `send.clawmax.ai` DNS/domain setup in Resend.
- Confirm on-prem and cloud secret injection path exposes runtime `RESEND_API_KEY` safely.
- Decide whether default Resend key is enabled for all environments or only managed cloud/demo environments.

## Regression Tests

Required unit/route coverage:

- Resend config resolver precedence:
  - workspace secret beats system default when explicitly configured,
  - system default works when workspace has no key,
  - redacted UI metadata does not expose secrets.
- Sender resolution:
  - default sender is used when configured,
  - workspace sender override wins,
  - unverified sender errors are normalized.
- Email rendering:
  - HTML template enabled by default,
  - text fallback exists,
  - user/agent content is escaped.
- Agent chat direct Resend send:
  - explicit “send email to ...” uses configured sender and HTML template,
  - `clawmax-resend` agents are intercepted,
  - non-Resend-capable agents are not intercepted,
  - missing key returns an actionable error.
- Skills readiness:
  - Resend skills read partner/global/workspace key state consistently,
  - key saved via Partner Integrations clears `Needs setup`.
- First-party skill:
  - `clawmax-resend` has no machine install requirement,
  - `clawmax-resend` setup state follows Resend Partner readiness,
  - assigning `clawmax-resend` is enough for direct email-send capability.
- AI Builder / agent generation:
  - “create a Resend agent...” suggests AI Create Agent and infers `clawmax-resend` plus Resend/email tags.

Manual smoke:

1. Fresh dev workspace with system `RESEND_API_KEY`: Resend Partner shows configured.
2. Save workspace Resend key: Keys & Secrets shows managed partner key.
3. Import Resend skills: skills appear under Partner Skills and no false `Needs setup`.
4. Create `resend-agent` from AI Builder prompt: name, tags, and skills are inferred.
5. Chat: ask agent who it is, then ask it to email the status to a test address.
6. Confirm sender is `agent@send.clawmax.ai` when domain is verified.
7. Confirm HTML email renders correctly in Gmail/Apple Mail.
8. Repeat on on-prem image and cloud image.

## Open Questions

- Should `agent@send.clawmax.ai` be the default for all users, or only managed/demo environments?
- Should user-managed/on-prem deployments default to their own sender once they bring their own Resend key?
- Do we need per-agent sender identity later, for example `agent-slug@send.clawmax.ai`?
- Should email sends appear in Communications history as first-class events?
- Should Resend become a real dashboard channel type, or remain partner skill + direct-send bridge for `1.7.4`?

## Suggested `1.7.4` Cut Line

Must-have:

- first-party `clawmax-resend` bridge skill,
- configured default sender support,
- default HTML template,
- system/runtime API key provisioning,
- Resend Partner readiness and test-email validation,
- direct agent email sends use configured sender/template,
- tests listed above.

Can wait:

- per-agent sender identities,
- full Communications channel integration,
- rich template editor,
- attachments,
- broadcast/contact/domain management UI.
