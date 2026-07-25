# Microsoft 365

ClawMax's public Microsoft 365 partner integration uses delegated OAuth,
Microsoft Graph, and fixed host-mediated mail capabilities. The first production
scope is inbox listing, search, metadata/body reading, and draft creation.

The integration never asks for a normal Microsoft password or exposes OAuth
tokens to agents. Sending, replying, moving, categorizing, and deleting require
later, separate capability grants and confirmation policies.

Current state: public preview metadata, capability contract, and encrypted OAuth
connection lifecycle. The production Microsoft identity authorization, token,
refresh, and Graph account-profile endpoints are implemented behind operator
environment configuration. Local disconnect removes encrypted credentials;
Microsoft account or tenant controls own provider-side consent revocation.
Mailbox actions and the end-user connection UI remain disabled until
test-account, local, and container validation are complete.
