# ClawMax Status

**Current Version**: v1.4.7
**Last Updated**: May 12, 2026
**Status**: Release surfaces refreshed for the current 1.4.x dashboard/runtime line

---

## Current State

- `v1.4.7` is the next dashboard release candidate/tag target.
- Latest work included in this line:
  - agent-to-agent direct messaging API
  - template actions cleanup and delete confirmation
  - expanded proposal template catalog
  - workflow import/validation and integrations status surfacing
- README now summarizes only the three most recent dashboard releases.
- Completed backlog items from the older March/April sprint board are archived out of the active backlog.

## Active Product Focus

### On-Prem Runtime Correctness
- validate per-instance metering identity and non-shared on-prem runtime identity
- finish Ollama-default visibility flow in BYOK/runtime surfaces
- reduce false-negative embedded gateway warnings when dashboard and agent chat are healthy

### Cloud / Regional Runtime Hardening
- keep multi-region cluster DNS/TLS automation aligned with new shared-cluster expansion
- preserve clean maintenance/redeploy health reporting after cutover

### Template & Workflow UX
- continue template discovery and proposal-template promotion work
- productize direct agent-to-agent coordination beyond the initial API slice
- keep workflow validation/import flows clean for onboarding and runtime execution

## Release Guidance

- Use `CHANGELOG.md` as the full release history.
- Keep README limited to the latest three releases only.
- Archive completed sprint/backlog work instead of leaving it in the active backlog.
