# Release Checklist

Use this as the final pass before the next dashboard release.

## 1. Environment and Startup

- Copy values from [SYSTEM/dashboard/.env.example](../dashboard/.env.example) into `SYSTEM/dashboard/.env`
- Confirm `CORS_ORIGIN=http://localhost:5173` for local dev
- If another local dashboard is already using the defaults, use:
  `DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174`
- Confirm `DASHBOARD_APP_URL=http://localhost:5173` if you want explicit post-login/logout redirects
- Confirm `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are present
- Confirm at least one system model key is set:
  - `SYSTEM_OPENAI_API_KEY`
  - or `SYSTEM_ANTHROPIC_API_KEY`
- Confirm provider-key policy is intentional:
  - `USER_*` keys are set if you want default user execution without BYOK entry
  - `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=false` unless you explicitly want user agents/workflows to fall back to system keys
- Confirm provider keys are defined in `SYSTEM/dashboard/.env`, not only in shell exports like `~/.zshrc`
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
- Verify login page loads with hero image and GitHub button
- Login via GitHub
- Verify redirect returns to `http://localhost:5173/`
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

## 5. Release Messaging

- README reflects:
  - GitHub OAuth setup
  - system keys vs user/BYOK keys
  - provider-key precedence and shell-env isolation
  - build command
- OAuth doc reflects:
  - callback on `3001`
  - app redirect on `5173`
  - rate-limit troubleshooting
- Backlog reflects:
  - post-release workflow table view
  - test automation priority

## 6. Deferred to Post-Release

- Workflow table view
- BYOK wizard / user key capture flow
- rotating login-page marketing copy from the website
