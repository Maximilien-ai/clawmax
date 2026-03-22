# Release Checklist

Use this as the final pass before the next dashboard release.

## 1. Environment and Startup

- Copy values from [SYSTEM/dashboard/.env.example](../dashboard/.env.example) into `SYSTEM/dashboard/.env`
- Confirm `CORS_ORIGIN=http://localhost:5173` for local dev
- Confirm `DASHBOARD_APP_URL=http://localhost:5173` if you want explicit post-login/logout redirects
- Confirm `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are present
- Confirm at least one system model key is set:
  - `OPENAI_API_KEY`
  - or `ANTHROPIC_API_KEY`
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

## 5. Release Messaging

- README reflects:
  - GitHub OAuth setup
  - system keys vs user/BYOK keys
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
