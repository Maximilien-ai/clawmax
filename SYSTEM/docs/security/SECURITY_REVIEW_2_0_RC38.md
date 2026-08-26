# ClawMax 2.0 RC38 Security Review

> Review date: August 12, 2026
> Reviewed code: `79262f35f9721b42a8247a5de4a3bfae6f11e13d`
> Decision: source security sign-off complete; final-candidate release-artifact appendix in progress

## Verdict

The public dashboard source meets the 2.0 security exit criteria at the reviewed
commit. There are no unresolved Critical or High findings. The one remediated
Medium finding has regression evidence, and all three accepted Medium findings
have an owner, rationale, compensating controls, and September 30, 2026
follow-up date.

This report does not authorize promotion of an unbuilt candidate. Final release
sign-off must append the exact accepted public commit/tag, public amd64/arm64 image
digests, authorized combined-image evidence maintained in the private repo,
cloud/on-prem runtime results, and completed Release Review export. No rebuild
may inherit this sign-off without rerunning affected gates.

## Review Coverage

- Authentication, sessions, production bypass, credentialed CORS, CSRF-adjacent
  browser boundaries, security headers, rate limiting, and audit metadata.
- Endpoint authorization, active-workspace isolation, shared dashboards,
  runtime capabilities, broker grants, OAuth connections, and plugin grants.
- Secret storage/exposure, child-process environments, mail operations,
  Activity Export consent/redaction/revocation, logs, and traces.
- Inputs, paths, uploads, ZIP extraction, YAML frontmatter, imported skills,
  subprocesses, outbound HTTP, registry imports, and operator URL overrides.
- Container defaults, npm dependencies/licenses, tracked secrets, GitHub Actions,
  image provenance, and release evidence requirements.

Private plugin implementation details were not copied into this public report.
The public host contract, capability enforcement, package privacy, and combined
image boundary are in scope; private feature evidence remains private.

## Reproducible Evidence

| Check | Result |
|---|---|
| `npm audit --json` | 509 dependencies; 0 vulnerabilities at every severity |
| `npm run security:audit` | Passed with zero High/Critical and no exception list |
| CycloneDX SBOM | 470 components; SHA-256 `35182e17caee4a023ba0b3f1dca5d2d6c47a955f2b7543dd3daf7f25415ff3b9` |
| License inventory | 509 packages; declared permissive/MPL/CC licenses; `spawn-command` lacks package metadata but its retained LICENSE is MIT |
| Tracked secret scan | No real key/private-key signatures; only `.env.example` placeholders matched |
| Tracked key-like files | Only `SYSTEM/dashboard/.env.example` |
| Endpoint matrix | 29 unique route families classified |
| Static boundary regression | 42 assertions passed |
| Live HTTP boundary regression | 14 assertions passed |
| Archive regression | 8 adversarial extractor assertions plus workspace/agent/import suites |
| Command regression | Workflow cron, skill import, and literal agent-id argv tests passed |
| Agent route regression | 41 tests passed |
| TypeScript | Passed after all remediations |
| Full local gate at `976c3c83` | 447/447 passed; live agent chat and workflow DAG passed |
| Coverage at `976c3c83` | 80.51% statements/lines; 68.65% branches; 90.58% functions |
| Main CI at `976c3c83` | Passed in run `31615940283` |

Machine-readable artifacts are retained under
[`artifacts/`](artifacts/README.md). The final source-tree gate passed locally
at `976c3c83`, and [main CI run `31615940283`](https://github.com/Maximilien-ai/clawmax/actions/runs/31615940283)
passed on the same commit. The intervening CI runs were superseded and canceled
as focused commits landed; the final run covers the complete source tree.

## Findings And Residual Risk

The complete register is
[`SECURITY_FINDINGS_2_0.md`](SECURITY_FINDINGS_2_0.md). Eight High and one Medium
findings were fixed. Three Medium deployment/supply-chain risks are accepted for
2.0: root container execution, trusted major-tag Actions, and disabled OCI
provenance. These acceptances do not extend to a future multi-tenant service.

Imported executable skills, local host/operator compromise, model prompt
injection, and third-party provider compromise remain inherent external trust
risks. Capabilities, grants, redaction, bounded adapters, and explicit operator
enablement reduce but cannot eliminate them.

## Final-Candidate Release-Artifact Appendix

Complete before promotion:

| Required evidence | Status |
|---|---|
| Accepted public candidate | RC43 tag `v2.0.0-test-rc43` at `a4b78c1d12136e21707e926c3d2a0e8cc0b1a1d0` |
| Full integration, validation, coverage, and live execution at final source | Passed 463/463; coverage 81.14% statements/lines, 69.40% branches, 91.19% functions |
| Public amd64/arm64 publication and smoke | Passed in [run 32658795332](https://github.com/Maximilien-ai/clawmax/actions/runs/32658795332) |
| Public multi-architecture manifest | `sha256:8af1e160106db1acab5e9b853743cad943effe8de5d52dc11890dd0b2b715c44` |
| Authorized combined image against exact public tag | Passed private validation, source-lock, package privacy, discovery, and live amd64/arm64 smoke; detailed evidence retained privately |
| Managed/cloud health, restart, chat, workflow, plugin persistence | Pending final candidate |
| On-prem health, restart, chat, workflow, plugin persistence | Pending final candidate |
| Completed sanitized Release Review export and approver | Pending hands-on review |
