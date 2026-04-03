# OAuth Authentication Setup

ClawMax Dashboard supports:

- GitHub OAuth
- Email OTP login
- bypass mode for local-only development

Google and Apple are not implemented yet.

## Current Auth Behavior

- The UI checks `/api/auth/config` and shows the login screen when auth is required.
- Successful login creates a 7-day JWT session in the `clawmax_session` httpOnly cookie.
- Protected API routes accept either:
  - a valid session cookie or session bearer token
  - the legacy dashboard bearer token from `.dashboard-token`
- GitHub access can optionally be restricted with `GITHUB_ALLOWED_USERS`.
- Email OTP access is restricted with `OTP_ALLOWED_EMAILS`.

## Auth Modes

```bash
# GitHub OAuth only
DASHBOARD_AUTH_MODE=github_oauth

# Email OTP only
DASHBOARD_AUTH_MODE=email_otp

# No auth, local only
DASHBOARD_AUTH_MODE=bypass
```

## GitHub Setup

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers).
2. Click **New OAuth App**.
3. Use these local development values:

| Field | Value |
|-------|-------|
| Application name | `ClawMax Dashboard` |
| Homepage URL | `http://localhost:5173` |
| Authorization callback URL | `http://localhost:3001/api/auth/github/callback` |

4. Click **Register application**.
5. Copy the **Client ID**.
6. Generate and copy the **Client Secret**.

### 2. Configure `SYSTEM/dashboard/.env`

Minimum required values:

```bash
NODE_ENV=development
DASHBOARD_AUTH_DISABLED=false

GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here

# Optional: restrict to specific GitHub logins (comma-separated, lowercase)
# GITHUB_ALLOWED_USERS=yourgithublogin,teammate1
```

Recommended local values:

```bash
# Dashboard API server port. Defaults to 3001.
DASHBOARD_PORT=3001

# Frontend origin allowed by CORS. Defaults to Vite on 5173.
# Multiple origins can be comma-separated if needed.
CORS_ORIGIN=http://localhost:5173

# Recommended: explicit app redirect target after login/logout.
# In local dev this should be the Vite app origin, not the API server.
# DASHBOARD_APP_URL=http://localhost:5173

# Optional but recommended when running behind a proxy/tunnel.
# Forces OAuth callback/session origin instead of relying on forwarded headers.
# DASHBOARD_PUBLIC_URL=http://localhost:3001
```

Notes:

- Put these values in `SYSTEM/dashboard/.env`.
- The server reads `DASHBOARD_PORT`, not `PORT`.
- The GitHub callback must point to the server origin (`3001` by default), not the Vite dev server.
- The post-login and post-logout destination should be the app origin (`5173` in local dev), not `3001`.

### 3. Start the Dashboard

From `SYSTEM/dashboard`:

```bash
npm run dev
```

This starts:

- Vite client at `http://localhost:5173`
- Express API server at `http://localhost:3001`

### 4. Verify the Flow

1. Open `http://localhost:5173`.
2. You should see the login page instead of the dashboard.
3. Click **Sign in with GitHub**.
4. After GitHub redirects back, you should land on `http://localhost:5173/` and the dashboard should load.
5. `GET /api/auth/me` should return `authenticated: true`.
6. The authenticated user avatar/name and `Logout` should be visible in the dashboard chrome.

Quick checks if something looks wrong:

- `GET http://localhost:3001/api/auth/config` should show `githubEnabled: true` and `authDisabled: false`.
- If `githubEnabled` is `false`, `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` is missing or not being loaded from `SYSTEM/dashboard/.env`.

## Production / Tunnel Setup

If you run the dashboard behind ngrok or a real domain:

- Set the GitHub OAuth callback to `https://your-server-origin/api/auth/github/callback`.
- Set `CORS_ORIGIN` to the frontend origin that loads the dashboard UI.
- If Express is not on port `3001`, also set `DASHBOARD_PORT` accordingly.

Example:

```bash
DASHBOARD_PORT=3001
CORS_ORIGIN=https://dashboard.example.com
DASHBOARD_PUBLIC_URL=https://dashboard.example.com
# DASHBOARD_TRUST_PROXY=true
```

If GitHub redirects to the wrong host, set `DASHBOARD_PUBLIC_URL` explicitly. Only enable `DASHBOARD_TRUST_PROXY=true` when you are behind a trusted reverse proxy that sets forwarded headers correctly.

## Troubleshooting

### "GitHub OAuth is not configured"

`GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` is missing from `SYSTEM/dashboard/.env`, or the server was not restarted after adding them.

### "Access denied for GitHub user"

The authenticated GitHub login is not present in `GITHUB_ALLOWED_USERS`. Add the login in lowercase or remove the allowlist.

### `{"error":"Too many auth attempts"}`

The auth rate limiter is active on `/api/auth/*`. Wait about one minute and try again, or restart your test flow more slowly while iterating on login/logout behavior.

### Dashboard still works without login

`DASHBOARD_AUTH_DISABLED=true` is set. Change it to `false` and restart the server.

### Callback URL mismatch

The callback URL in GitHub must exactly match the server callback. Local default:

```text
http://localhost:3001/api/auth/github/callback
```

### API works with bearer token but browser login fails

That usually means the legacy token path still works, but GitHub OAuth is misconfigured. Check:

- `/api/auth/config`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- callback URL in GitHub
- browser redirect target
- `CORS_ORIGIN`
- `DASHBOARD_APP_URL`

## Flow Summary

```text
Browser                    Dashboard Server            GitHub
  |                               |                      |
  |-- GET /api/auth/github ------>|                      |
  |<- 302 to GitHub -------------|                      |
  |-- authorize ------------------------------->        |
  |<- 302 with code/state ----------------------        |
  |-- GET /api/auth/github/callback ----------->|       |
  |                               |-- token exchange -->|
  |                               |<- access token -----|
  |                               |-- GET /user ------->|
  |                               |<- user profile -----|
  |<- Set-Cookie: clawmax_session |                      |
  |<- 302 to app origin ----------|                      |
```

- Session cookie: `clawmax_session`
- State cookie: `oauth_state`
- Session expiry: 7 days
- JWT secret: `JWT_SECRET` if set, otherwise derived from `.dashboard-token`
- Backward compatibility: `Authorization: Bearer <dashboard-token>` still works for API clients
