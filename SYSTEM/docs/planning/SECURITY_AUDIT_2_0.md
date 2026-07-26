# ClawMax 2.0 Dashboard Security Audit

> Status: required before `2.0.0` promotion
> Scope: public dashboard and runtime integration surfaces, plus the public contracts used by separately packaged plugins

Initial RC15 dependency/configuration evidence:
[SECURITY_BASELINE_2_0_RC15.md](../security/SECURITY_BASELINE_2_0_RC15.md).

## Objective

Produce a repeatable, evidence-backed security assessment of the ClawMax
dashboard before the 2.0 release. The audit must cover source code, runtime
behavior, container packaging, configuration defaults, and the boundaries
through which agents, skills, partners, and plugins access user data or execute
actions.

This is a release gate, not a documentation-only exercise.

## Audit Scope

### Identity, Authentication, and Authorization

- GitHub OAuth, OTP, bypass/dev modes, cookies, sessions, logout, expiry, and
  cross-site request protections.
- Authentication requirements for every API, stream, websocket, and operational
  endpoint.
- Workspace isolation and authorization for agents, workflows, documents,
  notifications, integrations, and plugin records.
- Operator-only actions, including gateway recovery, configuration changes,
  imports, exports, and runtime diagnostics.

### Secrets and External Integrations

- Browser-local keys, managed secrets, encryption at rest, master-key handling,
  masking, logs, exports, and backup behavior.
- Brokered agent/skill grants, least-privilege scopes, revocation, expiry, and
  assurance that credentials do not enter model prompts or tool output.
- OAuth state/PKCE, callback validation, token refresh, provider scopes, and
  workspace/account isolation for Gmail, Microsoft 365, and future partners.
- Consent, redaction, durable outbox, authentication, replay protection, and
  immediate opt-out for Activity Export.

### Inputs, Filesystem, and Network

- Schema validation and injection resistance across JSON, markdown, YAML,
  templates, workflow inputs, plugin fields, filenames, URLs, and headers.
- Upload, archive extraction, file move/delete, symlink, path traversal, file
  disclosure, ownership, and workspace-boundary behavior.
- SSRF, redirect handling, DNS/private-network access, webhook/callback URLs,
  registry fetches, and partner destinations.
- Command/process execution, environment construction, shell arguments, OpenClaw
  invocation, agent tools, imported skills, and cancellation/timeouts.

### Plugin and Runtime Boundaries

- Manifest validation, capability grants, action-specific authorization,
  untrusted plugin data, API isolation, error containment, and disabled/missing
  plugin behavior.
- Public/private image composition and proof that private plugin source is not
  included in the public repository or public image.
- Agent, workflow, notification, DocHub, and plugin interactions that could
  cross workspace or user boundaries.

### Deployment and Supply Chain

- Production-safe environment defaults, exposed ports, CORS, headers, TLS/proxy
  assumptions, debug modes, health/diagnostic information, and container user
  permissions.
- Dependency vulnerability and license scans, lockfile integrity, SBOM,
  pinned/verified GitHub Actions, base-image provenance, multi-architecture
  parity, and secrets available to CI jobs.
- Sensitive-data redaction and retention in application logs, container logs,
  review exports, traces, notifications, and crash/error reports.

## Method

1. Create an attack-surface and trust-boundary inventory with data-flow notes.
2. Map each boundary to existing controls and tests; identify untested paths.
3. Run static analysis, dependency/container scans, secret scanning, and
   configuration review with versions and outputs recorded.
4. Exercise high-risk APIs dynamically using unauthenticated, wrong-workspace,
   malformed, oversized, replayed, and adversarial inputs.
5. Review every finding manually, remove false positives, assign severity and
   an owner, and add a reproducible test for confirmed defects.
6. Re-run the complete test, coverage, public-image, private-image, and
   clean-install smoke gates after remediation.

## Deliverables

- Threat model and attack-surface inventory.
- Endpoint/capability authorization matrix.
- Findings register with evidence, severity, affected versions, owner, fix, and
  verification status.
- Machine-readable scan artifacts where licensing permits retention.
- Regression tests for every confirmed code defect.
- Final release report listing residual risk and explicit sign-off.

Private plugin implementation findings stay in their respective private
repositories. Public host-contract or packaging findings are tracked and fixed
in this repository.

## Release Exit Criteria

- No unresolved Critical or High findings.
- Medium findings are fixed or explicitly accepted with an owner, rationale,
  compensating control, and follow-up date.
- Authentication bypass is unavailable in production defaults and visibly
  identified in test environments.
- Cross-workspace, secret-redaction, plugin-capability, upload/path, SSRF, and
  command-execution negative tests pass.
- Public and private amd64/arm64 images pass security and runtime smoke checks.
- The final report identifies the exact commit and image digests reviewed.

An independent penetration test is strongly recommended before broad enterprise
deployment. It complements this gate; it does not replace the internal audit.
