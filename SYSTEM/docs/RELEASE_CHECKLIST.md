# Release Checklist

Use this as the final pass before the next dashboard release.

## 1. Environment and Startup

- Copy values from [SYSTEM/dashboard/.env.example](../dashboard/.env.example) into `SYSTEM/dashboard/.env`
- Confirm `CORS_ORIGIN=http://localhost:5173` for local dev
- If another local dashboard is already using the defaults, use:
  `DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174`
- Confirm `DASHBOARD_APP_URL=http://localhost:5173` if you want explicit post-login/logout redirects
- Confirm the intended auth mode is configured:
  - `DASHBOARD_AUTH_MODE=github_oauth`
  - or `DASHBOARD_AUTH_MODE=email_otp`
  - or `DASHBOARD_AUTH_MODE=hybrid`
- If using GitHub OAuth, confirm `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are present
- If using Email OTP, confirm:
  - `OTP_ALLOWED_EMAILS`
  - `RESEND_API_KEY` for production delivery
  - `OTP_FROM_EMAIL`
  - or `OTP_DEV_MODE=log` for local developer testing
- Confirm at least one system model key is set:
  - `SYSTEM_OPENAI_API_KEY`
  - or `SYSTEM_ANTHROPIC_API_KEY`
- Confirm provider-key policy is intentional:
  - `USER_*` keys are set if you want default user execution without BYOK entry
  - `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=false` unless you explicitly want user agents/workflows to fall back to system keys
- Confirm provider keys are defined in `SYSTEM/dashboard/.env`, not only in shell exports like `~/.zshrc`
- Confirm the intended OpenClaw runtime version:
  - `openclaw --version`
  - compare against the current pinned target in `SYSTEM/openclaw-version.sh`
- Run from `SYSTEM/dashboard`:

```bash
npm run dev
```

## 2. Build and Static Checks

Run from `SYSTEM/dashboard`:

```bash
npm run typecheck
npm run build
```

Expected:
- typecheck passes
- build writes `dist/client`
- no `tsconfig.server.json` error

## 3. OAuth / Auth Flow

- Open `http://localhost:5173`
- Verify login page loads with the expected auth mode(s)
- If using GitHub OAuth:
  - login via GitHub
  - verify redirect returns to `http://localhost:5173/`
- If using Email OTP:
  - request a code with an allowlisted email
  - in local dev, confirm the UI points to `.clawmax-otp-dev.json`
  - verify the code works once and is rejected after reuse/expiry
- Verify user avatar/name and `Logout` are visible in the dashboard
- Verify both logout affordances work:
  - top-right
  - lower-left / sidebar
- Repeat login/logout twice to catch session/bootstrap regressions

If you hit:

```json
{"error":"Too many auth attempts"}
```

wait about one minute for the auth rate limiter window to reset.

## 4. Core Manual Smoke

Use [MANUAL_RELEASE_SMOKE_CHECKLIST.md](MANUAL_RELEASE_SMOKE_CHECKLIST.md) as the reusable detailed surface-by-surface smoke list. The items below are the minimum release-pass reminder set.

- Onboarding / Builder
  - create or switch to an empty workspace
  - verify the first-run tour can be shown, skipped, and reopened from onboarding
  - confirm "Don't show again" suppresses the tour across additional new workspaces
  - submit Builder prompts for a single agent, team template, existing-agent workflow, and skill follow-through
  - verify Builder handoffs open the intended Agent, Skill, Workflow, or Template flow with useful prefilled context
  - verify Builder session save/download/share controls still work
- Agents
  - open agent detail panel
  - confirm model is visible
  - edit config and save
- Templates
  - confirm system templates cannot be deleted
  - confirm workspace templates can be selected and bulk deleted
  - confirm apply flow works
- Communication
  - open group/community chat
  - verify unread counts and select/list mode still work
- Workspaces
  - reorder workspaces
  - confirm active workspace stays selected
- Workspaces Integrations
  - verify the `Workspaces Integrations` entry is visible after login
  - verify Models / Senso / Opik / GitHub sections render
  - verify masked provider keys can be saved locally for dev flow testing
  - verify validation shows live/fallback status clearly
  - verify direct agent chat and manual workflow execution use the configured provider/defaults
- Activity / Budget / Logs
  - verify built-in/system agents appear separately after AI Builder or AI Generate calls when metering is enabled
  - verify System Logs refresh and export work
  - verify neutral Doctor details, such as agents without skills, do not dominate the default warning list

## 5. Release Messaging

- README reflects:
  - latest release and previous major/minor reference only
  - pinned installer examples for the current tag
  - current OpenClaw baseline and upgrade significance when applicable
  - GitHub OAuth and Email OTP setup
  - system keys vs user/BYOK keys
  - provider-key precedence and shell-env isolation
  - build command
- OpenClaw runbook reflects:
  - current pinned target
  - CI / Docker / local alignment points
  - recurring upgrade cadence and validation steps
- Auth doc reflects:
  - GitHub callback on `3001`
  - app redirect on `5173`
  - OTP dev file flow
  - rate-limit troubleshooting
- Backlog reflects:
  - completed release work has moved to changelog/archive
  - remaining Builder quality work is framed as post-release eval/export/share polish
  - test automation priority

## 6. Deferred to Post-Release

- broader Builder eval corpus expansion
- Builder export/share UX polish
- system/built-in model selection polish
- workflow table view
- rotating login-page marketing copy from the website
