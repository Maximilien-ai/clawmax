# Public Models, Gateways, And Email Partners

> Status: OpenRouter and runtime-gated xAI shipped in `v1.9.9`; public mail capability and OAuth storage foundations implemented
> Release target: `2.0.0` public partner plugins
> Runtime baseline under test: OpenClaw `v2026.6.11`
> Last updated: July 25, 2026

## Decision Summary

All work in this plan is public.

- Add xAI as a first-class hosted model provider, including Grok, rather than hiding it behind the generic OpenAI-compatible form.
- Add OpenRouter as a first-class hosted gateway. Do not route it through the current LM Studio-oriented `openai-compatible` execution path.
- Keep a generic OpenAI-compatible provider for custom endpoints, but distinguish remote gateways from local runtimes and add provider presets instead of accumulating special cases.
- Build public Gmail and Microsoft 365/Outlook partner integrations on a common mail capability contract.
- Never request or store a normal Google or Microsoft account password. Use delegated OAuth for user mailboxes, with narrowly scoped application credentials only for operator-approved enterprise cases.
- Reuse audited upstream components where they fit: OpenClaw already has native xAI and OpenRouter provider concepts, `gog` covers Google Workspace, and Himalaya is useful for general IMAP/SMTP. ClawMax still owns setup, authorization, capability boundaries, redaction, approvals, and tests.

## Why This Is Feasible

### xAI and Grok

xAI exposes an API-key-authenticated API at `https://api.x.ai/v1`, an authenticated model catalog, Chat Completions and Responses APIs, function calling, structured output, and current Grok models. OpenClaw also documents a native `xai/<model>` provider and `XAI_API_KEY`/OAuth authentication.

Grok 4.5 was published after the pinned OpenClaw baseline. A direct `v2026.6.11` catalog probe confirms native xAI provider support but does not advertise `xai/grok-4.5`. ClawMax therefore ships the native provider with a runtime-proven fallback catalog and hides Grok 4.5 until a separately validated OpenClaw update can resolve and execute it. The RC does not silently change the runtime baseline.

Primary references:

- [xAI Grok 4.5](https://docs.x.ai/developers/models/grok-4.5)
- [xAI model catalog API](https://docs.x.ai/developers/rest-api-reference/inference/models)
- [OpenClaw xAI provider](https://docs.openclaw.ai/providers/xai)

### OpenRouter and hosted gateways

OpenRouter accepts bearer API keys, exposes an OpenAI-compatible API at `https://openrouter.ai/api/v1`, and publishes a model catalog. OpenClaw has a native `openrouter/<provider>/<model>` namespace and supports `OPENROUTER_API_KEY`.

ClawMax's current generic OpenAI-compatible path is not sufficient as documentation-only support: parts of execution and diagnostics treat that provider as a local LM Studio-style runtime and can rewrite provider/model identity. OpenRouter needs its native OpenClaw provider identity so model slugs, auth, discovery, diagnostics, and routing remain correct.

Primary references:

- [OpenRouter authentication](https://openrouter.ai/docs/api/reference/authentication)
- [OpenRouter models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenClaw OpenRouter provider](https://docs.openclaw.ai/openrouter)

### Gmail and Microsoft 365 mail

Gmail and Microsoft Graph both expose supported APIs for listing, reading, organizing, drafting, and sending mail. Both use OAuth bearer tokens and publish granular permission scopes. This makes first-party partner integrations possible without exposing mailbox passwords to an agent.

OpenClaw already includes useful building blocks:

- `gog` provides Google Workspace operations and is already represented in ClawMax's constrained skill setup flow.
- Himalaya supports general IMAP/SMTP mail and already has constrained setup metadata in ClawMax.
- OpenClaw supports Gmail event hooks through `gog` and Google Pub/Sub.

These components reduce implementation work, but they do not replace a ClawMax authorization and approval layer. Outlook needs a Microsoft Graph-native adapter for the intended partner experience.

Primary references:

- [Gmail API overview](https://developers.google.com/workspace/gmail/api/guides)
- [Google OAuth scope policy](https://developers.google.com/identity/protocols/oauth2/policies)
- [Gmail message send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Microsoft Graph mail overview](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview?view=graph-rest-1.0)
- [Microsoft Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)

## Release Allocation

### `1.9.9`: provider and security foundation

Target these bounded public changes after the brokered-secret contract is stable:

1. Add first-class `xai` provider metadata, key capture/readiness, model discovery, model selection, provider-specific errors, and direct chat/workflow tests.
2. Add first-class `openrouter` provider metadata, key capture/readiness, live model discovery, native `openrouter/...` model references, and direct chat/workflow tests.
3. Rename and explain the existing generic path as a custom OpenAI-compatible endpoint; explicitly identify local endpoints such as LM Studio separately from hosted gateway presets.
4. Add a provider compatibility probe to CI and container smoke so the pinned runtime, not the dashboard alone, proves each model reference.
5. Define a versioned public mail capability schema and fake provider used by authorization, redaction, prompt-injection, and approval tests.
6. Add Gmail and Microsoft 365 partner metadata, setup/readiness states, OAuth redirect/config documentation, and test-account runbooks without enabling production mailbox actions yet.
7. Use the `1.9.9` secret broker for fixed partner entrypoints and token references; never inject refresh tokens or mailbox credentials into the parent agent environment.

Do not block `1.9.9` on completing both production mail providers. Provider support and the mail foundation are independently releasable.

### `2.0.0`: public mail partner plugins

Ship Gmail and Microsoft 365/Outlook as public, curated partner plugins using the public plugin architecture:

1. Implement a shared mail capability contract and provider-specific adapters.
2. Start with `list`, `search`, `read metadata`, `read body`, and `create draft`.
3. Add Gmail label/archive and Outlook category/move as explicit provider capabilities rather than pretending their mailbox models are identical.
4. Gate `send`, `reply`, `forward`, move/archive, and delete by separate grants. Require a human confirmation for sends and destructive actions by default.
5. Keep permanent delete out of the first release. Prefer reversible organization actions and drafts.
6. Publish manifests, source, permission declarations, setup guides, test fixtures, and compatibility results.
7. Keep proprietary guardrail/evaluation plugins private; the mail plugins, approval contract, audit events, and public scoring integration remain public.

## Public Mail Capability Contract

The first public implementation now lives in
[`PARTNERS/mail-capability.schema.json`](../../../PARTNERS/mail-capability.schema.json)
and `server/lib/mail-capabilities.ts`. It includes the five initial
read/search/draft capabilities, exact workspace/agent/plugin/fingerprint/account
grant binding, bounded arguments, metadata-only audit events, and a fake provider
with malicious-message tests. Gmail and Microsoft 365 partner entries are
visible as preview integrations without accepting passwords or tokens.

The public OAuth layer now includes provider-neutral state and PKCE handling,
encrypted workspace-scoped connected-account storage, metadata-only connection
status, restart persistence, refresh/disconnect, fake exchanges, and production
Google/Microsoft identity adapters behind operator configuration. Authorization
codes, PKCE verifiers, client secrets, access tokens, and refresh tokens are
never returned by the API or written to routine audit records. Callers can
request only declared ClawMax mail capabilities; the host maps them to provider
scopes and rejects raw scopes such as `Mail.Send` or full Google mailbox access.
Mailbox actions and the connection UI remain intentionally disabled until
test-account validation is complete.

A provider advertises capabilities instead of receiving unrestricted mailbox access:

```json
{
  "provider": "gmail",
  "accountId": "opaque-account-id",
  "capabilities": [
    "mail.list",
    "mail.search",
    "mail.read.metadata",
    "mail.read.body",
    "mail.draft.create"
  ]
}
```

Each invocation includes:

- workspace, agent, skill/plugin id, and immutable fingerprint
- opaque connected-account reference
- one declared capability
- bounded arguments and result limits
- grant and confirmation identifiers when required
- audit metadata without tokens or message bodies by default

The language model receives normalized message data needed for the task, never OAuth client secrets, access tokens, refresh tokens, or a general mailbox client.

## Security And Product Rules

- Use delegated OAuth for normal Gmail, Outlook.com, and Microsoft 365 user accounts.
- Treat service-account/domain-wide delegation and Microsoft application permissions as enterprise administrator features with explicit mailbox restrictions.
- Request the smallest scope set for the enabled capability. Adding send or modify access requires a separate consent/grant transition.
- Store OAuth tokens server-side through the encrypted secret provider or infrastructure secret manager. Browser-local vault entries are not production mailbox connections.
- Redact tokens, authorization headers, message bodies, attachment contents, and sensitive headers from routine logs and support bundles.
- Bound search windows, result counts, body size, attachment size, and execution time.
- Treat inbound mail and attachments as untrusted content and possible prompt injection. Mail content cannot grant capabilities, change recipients, or approve actions.
- Resolve recipients from the user's explicit request or a confirmation UI, not solely from instructions inside an email body.
- Display the connected account, requested action, recipients, subject, attachment names, and provider immediately before a send confirmation.
- Maintain separate grants for reading bodies, creating drafts, sending, organizing, and deleting.
- Provide revoke, reconnect, token-expiry, and tenant/admin-consent states in partner readiness.

## OSS Reuse Policy

Reusing OSS is preferred when it reduces risk, but packaging an upstream skill is not enough by itself.

For each dependency or skill:

1. Verify license, provenance, release activity, dependency tree, and supported auth flow.
2. Pin a version or source fingerprint and record it in the partner manifest.
3. Audit command construction, token storage, logs, attachment handling, and shell execution.
4. Wrap it behind a fixed ClawMax entrypoint and capability allowlist.
5. Add fake-provider tests and a non-primary test-mailbox integration suite.
6. Re-review on upgrades; fingerprint changes invalidate existing secret grants.

Current recommendation:

- Gmail: build the first adapter around the official Gmail API and audited `gog` operations where they match the capability contract.
- Outlook: use Microsoft Graph directly through a small ClawMax-owned adapter.
- Himalaya: retain as a general advanced IMAP/SMTP skill, but do not make full-mailbox IMAP scope the default Gmail or Outlook partner path.
- Resend: keep as the transactional outbound-email partner. Gmail/Outlook are mailbox partners and should not replace or overload the Resend contract.

## Automated Validation

Native OpenRouter and xAI coverage now exercises key-shape validation, catalog discovery, model namespace preservation, pinned-runtime compatibility gating, provider-isolated environment construction, temporary OpenClaw auth profiles, direct chat readiness/routing, and workflow/group execution plumbing. Real-key local and container smoke remains a release gate for both providers.

### Provider tests

- xAI and OpenRouter keys remain isolated from other providers.
- Discovery preserves native provider/model ids.
- chat, group chat, and workflow execution use the selected native provider.
- missing key, invalid key, unavailable model, quota, and timeout errors name the provider and model.
- a local OpenAI-compatible base URL cannot capture xAI or OpenRouter traffic.
- local and multi-architecture container smoke use the pinned OpenClaw runtime.

### Mail contract tests

- OAuth callback state, PKCE/nonce, tenant/account binding, expiry, refresh, revoke, and reconnect.
- scope escalation requires a new explicit grant.
- an agent without `mail.read.body` receives metadata only.
- create-draft cannot send; send cannot happen without the required confirmation policy.
- message content cannot inject a new capability, recipient, or confirmation.
- cross-workspace, cross-agent, cross-plugin, and fingerprint mismatches fail closed.
- token and message sentinels are absent from logs, chat history, workflow history, exports, and support bundles.
- rate, result, body, attachment, and timeout limits are enforced.
- Gmail and Graph fake servers cover pagination, throttling, expired tokens, partial failures, and provider-specific organization semantics.

### Manual validation

- Use dedicated non-primary Gmail and Microsoft 365 test accounts.
- Connect, restart the container, and verify the account remains ready without exposing tokens.
- Ask an agent to summarize unread mail, classify a small test set, and create drafts.
- Verify every draft recipient and body before sending.
- Revoke access at the provider and verify ClawMax shows reconnect-required.
- Run the same checks in local and one containerized cloud/on-prem environment.

## Release Gates

- The pinned OpenClaw runtime passes native xAI and OpenRouter probes before either provider is advertised as supported.
- Grok 4.5 is not listed until that exact model completes chat and tool-use smoke on the release image.
- No normal mailbox password field exists.
- No general secret or mailbox enumeration tool is exposed to agents.
- Read, draft, send, organize, and delete are distinct capabilities and grants.
- Public plugin source, manifests, permissions, tests, and setup documentation ship together.
- Gmail/Outlook production enablement waits for local and containerized test-account validation.

## Recommended Order

1. Validate the implemented native OpenRouter and xAI paths with real keys in local and container runtimes.
2. Finish the `1.9.9` secret grant/resolver/broker release gate.
3. Keep Grok 4.5 gated until a separately validated OpenClaw update supports it.
4. Publish the mail capability schema, fake provider, threat tests, and partner setup states.
5. Build the public Gmail plugin, using read/search/draft as the first real test of the broker and approval contract.
6. Build the public Microsoft Graph plugin against the same contract.
7. Add opt-in send and organization actions only after confirmation/audit tests are green.
