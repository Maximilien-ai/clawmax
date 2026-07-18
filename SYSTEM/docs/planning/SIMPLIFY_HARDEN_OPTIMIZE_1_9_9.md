# Simplify / Harden / Optimize 1.9.9

> Status: in progress; native OpenRouter implemented
> Baseline: promoted `1.9.8`
> Runtime baseline: OpenClaw `v2026.6.11`
> Last updated: July 18, 2026

## Goal

Make workspace secrets usable by explicitly authorized agent skills without exposing a general-purpose secret-reading capability to the agent or language model. Keep the work bounded and independently releasable before the broader `2.0.0` plugin/evaluation program.

Public AI scoring remains a `2.0.0` product feature. `1.9.9` may add independently useful schemas, fixtures, or test primitives that reduce later implementation risk, but it must not ship a competing scoring API or partial user-facing scoring experience.

The public xAI, OpenRouter, Gmail, and Microsoft 365 research and release split is tracked in [PUBLIC_MODELS_GATEWAYS_EMAIL_1_9_9_2_0.md](PUBLIC_MODELS_GATEWAYS_EMAIL_1_9_9_2_0.md). Native OpenRouter is implemented on this branch and awaits real-key local/container smoke. Native xAI and the mail security foundation remain bounded `1.9.9` candidates; production Gmail and Outlook mailbox actions target public `2.0.0` partner plugins.

## Tester Problem

Mike saved Google credentials in `Keys & Secrets` and expected an assigned Google skill to use them during agent chat. That does not work today:

- general `Keys & Secrets` values are stored in a browser-local vault
- agent chat and tools execute in the server/container runtime
- browser-local values are not automatically available to that runtime
- `safeEnv()` forwards only approved provider keys and server-managed integration values
- workflow-specific secrets work only because the workflow request explicitly carries them

The UI centralizes secret capture and readiness, but it does not yet provide a secure browser-vault-to-agent-skill execution contract.

## Security Decisions

- Do not add a generic `read-secret`, `list-secrets`, or vault browsing skill.
- Do not inject all workspace secrets into the OpenClaw/agent process environment.
- Do not place secret values in prompts, agent memory, workspace Markdown, chat transcripts, workflow records, logs, or error messages.
- Do not encourage storage of a normal Google account password. Prefer OAuth, service-account credentials, or a Google app password when the specific integration supports it.
- Grant access to a named skill and named secret requirements, not to an agent without context.
- Workspace scope overrides global scope only through an explicit, testable resolution rule.
- Imported skills remain a trust boundary: granting a skill a secret authorizes that skill to use it. The UI must identify the skill, requested keys, and risk before granting access.
- Keep private `2.0.0` guardrail/evaluation plugins out of this release. The contract must remain generic.
- Keep AI scoring itself public: the future scoring contract, rubric, explanations, and product UI belong in the public `2.0.0` architecture. Only proprietary plugin implementations remain private.

## Proposed Contract

### 1. Declarative requirements

Skills declare stable environment-style keys through existing requirement metadata:

```yaml
requires:
  env:
    - GOOGLE_CLIENT_ID
    - GOOGLE_CLIENT_SECRET
```

Secret requirements must use validated uppercase identifiers. Wildcard requests are invalid.

### 2. Explicit grants

Record each grant with:

- workspace id
- agent id
- skill id and immutable skill fingerprint/version
- permitted secret key names
- creation/update time
- optional expiration and revocation state

Changing the skill fingerprint or adding a required key invalidates readiness until the user reviews the request.

### 3. Runtime secret resolver

Introduce a server-side resolver interface with providers for:

- runtime/infrastructure environment secrets
- workspace-managed encrypted secrets
- an explicit per-request browser-vault envelope for local preview flows

The resolver returns only granted keys required by the selected skill. APIs return presence, source, and masked summaries, never raw values.

Production cloud/on-prem deployments should use an infrastructure secret manager or an encrypted server-side store backed by an operator-provided master key. Browser storage remains a convenience and must be labeled accordingly.

### 4. Skill execution broker

Run an authorized skill through a broker that:

- verifies workspace, agent, skill fingerprint, and grant
- resolves only declared keys
- creates a child environment for the skill subprocess, not the parent agent process
- uses a fixed/validated skill entrypoint instead of accepting arbitrary shell text
- captures output with size/time limits
- redacts known values from stdout, stderr, errors, audit events, and returned tool content
- records key names and result status for audit without recording values

The agent may invoke the authorized skill, but it cannot enumerate the vault or obtain the raw resolver response.

### 5. Google guidance

The first documented example must distinguish:

- OAuth client id/secret plus refresh-token flow for user-account APIs
- service-account JSON for supported Workspace/service APIs
- Google app passwords only for supported protocols such as SMTP/IMAP
- normal Google account passwords, which must not be requested or recommended

The Google skill declares the credential type it supports instead of requesting a generic `GOOGLE_PASSWORD`.

## Delivery Plan

### Phase 0: Current-state clarity

