# Backlog

> Last updated: 2026-05-12
> Completed March/April items archived in `SYSTEM/docs/archive/COMPLETED_1_4_7_BACKLOG_SWEEP.md`

## Highest Priority

### On-Prem Runtime
- [ ] **Gateway false-negative health warning** — reduce cases where the embedded gateway probe is degraded while dashboard + agent interactions are still healthy.
- [ ] **On-prem metering identity separation** — key runtime/metering state by `instance_key` and/or `machine_id`, not generic hostname.
- [ ] **Ollama BYOK visibility** — ensure on-prem runtime shows Ollama cleanly in BYOK when the runtime contract is enabled and the base URL is reachable.
- [ ] **Maintenance UX follow-through** — keep the scheduled banner + local maintenance-page flow stable during redeploy/update cutovers.

### Cloud Runtime
- [ ] **Shared-cluster DNS/TLS automation** — when new shared clusters appear (`lon1-2`, `nyc1-2`, etc.), automate DNS wildcard + TLS provisioning instead of relying on manual ops.
- [ ] **Cluster expansion contract** — persist cluster label / LB host cleanly so public health checks, ingress, and support diagnostics stay aligned.
- [ ] **Post-maintenance redeploy finalization** — continue hardening action completion/writeback after maintenance cutovers.

## Product / UX

### Templates
- [ ] **AI Generate outputs TEMPLATE.md** — generate markdown-native templates from the wizard.
- [ ] **Wizard exports TEMPLATE.md** — allow download/save of markdown-native templates.
- [ ] **Template discovery suggestions** — show similar templates/workflows and AI recommendations when exact matches are missing.
- [ ] **Template feedback and promotion flow** — move strong proposal templates into promoted catalog tiers with user feedback.

### Workflows & Agents
- [ ] **Direct messaging productization** — build on the new agent-to-agent direct messaging API with dashboard UX and runtime follow-through.
- [ ] **Workflow input validation depth** — keep expanding workflow customization validation beyond the first pass.
- [ ] **Structured runtime defaults** — align workspace/default model/provider state across local on-prem and cloud runtime flows.

## Ops / Platform
- [ ] **OAuth clean-room validation** — fresh-machine verification of auth/session/cookie behavior.
- [ ] **Workspace backup/restore** — manual export/import before any automated backup work.
- [ ] **Dashboard smoke/regression automation** — preserve deterministic local and CI validation on the current runtime line.

## Notes

- Full completed history belongs in `CHANGELOG.md` and docs archive, not in this active backlog.
- Keep this file focused on live work only.
