# Release 1.5.6 Completed Work

Archived May 21, 2026.

## Completed

- Public release packages are part of the tagged release flow: `clawmax-vX.Y.Z.tar.gz`, `clawmax-vX.Y.Z.sha256`, and `install.sh`.
- README and release distribution docs now document latest and pinned curl install flows, including `v1.5.6`.
- Local/self-hosted runtime behavior is deployment-aware across `local`, `onprem`, and `cloud`.
- Ollama remains available for local/native and on-prem runtimes, while cloud hides local-only providers by default.
- Same-Mac LM Studio and Ollama guidance now uses `host.containers.internal` for containerized on-prem installs.
- OpenAI-compatible endpoints now support model discovery and one-click default model selection.
- Agent model edits persist into active workspace runtime config and now align across detail, status, and chat.
- Dashboard chat uses direct BYOK execution where appropriate, avoiding misleading gateway-first fallback/auth warnings.
- Temporary local-provider runtime config stays schema-valid even when provider model lists are empty.
- The ClawMax.ai template registry MVP is implemented for browse/search, local import, duplicate detection, and the trusted write-token contract.

## Verification

- User verified local agent model edits now affect chat/status output correctly.
- User verified the gateway warning path no longer blocks working direct BYOK chat.
- Local automated suite passed before release prep: `SYSTEM/test.sh` reported `96/96`.
- Focused suites passed before release prep:
  - `server/routes/chat.test.ts`
  - `server/lib/agent-execution.test.ts`
  - `npx tsc --noEmit`
  - `git diff --check`

## Follow-Up Still Open

- Clean-machine curl install should be verified once the `v1.5.6` release assets are published.
- On-prem LM Studio and Ollama should be smoke-tested from a containerized dashboard using `host.containers.internal`.
- Template registry share/rate should be verified once product/web provides `TEMPLATE_REGISTRY_WRITE_TOKEN` in the dashboard runtime.
