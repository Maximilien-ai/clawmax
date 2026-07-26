# ClawMax 2.0 RC15 Security Baseline

> Date: July 26, 2026
> Scope: public dashboard dependency and configuration baseline
> This is an initial baseline, not the complete pre-2.0 security audit.

## Result

The initial dependency scan reported:

- 3 Critical
- 10 High
- 16 Moderate
- 1 Low

Compatible dependency updates plus deliberate Archiver and Vite toolchain
upgrades reduced the final result to:

- 0 Critical
- 0 High
- 8 Moderate
- 0 Low

`npm run security:audit` now rejects new High or Critical dependency advisories,
and main CI runs that gate before starting the dashboard.

## Remediation Included

- Updated vulnerable transitive dependencies within compatible ranges.
- Upgraded `archiver` from 7 to 8, removing the remaining production archive
  dependency's High-severity expansion/denial-of-service chain.
- Upgraded Vite and its React plugin to the patched Vite 8 line, removing the
  remaining High development-server advisory.
- Aligned documented and enforced local prerequisites with the existing
  Node.js 22.19 container and CI baseline.
- Rebuilt the production client and server successfully after upgrades.

## Residual Medium Risk

The remaining eight audit entries are one transitive OpenTelemetry advisory
chain rooted in unbounded W3C baggage allocation. The patched exporter line is
a breaking telemetry upgrade and must be validated with Opik tracing rather
than forced into RC15.

- Severity: Medium
- Owner: ClawMax 2.0 security audit
- Deadline: before final `2.0.0`
- Current controls: tracing is optional, can be disabled by the operator, and
  application request parsing retains its normal size limits.
- Required follow-up: upgrade the OpenTelemetry family together, add oversized
  baggage/header tests, verify Opik traces, and repeat container smoke tests.

## Additional Baseline Checks

- A tracked-source scan found no GitHub token, OpenAI key, AWS access-key, or
  private-key signatures matching the baseline patterns.
- Existing negative suites cover safe environment exposure, brokered skill
  secrets and grants, mail OAuth state/token behavior, workspace upload
  ownership, path boundaries, plugin capability denial, and auth/OTP edges.
- The full audit still needs an endpoint authorization matrix, dynamic
  wrong-workspace testing, SSRF review, production bypass-mode review, upload
  and archive adversarial testing, container-user/header review, SBOM, and
  action pinning/provenance analysis.

## Evidence Commands

```bash
cd SYSTEM/dashboard
npm audit --audit-level=high
npm run typecheck
npm run build
```

Release evidence must also include the full integration/validation/coverage
gate and public/private multi-architecture image smoke checks.
