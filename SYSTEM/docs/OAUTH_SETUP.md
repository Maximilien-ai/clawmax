# OAuth Authentication Setup

ClawMax Dashboard currently supports GitHub OAuth for the dashboard UI and API. Google and Apple are not implemented.

## Current Auth Behavior

- When `DASHBOARD_AUTH_DISABLED=false`, the UI checks `/api/auth/config` and shows the login page if GitHub OAuth is configured.
- Successful login creates a 7-day JWT session in the `clawmax_session` httpOnly cookie.
- Protected API routes accept either:
  - a valid GitHub session cookie or session bearer token
  - the legacy dashboard bearer token from `.dashboard-token`
- Access can optionally be restricted with `GITHUB_ALLOWED_USERS`.

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
CORS_ORIGIN=http://localhost:5173
```

Notes:

- Put these values in `SYSTEM/dashboard/.env`.
- The server reads `DASHBOARD_PORT`, not `PORT`.
- The GitHub callback must point to the server origin (`3001` by default), not the Vite dev server.

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
4. After GitHub redirects back, you should land on `/` and the dashboard should load.
5. `GET /api/auth/me` should return `authenticated: true`.

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
```

If GitHub redirects to the wrong host, check forwarded headers and the externally visible server origin. The callback URL is built from the incoming request host/protocol.

## Troubleshooting

### "GitHub OAuth is not configured"

`GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` is missing from `SYSTEM/dashboard/.env`, or the server was not restarted after adding them.

### "Access denied for GitHub user"

The authenticated GitHub login is not present in `GITHUB_ALLOWED_USERS`. Add the login in lowercase or remove the allowlist.

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
  |<- 302 to / -------------------|                      |
```

- Session cookie: `clawmax_session`
- State cookie: `oauth_state`
- Session expiry: 7 days
- JWT secret: `JWT_SECRET` if set, otherwise derived from `.dashboard-token`
- Backward compatibility: `Authorization: Bearer <dashboard-token>` still works for API clients
