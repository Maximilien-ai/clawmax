# Microsoft 365

ClawMax's public Microsoft 365 partner integration uses delegated OAuth,
Microsoft Graph, and fixed host-mediated mail capabilities. The first production
scope is inbox listing, search, metadata/body reading, and draft creation.

The integration never asks for a normal Microsoft password or exposes OAuth
tokens to agents. Sending, replying, moving, categorizing, and deleting require
later, separate capability grants and confirmation policies.

Current state: public preview metadata and capability contract. Production OAuth
connection and Graph execution remain disabled until fake-provider, test-account,
local, and container validation are complete.
