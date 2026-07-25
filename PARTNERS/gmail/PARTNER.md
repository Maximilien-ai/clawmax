# Gmail

ClawMax's public Gmail partner integration uses delegated OAuth and fixed,
host-mediated mail capabilities. The first production scope is inbox listing,
search, metadata/body reading, and draft creation.

The integration never asks for a normal Google password or exposes OAuth tokens
to agents. Sending, replying, moving, archiving, and deleting require later,
separate capability grants and confirmation policies.

Current state: public preview metadata and capability contract. Production OAuth
connection and Gmail API execution remain disabled until fake-provider,
test-account, local, and container validation are complete.
