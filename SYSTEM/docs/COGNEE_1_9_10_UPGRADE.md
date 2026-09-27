# Cognee policy fix for 1.9.10

Base: `v1.9.9` / `release-1.9.9` (`381f4ff9`). This is a candidate fix,
not a published 1.9.10 image or completed live upgrade acceptance.

## Cause and policy

`docker-entrypoint.sh` added `cognee-openclaw` to `plugins.deny` on every
startup without an explicit allowlist. Commit `e0ac1d25` introduced this
as an intentional replacement for a non-bundled-plugin blocking sentinel.
It was not evidence that Cognee was installed or broken.

New configurations no longer receive that default deny. This permits operator
enablement, not automatic installation, configuration, or credential access.
Existing allowlists and entry-level disable settings remain effective.

## Existing 1.9.9 configurations

There is no provenance marker distinguishing generated and administrator-written
Cognee denies. Default startup therefore preserves existing denies. After the
instance owner authorizes removing the Cognee restriction, set the following
container environment option for the upgraded instance:

```text
CLAWMAX_REMOVE_LEGACY_COGNEE_DENY=true
```

Startup removes only the exact `cognee-openclaw` deny entry, leaving all other
restrictions, plugin settings, credentials, agents, and workspace paths intact.
Before removal it creates `<working-openclaw.json>.pre-cognee-policy.json`
with mode 0600, exclusively, and never replaces that backup on subsequent starts.
The backup contains secrets: keep it private, never attach it to CI or a ticket.
Malformed working JSON aborts opted-in migration without overwriting it.

Host config is not mutated. If a mounted host config supplies the deny, either
retain the option across starts or have its owner remove that exact deny at the
source; otherwise host synchronization restores the original restriction.
For rollback, stop the instance and have the operator restore the private backup
after checking for newer configuration edits. Do not blindly overwrite current
agent or credential changes.

## Evidence and remaining acceptance

Passed locally: entrypoint shell suite, focused migration tests (default preserve,
opt-in cleanup, unrelated state, idempotence, host input, private backup, malformed
JSON, and explicit Cognee enablement), TypeScript, 14 chat normalization tests.
The latter cover the reported boxed warning and preservation of a real reply;
they do not prove live streaming or model execution.

Before publishing 1.9.10, use a disposable copy of a representative 1.9.9
instance, never original event mounts:

1. Record agent/workspace IDs and restrictions; securely back up credentials/config.
2. Upgrade with operator-approved cleanup. Verify only the exact deny is removed
   and the original private backup remains unchanged after a restart.
3. With Cognee absent, create an Agent. Require no stale Cognee warning and a
   nonempty, genuine model response. Creation alone is not acceptance.
4. Install and explicitly enable Cognee through the supported plugin controls;
   verify loaded status and Agent response. No credentials belong in test logs.
5. Repeat restart; confirm other restrictions, credentials, Agents, and workspace
   contents survive. Also test without opt-in: deliberate denies must remain.
6. Run full integration/validation/coverage and image gates before release.

Live upgrade, actual Cognee loading, and Agent response remain unverified.
