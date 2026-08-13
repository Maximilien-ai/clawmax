# ClawMax 2.0 Security Findings Register

> Reviewed: August 12, 2026
> Code under review: `79262f35f9721b42a8247a5de4a3bfae6f11e13d`

## Summary

| Severity | Found | Open | Fixed | Accepted |
|---|---:|---:|---:|---:|
| Critical | 0 | 0 | 0 | 0 |
| High | 8 | 0 | 8 | 0 |
| Medium | 4 | 0 | 1 | 3 |

## Resolved Findings

| ID | Severity | Finding | Resolution and verification |
|---|---|---|---|
| SEC-001 | High | Credentialed CORS reflected arbitrary browser origins. | Fixed in `0156fd94` with an explicit allowlist; hostile-origin live test. |
| SEC-002 | High | Template registry proxy/import routes were not behind dashboard auth. | Fixed in `0156fd94`; protected-mount and unauthenticated boundary tests. |
| SEC-003 | High | A guessable workspace/dashboard slug could act as a public share credential. | Fixed in `0156fd94`; only a random 192-bit token authorizes a read. |
| SEC-004 | High | `gray-matter` resolved vulnerable `js-yaml@3.15.0`, and the audit gate carried a temporary exception. | Fixed in `a5f2908d` by resolving `3.15.1` and deleting the exception; `npm audit` reports zero vulnerabilities. |
| SEC-005 | High | Workflow cron management interpolated identifiers into a shell command. | Fixed in `e89e635d` with `execFileSync`; eight adversarial cron assertions. |
| SEC-006 | High | Skill Git import used a shell string and accepted traversal in a registry subdirectory. | Fixed in `e89e635d`; argument-vector clone and absolute/parent-path rejection with route regressions. |
| SEC-007 | High | ZIP imports/extraction lacked uniform traversal, symlink, overwrite, and expansion limits. | Fixed in `03ad30ee`; shared bounded extractor plus eight adversarial archive tests and upload/import/transfer regressions. |
| SEC-008 | High | The agent doctor health probe interpolated a workspace directory name into a shell command. | Fixed in `79262f35`; all affected OpenClaw/lsof/kill calls use argv and an adversarial id stays one literal argument. |
| SEC-009 | Medium | Static responses removed `nosniff`; framing, referrer, and API cache policies were inconsistent. | Fixed in `57da531a`; central headers and 42 static plus 14 live boundary assertions. |

## Accepted Medium Findings

### SEC-010: Runtime container executes as root

- Decision: accepted for the single-tenant 2.0 on-prem image.
- Rationale: OpenClaw global installation and customer-mounted workspace/state
  volumes have existing root ownership assumptions. A late user switch risks
  breaking clean install, upgrades, and persisted on-prem workspaces.
- Compensating controls: single-tenant operator trust model, container/host
  isolation, explicit volumes, no Docker socket mount, bounded dashboard APIs,
  and no claim that the container is a multi-tenant security boundary.
- Owner: Runtime and CLI maintainers.
- Follow-up: add a rootless image/profile and deployment hardening (`cap_drop`,
  `no-new-privileges`, read-only paths where compatible) by September 30, 2026.

### SEC-011: GitHub Actions use trusted major tags, not immutable SHAs

- Decision: accepted for 2.0.
- Evidence: five workflow files contain 22 action uses and zero SHA-pinned uses.
- Compensating controls: trusted GitHub/Docker publishers, minimal explicit job
  permissions, no `pull_request_target`, lockfile installs, isolated secrets,
  and exact post-build image checks.
- Owner: Release Engineering.
- Follow-up: pin actions to reviewed commit SHAs and add automated update policy
  by September 30, 2026.

### SEC-012: OCI provenance is disabled in image build/promotion

- Decision: accepted for 2.0.
- Rationale: existing multi-architecture promotion expects image-only manifest
  behavior and currently disables provenance explicitly.
- Compensating controls: tested source SHA and version are embedded, each
  architecture is smoke-tested, promotion operates on exact manifest digests,
  and the final review records those digests.
- Owner: Release Engineering and CLI maintainers.
- Follow-up: enable attestations/SBOM publication without changing pull or
  promotion semantics by September 30, 2026.

## Closed Baseline Item

The RC15 OpenTelemetry Medium advisory chain is no longer present. The current
lockfile resolves the compatible OpenTelemetry family and the final npm audit
reports `0` Critical, High, Moderate, Low, and Info vulnerabilities.

