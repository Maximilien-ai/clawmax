# Gmail

ClawMax's public Gmail partner integration uses delegated OAuth and fixed,
host-mediated mail capabilities. The first production scope is inbox listing,
search, metadata/body reading, and draft creation.

The integration never asks for a normal Google password or exposes OAuth tokens
to agents. Sending, replying, moving, archiving, and deleting require later,
separate capability grants and confirmation policies.

Current state: public preview metadata, capability contract, and encrypted OAuth
connection lifecycle. The production Google authorization, token, refresh,
profile, and revocation endpoints are implemented behind operator environment
configuration. Gmail mailbox actions and the end-user connection UI remain
disabled until test-account, local, and container validation are complete.
