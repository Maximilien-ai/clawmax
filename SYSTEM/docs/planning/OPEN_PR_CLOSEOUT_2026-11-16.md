# Open PR closeout — November 16

Dashboard is auditing every remaining PR against current main. Stable remains
v1.9.9; development is 2.0.0. Merge validated useful changes, preserve current
security/recovery work, and retain unresolved migrations explicitly. No RC98
image or deployment is implied by source merges.

## Already completed

- [x] #191 provider defaults and #194 native history: owner accepted; merged
  `662d23ae` and `5fbce719` after required checks.
- [x] #424 Resend and #421 seven compatible updates: merged `08b4779d` and
  `e2cd7796`; combined candidate `eb70f0e8` passed 582/582 local integration,
  validation and coverage checks with the caller registry unchanged. Required
  PR CI/CodeQL passed. Main tree `95caa36eddb7888a455ee2bce656716109a03ff5`
  is identical to that tested tree.
- [x] Preserved owner preview at http://localhost:5182 refreshed to
  `2.0.0-dev.e2cd7796`; private workspace/settings retained.

## Quieter dependency automation (#430)

Weekly Dashboard checks, up to eleven routine slots across four ecosystems,
individual major updates and automatic rebases created the volume. Editing the
configuration also triggers a one-off refresh; the grouping correction exposed
six additional proposals while the first batch was closing.

The proposed policy uses monthly checks everywhere, two Dashboard slots and one
each for Actions, Docker and the optional-memory package: five routine PRs total.
Routine releases settle for fourteen days; optional npm majors settle for ninety.
React, React DOM and their types are grouped together. The existing Node LTS
exception remains; no new ignore rules are added. Security alerts and automated
security fixes were verified enabled. Security updates retain their independent
limits and bypass version-update cooldowns; see the
[GitHub reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
Existing open proposals still require cleanup; the settings do not retroactively
close them. One final refresh when settings land is expected.

## Remaining engineering queue

| PR | Scope | Current assessment / next action |
| --- | --- | --- |
| #430 | Checkout v7 and quieter automation | Official Node 24 action runtime verified; policy/scope/image contracts pass; run current-head focused CI/CodeQL, then merge first |
| #429 | Docker login action v4 | Review official action/runtime and credential inputs; preserve publishing gates; validate current base and merge if green |
| #428 | QEMU action v4 | Inspect artifact-roundtrip failure, distinguish transport flake from action incompatibility, then validate |
| #427 | Node 24.22.2 image patch | Align all reviewed Node pins and validate native macOS/Linux arm64/amd64 behavior; Docker-only bump currently fails the pin contract |
| #431 | Marked 18.2.0 / parser 8.72.2 | Clean dependency graph, rendering/PDF/browser and affected tests before merge |
| #432 | Tracing family | Retains #418's incompatible-peer migration; audit real consumers before choosing upgrade/removal or closing a duplicate |
| #422 | Tailwind 4 | Failing CSS/PostCSS migration; retain explicit follow-up if deferred |
| #423 | React 19 | React/DOM/types split; evaluate a coordinated migration, not the failing pair |
| #425 | TypeScript 7 | Current parser requires TypeScript <6.1; retain a supported-toolchain follow-up if deferred |
| #192 | AgentForge export | Main already contains consented export hardening; compare remaining Windows CLI and workspace-filtering changes before any closure |
| #228 | Managed local Gateway | Startup/state-ownership behavior still differs from main; reconcile as a stability fix |
| #229 | Genuine Gateway live text | New observer is absent on main; depends on #228 and requires session/run isolation, settlement and real-stream validation |
| #292 | OpenCode runtime | Separate optional feature; reconcile current adapters and validate the actual CLI/session behavior before deciding inclusion |

No independent owner checks are assigned by this audit table. Any later request
will be a short concrete checklist limited to human judgment or an unavailable
external environment. Engineering owns tests, browser checks and CI.

## Evidence and retained limits

- #430 policy validation uses parsed YAML locally plus six regression guards for
  cadence, limits, cooldown, default-branch scope and newly introduced ignores.
  Focused policy/scope/mirror tests: 20/20. Existing builder, promotion and
  container-lifecycle contracts pass. Automation-only changes do not repeat the
  full Dashboard suite; dependency/runtime/product changes do.
- Security gating is unchanged. Most recent compatible combined dependency
  audit: zero High/Critical, ten Moderate across 577 reported dependencies.
  Dashboard owns residual assessment before stable 2.0; this is not a full audit.
- #426 retains the reproduced pre-existing PDF task-list layout defect; it is
  not introduced or closed by dependency updates.
- Exact new heads, CI links, merge/closure reasons and validation receipts belong
  on each PR, so evidence-only commits do not continuously restart CI.
