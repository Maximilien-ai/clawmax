---
name: clawmax-secret-test
description: Verify that an explicitly authorized agent skill can use a brokered workspace secret without revealing the raw value.
metadata:
  openclaw:
    emoji: "key"
    requires:
      bins:
        - clawmax-skill-run
      env:
        - CLAWMAX_TEST_SECRET
    secretRequirements:
      - key: CLAWMAX_TEST_SECRET
        label: ClawMax test secret
        kind: token
        required: true
        sensitive: true
        help: Use a non-production sentinel value. The test reports availability and a one-way fingerprint only.
---

# ClawMax Secret Broker Test

Use this skill only when the user asks to verify brokered secret access.

Run:

```bash
clawmax-skill-run clawmax-secret-test check
```

Report `secretAvailable` and the returned one-way fingerprint. Never run environment-inspection commands, request the raw value, or claim the secret is available unless the command succeeds.
