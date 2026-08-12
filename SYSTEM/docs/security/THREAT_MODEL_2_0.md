# ClawMax 2.0 Threat Model

> Reviewed: August 12, 2026
> Source commit: `79262f35f9721b42a8247a5de4a3bfae6f11e13d`
> Scope: public dashboard, its OpenClaw runtime boundary, and public plugin contracts

## System And Assets

ClawMax 2.0 is a single-tenant dashboard that operates one active workspace at
a time. It manages agent and workflow definitions, workspace documents,
provider credentials, OAuth connections, plugin records, runtime grants,
activity-export consent, and OpenClaw processes. The assets requiring the
strongest protection are provider and OAuth secrets, workspace content, agent
and workflow execution authority, plugin grants, session credentials, and
release artifacts.

Enterprise multi-tenancy is outside this release and requires a separate threat
model. A local operator with access to the host, mounted workspace, process
environment, or Docker socket is trusted for this model.

## Actors

- An authenticated dashboard user operating the active workspace.
- An unauthenticated browser or network client.
- An agent or skill holding a short-lived, signed capability token.
- An installed plugin limited by manifest validation and explicit capabilities.
- A remote identity, model, mail, registry, or Activity Export provider.
- A host and release operator controlling configuration and deployment.
- A malicious imported archive, skill, template, markdown file, or message.

## Trust Boundaries

| Boundary | Data crossing it | Primary controls |
|---|---|---|
| Browser to dashboard | Sessions, JSON, uploads, OAuth state | Dashboard auth, strict credentialed CORS, rate limits, bounded parsing, no-store API responses, security headers |
| Public link to shared dashboard | Snapshot reads | Random 192-bit share token; workspace slug is not authorization |
| Dashboard to active workspace | Documents, agents, workflows, plugins | Canonical paths, id validation, active-workspace scoping, ownership tests, bounded archive extraction |
| Dashboard to OpenClaw/CLI | Commands, prompts, model configuration | Argument-vector subprocesses, fixed commands, safe environment construction, timeouts, session-conflict recovery |
| Agent/skill to secret or mail broker | Secret resolution and mailbox operations | Signed short-lived capability, exact workspace/agent/skill/fingerprint/account grant, fixed operations, audit metadata |
| Plugin to host capabilities | Records, documents, notifications, actions | Manifest validation, deny-by-default grants, filtered workspace context, compatibility diagnostics |
| Dashboard to external service | OAuth, model, registry, mail, export traffic | Fixed provider adapters, configured endpoints, bounded timeouts/results, scoped credentials, redaction and consent |
| Build system to registries | Source, dependencies, OCI images | Lockfile, dependency gate, minimal workflow permissions, multi-architecture smoke, exact digest promotion |

## Principal Threats And Controls

### Identity And Cross-Site Requests

Threats include authentication bypass, session theft, credentialed cross-origin
requests, CSRF, clickjacking, and sensitive response caching. Cloud deployments
now reject all local bypass flags. Credentialed CORS accepts only configured
origins. Session cookies are HTTP-only with production secure attributes.
Framing is denied, referrers are suppressed, and API responses use `no-store`.
Local/on-prem bypass remains an explicit single-user operator mode and is
visibly warned when enabled.

### Authorization And Workspace Isolation

Threats include unauthenticated administrative routes, use of a guessable share
identifier, stale same-id agent records from another workspace, and explicit
workspace-id confusion. Every route family is classified in the authorization
matrix. Administrative routers require dashboard auth. Runtime routes require a
capability plus persisted grant. Share links authorize only with a random token.
Existing negative tests cover active-workspace records, ownership, scoped
grants, workspace-local costs, imports, dashboards, agents, skills, and
workflows.

### Secrets, Mail, And Exported Activity

Threats include credentials entering prompts, logs, process environments,
exports, or another agent's grant. Broker tokens and grants bind the workspace,
agent, capability owner, immutable fingerprint, secret/account, and operation.
Mail adapters expose bounded read/search/draft capabilities and no send action.
OAuth tokens are encrypted at rest and routine audit entries contain metadata,
not bodies or tokens. Activity sharing requires destination-specific consent,
redacts secrets and direct PII, purges queued events on revocation, and uses an
authenticated idempotent batch envelope.

### Files, Archives, And Imported Code

Threats include traversal, symlink escape, overwrite, decompression bombs, YAML
object abuse, and malicious executable skills/plugins. ZIP extraction rejects
non-canonical paths, symlinks, excessive entries, oversized members, and total
uncompressed data beyond the configured limits. Extracted files use exclusive
creation. Workspace, agent, skill, workflow, and document identifiers are
validated before path construction. Imported executable skills and plugins
remain an explicit operator trust decision and are called out in the UI/docs.

### Command And Network Execution

Threats include shell metacharacter injection, environment leakage, SSRF, and
unbounded remote calls. Confirmed workflow, skill import, and agent doctor shell
paths were replaced with argument-vector execution and adversarial regression
tests. Runtime child environments are allowlisted. Public registry imports are
restricted to supported GitHub locations. Provider, gateway, status, and export
override URLs are operator-controlled configuration, not request-supplied URLs;
they can reach operator-selected hosts by design and therefore inherit host
operator trust.

### Availability And Supply Chain

Threats include request floods, archive/resource exhaustion, vulnerable
dependencies, compromised CI actions, architecture drift, and untraceable
images. Rate limits, body limits, subprocess timeouts, bounded archives, a
zero-vulnerability npm audit, a retained SBOM, exact runtime pins, and
multi-architecture gates reduce this risk. Remaining accepted supply-chain
risks and deadlines are in the findings register.

## Assumptions And Residual Risk

- TLS terminates at the deployment ingress or reverse proxy.
- The single-tenant host operator is trusted and protects local files, mounted
  volumes, environment variables, and container/runtime administration.
- Agent model output, imported content, and email bodies are untrusted data.
- Third-party executable skills require operator review; the dashboard cannot
  make arbitrary imported code safe.
- Private plugin implementation details are reviewed in the private repository;
  this review covers their public host and packaging boundaries only.
- An independent penetration test is still recommended before broad enterprise
  exposure.

