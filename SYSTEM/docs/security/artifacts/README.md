# ClawMax 2.0 Security Artifacts

Generated August 12, 2026 for reviewed source commit
`79262f35f9721b42a8247a5de4a3bfae6f11e13d`.

| Artifact | Description | SHA-256 |
|---|---|---|
| `clawmax-dashboard-2.0.cdx.json` | npm CycloneDX 1.5 SBOM, 470 components | `35182e17caee4a023ba0b3f1dca5d2d6c47a955f2b7543dd3daf7f25415ff3b9` |
| `clawmax-dashboard-licenses.csv` | Lockfile package/version/license inventory | `8270938dcdfe1ecb1f1e2be791b03120340cdc85985eb12c7eca717003054232` |
| `npm-audit-2.0.json` | npm advisory result with zero vulnerabilities | `94f40b5f9322c71505c252f10d6f853ca7ce7cca0eebdd258d83a5c589ce3b45` |

Recreate from `SYSTEM/dashboard` with:

```bash
npm audit --json
npm sbom --sbom-format cyclonedx
```

The license CSV is inventory evidence, not legal advice. `spawn-command@0.0.2`
omits a package metadata license field; its installed `LICENSE` contains the MIT
license text and was reviewed manually.

