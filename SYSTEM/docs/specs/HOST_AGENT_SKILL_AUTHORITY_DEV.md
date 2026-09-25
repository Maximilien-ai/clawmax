# Dev host Agent Skill authority query

Status: isolated Mac dev only. Dashboard provides a generic read-only authority
query; it does not execute Agents, deliver credentials, or enable Groups/Workflows.
The sign-in popup remains presentation-only. The host must authenticate to this
query and independently verify its local Skill file and signed macOS CLI.

## Transport

The Mac host sends `POST http://127.0.0.1:3001/api/dev/host-agent-skill/authority`
directly to the dev Dashboard backend. Use `Content-Type: application/json` and
`X-ClawMax-Host-Key: <64 lowercase hex characters>`. The key is a separate,
private 256-bit dev secret; never put it in a browser, URL, workspace, log, or
portable bundle. No CORS grant or browser credential is accepted as host
authority. The endpoint accepts loopback peers only and is disabled unless all
of these server-owned settings are present:

- `CLAWMAX_DEV_HOST_SKILL_AUTHORITY=1`
- `DASHBOARD_APP_URL=http://localhost:5174`
- `NODE_ENV` is not `production`
- `CLAWMAX_DEV_HOST_AUTH_KEY` is the shared 64-character hex secret
- `CLAWMAX_INSTANCE_KEY` is the connected dev instance key
- `CLAWMAX_DEV_HOST_WORKSPACE_ID` is the isolated workspace ID
- `CLAWMAX_DEV_HOST_ACTOR_ID` exactly equals the explicitly configured
  `CLAWMAX_CLI_LOCAL_ACTOR_ID`
- `CLAWMAX_TEMPLATE_AUTHORITY_DIR` and `CLAWMAX_TEMPLATE_RUNTIME_REVISION`
  point to the current server-owned Template authority registry

The request body is exactly the CLI's
`clawmax.credential-broker-agent-skill/v1alpha1` `AgentSkillExecutionRequest`
fixture, at most 4 KiB. No extra fields. `skillName` and `operation` are
bounded identifiers; `credentialNames` is a sorted, unique list of up to eight
names that must exactly match the Agent's current binding. Dashboard validates
the Skill and credential binding, **not** a command-by-command approval list.
Once the Agent's installed Skill is bound and the user is authenticated, the
Agent may use the full capability described by that Skill. The host uses the
signed, installed Skill/CLI contract to interpret operations; a request may
not replace the executable with arbitrary shell text. The issued-to-expiry
window must be live and no longer than 60 seconds. This read-only query is not
a replay ledger.

Successful response:

```json
{"apiVersion":"clawmax.host-agent-skill-authority/v1alpha1","kind":"HostAgentSkillAuthority","requestId":"<same request ID>","instanceKey":"<exact dev instance>","workspaceId":"<exact isolated workspace>","workspaceRevisionId":"<current revision>","agentId":"<revision-owned Agent ID>","actorId":"<dev owner ID>","skillName":"<bound Skill name>","skillDigest":"sha256:<installed SKILL.md SHA-256>","credentialNames":["<exact bound name>"],"connected":true,"ownerAuthorized":true,"skillInstalled":true}
```

The Dashboard rereads the revision and operator-owned authority registry,
checks actor and Agent ownership, hashes the no-follow installed `SKILL.md`,
then rechecks the revision and authority. It returns no file path, token, grant,
or raw CLI output. The Mac host must match every identity and digest against
its request and independently hash its own local Skill file immediately before
child start. A positive response is evidence for one check, not permission to
skip the host's later rechecks.

Errors are `no-store` JSON `{apiVersion,kind:"Error",code}`. Stable codes:
`host_unavailable` (404), `host_unauthorized` (401), `invalid_request` (400),
`invalid_or_expired_request` (400), `authority_revoked` (403), and
`authority_unavailable` (403). Errors contain no private paths or values.

## Remaining joint gate

CLI must wire a host-initiated client and its current-authority resolver to
this endpoint, using the connected instance and private host key rather than
browser input. Agree on secure dev-key provisioning and the matching macOS
Skill file. The installed Skill contract, not a caller-controlled flag, classifies operations:
read-only operations may be retried with a **fresh** request ID after a timeout,
while mutating operations need durable replay/uncertain-outcome protection.
Do not recycle a request ID or skip current-authority checks on either path.
Then run cancellation, replay/crash, revocation between host checks, failed
refresh, non-owner, wrong instance, tampering, and no-secret-egress tests. Do
not expose a live action until those tests pass.