- Distinguish browser capture from runtime availability in `Keys & Secrets`.
- Label values as browser-local, workspace-managed, or runtime-managed.
- Show `Not available to agent runtime` instead of a misleading ready state.
- Link skill readiness to the correct secret configuration/grant flow.

### Phase 1: Grant and resolution model

- Define versioned grant and secret-presence schemas.
- Add key validation, scope resolution, fingerprint invalidation, revocation, and masked inventory APIs.
- Reuse existing `requires.env` and secret-requirement metadata where possible.
- Add an encrypted workspace provider only when an operator key is configured; fail closed otherwise.

### Phase 2: Brokered skill execution

- Add the fixed-entrypoint execution broker.
- Pass a capability reference to the agent/tool path rather than raw values.
- Inject resolved values only into the authorized skill subprocess.
- Redact broker output, errors, activity, logs, and execution history.
- Preserve provider BYOK and managed partner behavior while compatible integrations migrate toward the broker.

### Phase 3: Product flow

- Add `Authorize secrets` to skill assignment/readiness.
- Display requested key names, scope, source, skill fingerprint, and revocation controls.
- Require reauthorization when requirements or skill content changes.
- Add Google credential-type guidance without accepting a normal account password.

### Phase 4: Validation and release

- Exercise local, cloud/container, and on-prem paths.
- Restart containers and verify configured grants/encrypted secrets persist.
- Verify browser-local preview values do not silently become server-persisted.
- Cut `1.9.9-test-rc1` only after security-negative tests pass.

### Phase 5: public provider and mail foundation

- Validate the implemented native OpenRouter identity with a real key on the pinned local and container runtime.
- Add native xAI only after compatibility probes pass on the pinned OpenClaw image.
- Keep hosted gateways separate from the current LM Studio-oriented OpenAI-compatible execution path.
- Define the public mail capability schema, fake provider, partner readiness states, and OAuth/test-account runbooks.
- Do not expose production mailbox actions until the public `2.0.0` partner-plugin approval and audit contract is ready.

## Automated Test Matrix

### Unit and contract tests

- global/workspace/per-request resolution precedence
- missing operator encryption key fails closed
- malformed, wildcard, undeclared, and newly added key requests are rejected
- agent, workspace, skill id, and skill fingerprint mismatches are rejected
- revocation and expiration are enforced
- unassigned skills cannot receive grants
- inventory responses remain masked
- values are removed from stdout, stderr, exceptions, logs, audit records, chat output, and workflow history

### Controlled runtime integration

Create a fake agent and assigned skill requiring `CLAWMAX_TEST_SECRET`. Its fixed entrypoint reports only `SECRET_AVAILABLE=true` and a non-reversible test fingerprint.

Verify:

- the authorized skill subprocess receives the expected value
- the parent agent/OpenClaw environment does not contain it
- an unrelated skill cannot request it
- another agent and workspace cannot use the grant
- changing the fake skill fingerprint invalidates the grant
- asking the agent to print, list, or echo secrets does not reveal it
- deliberately echoing it from the fake skill is redacted before user-visible or persisted output

### Container integration

- run the controlled test in the multi-architecture image path
- cover runtime-managed and encrypted workspace-managed providers
- restart and repeat without stale in-memory state
- scan dashboard/OpenClaw logs and workspace artifacts for the sentinel
- verify the sentinel is absent from workspace exports and support-log bundles

### Manual validation

- authorize a non-production Google test credential to a compatible test skill
- run direct chat, group chat, and a workflow using the agent/skill
- revoke the grant and confirm the next execution fails with actionable guidance
- change the skill requirement/fingerprint and confirm reauthorization is required
- inspect Keys & Secrets, skill details, logs, activity, and history for masked-only presentation

## Release Gates

- No generic secret enumeration or retrieval API is reachable by agents or skills.
- Raw values never enter the parent agent process environment.
- Every grant is workspace-, agent-, skill-, fingerprint-, and key-scoped.
- All negative authorization and redaction tests pass.
- Full validation/coverage passes without reducing coverage percentages.
- amd64 and arm64 image builds plus registry smoke pass.
- One local and one containerized Google test pass using a non-primary credential.
- Documentation explicitly rejects normal account-password storage.

## Non-Goals For 1.9.9

- a universal secret-manager implementation for every provider
- unrestricted shell execution with injected secrets
- automatic authorization based only on skill assignment
- exposing raw secrets to AI prompts
- changing the OpenClaw baseline in the same RC track
- shipping private guardrail/evaluation plugins
- shipping the public AI-scoring product before the shared `2.0.0` contract is ready

## Open Questions Before Implementation

- Which production provider is the minimum for `1.9.9`: encrypted file, Kubernetes Secrets, or both?
- Can current OpenClaw skill invocation call a fixed ClawMax broker entrypoint, or is a ClawMax-managed tool adapter required?
- Should grants expire by default or remain until revoked/fingerprint change?
- Which Google skill and credential mode will be the first real integration test?
- Can pinned OpenClaw `v2026.6.11` execute `xai/grok-4.5`, which was released after that baseline, through dynamic discovery?
- Which OpenRouter discovery and model-list limits keep the dashboard usable without caching stale provider state?
