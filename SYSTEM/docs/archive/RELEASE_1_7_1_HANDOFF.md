# `1.7.3` Handoff

> Archived release-specific handoff.

Use this as the minimum handoff for CLI/deployment and Web/ops teams before cutting or deploying `1.7.3`.

## Goal

Keep `1.7.3` focused on:

- Linux/on-prem Skills install correctness
- local-model readiness for LM Studio and Ollama
- partner integrations and partner-backed skills readiness, especially Resend
- the OpenClaw `2026.5.26` runtime baseline introduced in `1.7.0` and hardened through `1.7.2`

## CLI / Deployment Team

### Required runtime assumptions

- OpenClaw baseline must stay aligned with [SYSTEM/openclaw-version.sh](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/openclaw-version.sh)
- Gateway must be started and kept healthy as a durable runtime service
- containerized/on-prem runtimes must not rely on host loopback addresses for local model access

### Required env for all deployments

- `OPENCLAW_WORKSPACE`
- `DASHBOARD_PORT`
- `CORS_ORIGIN`
- `DASHBOARD_DEPLOYMENT_KIND`
- `DASHBOARD_INSTANCE_LABEL`

### Auth / provider env

- at least one system key:
  - `SYSTEM_OPENAI_API_KEY`
  - or `SYSTEM_ANTHROPIC_API_KEY`
- if default user execution should work without in-browser BYOK:
  - `USER_OPENAI_API_KEY`
  - and/or `USER_ANTHROPIC_API_KEY`
- keep `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=false` unless explicitly intended

### Local-model env for on-prem / Podman

For host-run LM Studio and Ollama, do not use `127.0.0.1` from inside the dashboard container.

Use:

```bash
DASHBOARD_DEPLOYMENT_KIND=onprem
DASHBOARD_ENABLE_OLLAMA=true
OLLAMA_BASE_URL=http://host.containers.internal:11434
OPENAI_COMPATIBLE_BASE_URL=http://host.containers.internal:1234/v1
```

Expected result:

- BYOK / Models can discover Ollama models
- BYOK / Models can discover LM Studio models
- agent chat and workflows can use those local runtimes after restart

### GitHub runtime env when cloud/on-prem uses runtime token path

- `GITHUB_TOKEN` or `GH_TOKEN`
- default repo configured in Workspaces Integrations when applicable

### Minimum deployment smoke

1. `openclaw --version`
2. `/api/system`
3. one hosted/BYOK agent chat
4. one Ollama-backed agent chat if enabled
5. one LM Studio/OpenAI-compatible agent chat if enabled
6. one template apply
7. one workflow run
8. Skills install/setup flow for a Linux-visible skill like `himalaya`
9. Resend partner visibility, key save, skill import, and one partner-backed skill sanity check

## Web / Ops Team

### Required public/runtime env review

- `DASHBOARD_PUBLIC_URL`
- `DASHBOARD_APP_URL`
- `DASHBOARD_INSTANCE_LABEL`
- `DASHBOARD_DEPLOYMENT_KIND`

### Auth mode review

Pick one explicitly and verify customer-facing copy/UI matches:

- `DASHBOARD_AUTH_MODE=github_oauth`
- `DASHBOARD_AUTH_MODE=email_otp`
- `DASHBOARD_AUTH_MODE=bypass` only for local/dev

If using OTP:

- `OTP_ALLOWED_EMAILS`
- `OTP_FROM_EMAIL`
- `RESEND_API_KEY` for production delivery
- avoid `OTP_DEV_MODE=log` outside local/debug

### Customer-visible checks

- version label matches the release under test
- BYOK / Partners modals render and save correctly
- local-model hints match the deployment kind
- maintenance/status links still point to the correct web destination

## Notes for `1.7.3`

- `1.7.0` introduced the upgraded OpenClaw runtime line
- `1.7.3` carries the next partner-integrations/skills/operator follow-through on that line
- `1.7.3` should stay tight and operational:
  - fix concrete follow-ups
  - keep image/runtime validation explicit
  - avoid broad unrelated surface changes unless they are needed for deployment correctness
