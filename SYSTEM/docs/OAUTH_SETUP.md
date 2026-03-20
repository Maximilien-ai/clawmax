# OAuth Authentication Setup

ClawMax Dashboard supports OAuth authentication to protect all API routes and the dashboard UI. Multiple providers can be configured.

## How It Works

- When OAuth is configured and `DASHBOARD_AUTH_DISABLED=false`, users see a login page
- After login, a JWT session cookie is set (7-day expiry, httpOnly)
- All API routes require a valid session or legacy dashboard token
- Optional: restrict access to specific users via allowlist

## GitHub

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:

| Field | Value |
|-------|-------|
| Application name | `ClawMax Dashboard` |
| Homepage URL | `http://localhost:5173` |
| Authorization callback URL | `http://localhost:3001/api/auth/github/callback` |

4. Click **Register application**
5. Copy the **Client ID**
6. Click **Generate a new client secret** and copy it

### 2. Configure Environment

Add to `SYSTEM/dashboard/.env`:

```bash
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
DASHBOARD_AUTH_DISABLED=false

# Optional: restrict to specific GitHub users (comma-separated, lowercase)
# GITHUB_ALLOWED_USERS=yourgithublogin,teammate1,teammate2
```

### 3. Restart Dashboard

```bash
# If using npm run dev
# Ctrl+C to stop, then:
npm run dev
```

You should see the login page with **Sign in with GitHub**.

### Production / Ngrok

If using ngrok or a custom domain, update the callback URL:

- GitHub OAuth App callback: `https://yourdomain.com/api/auth/github/callback`
- Set `CORS_ORIGIN=https://yourdomain.com` in `.env`

## Google (Planned)

Google OAuth support is planned for a future release.

### Expected Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google+ API** or **People API**
3. Create OAuth 2.0 credentials (Web application)
4. Set authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`

## Apple (Planned)

Apple Sign In support is planned for a future release.

## Troubleshooting

### "GitHub OAuth is not configured"
The login page shows this when `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` is missing from `.env`. Add both and restart.

### "Access denied for GitHub user"
The user's GitHub login is not in the `GITHUB_ALLOWED_USERS` list. Either add them or remove the restriction (comment out `GITHUB_ALLOWED_USERS`).

### Dashboard works without login
`DASHBOARD_AUTH_DISABLED=true` is set in `.env`. Change to `false` to require authentication.

### Callback URL mismatch
The callback URL in your GitHub OAuth App must exactly match what the server sends. For local dev: `http://localhost:3001/api/auth/github/callback`.

## Architecture

```
Browser                    Server                     GitHub
  |                          |                          |
  |-- GET /api/auth/github ->|                          |
  |<- 302 redirect ---------|                          |
  |-- GET github.com/login/oauth/authorize ----------->|
  |<- 302 with ?code= --------------------------------|
  |-- GET /api/auth/github/callback?code= ->|          |
  |                          |-- POST /login/oauth/access_token ->|
  |                          |<- access_token ---------|
  |                          |-- GET /user ------------>|
  |                          |<- user profile ---------|
  |                          |                          |
  |<- Set-Cookie: session ---|                          |
  |<- 302 redirect to / ----|                          |
```

- Sessions: JWT in httpOnly cookie (`clawmax_session`)
- Expiry: 7 days
- Secret: derived from `.dashboard-token` or `JWT_SECRET` env var
- Fallback: legacy `Authorization: Bearer <dashboard-token>` still works for API clients
