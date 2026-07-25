# Public Mail Capability Contract

The Gmail and Microsoft 365 partners share a versioned, provider-neutral
invocation boundary. The JSON Schema is
[`mail-capability.schema.json`](mail-capability.schema.json).

## First Production Capabilities

- `mail.list`
- `mail.search`
- `mail.read.metadata`
- `mail.read.body`
- `mail.draft.create`

Each grant is bound to one workspace, agent, plugin identity and fingerprint,
provider, connected account, and exact capability set. Changing any bound value
fails closed. A revoked grant cannot be invoked.

Agents never receive OAuth client secrets, access tokens, refresh tokens, or an
unrestricted provider client. The host validates bounded arguments and calls a
provider adapter. Routine audit events record the action and non-sensitive
counts, not recipient addresses, subjects, bodies, search text, tokens, or
authorization headers.

Inbound messages and attachments are untrusted content. Text inside a message
cannot add a capability, select a different account, change a recipient, or
approve an action.

## Deferred Capabilities

Send, reply, forward, organize, move/archive, category/label changes, attachment
download, and delete are intentionally absent from v1. Each requires its own
grant, audit policy, limits, and user confirmation decision. Permanent delete is
outside the initial release.
