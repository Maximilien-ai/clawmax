# Microsoft 365

ClawMax's public Microsoft 365 partner integration uses delegated OAuth,
Microsoft Graph, and fixed host-mediated mail capabilities. The first production
scope is inbox listing, search, metadata/body reading, and draft creation.

The integration never asks for a normal Microsoft password or exposes OAuth
tokens to agents. Sending, replying, moving, categorizing, and deleting require
later, separate capability grants and confirmation policies.

Current state: public preview metadata, capability contract, and encrypted OAuth
connection lifecycle. PKCE, state replay protection, restart persistence, status,
and disconnect are validated against a fake Microsoft provider. Production
Microsoft identity endpoints and Graph execution remain disabled until
real-provider, test-account, local, and container validation are complete.
