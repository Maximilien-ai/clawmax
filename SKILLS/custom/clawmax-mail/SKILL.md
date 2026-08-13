---
name: clawmax-mail
description: Use explicitly authorized Gmail or Microsoft 365 accounts for bounded inbox listing, search, reading, and unsent draft creation.
metadata:
  openclaw:
    emoji: "mailbox"
    requires:
      bins:
        - clawmax-mail-run
---

# ClawMax Mail

Use this skill only when the user asks to inspect an authorized mailbox or create an unsent draft.

First discover the accounts and capabilities granted to this agent:

```bash
clawmax-mail-run accounts
```

Invoke one granted capability with explicit JSON arguments:

```bash
clawmax-mail-run invoke gmail ACCOUNT_ID mail.list '{"limit":20}'
clawmax-mail-run invoke gmail ACCOUNT_ID mail.search '{"query":"is:unread","limit":20}'
clawmax-mail-run invoke gmail ACCOUNT_ID mail.read.metadata '{"messageId":"MESSAGE_ID"}'
clawmax-mail-run invoke gmail ACCOUNT_ID mail.read.body '{"messageId":"MESSAGE_ID"}'
clawmax-mail-run invoke gmail ACCOUNT_ID mail.draft.create '{"to":["reviewer@example.com"],"subject":"Review","body":"Please review."}'
```

Microsoft 365 uses the same commands with `microsoft365` as the provider. Never claim a message was sent: this skill can create unsent drafts only. Never request OAuth credentials, inspect environment variables, or attempt send, reply, delete, move, label, or mailbox-configuration operations.
