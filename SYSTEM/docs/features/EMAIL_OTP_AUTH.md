# Email OTP Auth

## Goal

Add a third dashboard auth mode between full OAuth and bypass:

- `github_oauth`
- `email_otp`
- `bypass`

This is primarily for:

- single-user cloud deployments
- single-user on-prem deployments
- local developer installs that want real auth without full OAuth setup

## Why

GitHub OAuth is a good owner/admin sign-in path, but it is overkill for a solo deployment.

Bypass mode is useful for development, but it is too weak for anything exposed beyond local-only testing.

Email OTP gives us:

- no long-term password storage
- no username/password reset complexity
- simpler deployment than OAuth
- enough security for single-user hosted/on-prem setups

## Recommended Model

### Auth modes

Add env-controlled auth mode selection:

- `DASHBOARD_AUTH_MODE=github_oauth`
- `DASHBOARD_AUTH_MODE=email_otp`
- `DASHBOARD_AUTH_MODE=bypass`

Optional later:

- `DASHBOARD_AUTH_MODE=hybrid`
  - allow both GitHub OAuth and Email OTP on the same install

### Who can log in

Restrict OTP to explicit allowlist emails.

Env:

- `OTP_ALLOWED_EMAILS=user@example.com`

Optional multi-user support later:

- comma-separated allowlist

For the first pass, single-user is enough.

### OTP shape

Use:

- 6 or 8 digit numeric code

Store:

- email
- code hash
- expiresAt
- consumedAt
- attemptCount
- createdAt

Never store the raw code after generation.

### Expiry

Do not use 24 hours.

Recommendation:

- default expiry: `15 minutes`

Reason:

- email OTP is for immediate possession verification, not day-long access
- 24 hours creates too much replay risk for forwarded/inbox-compromised mail

### Remember device

After successful OTP verification:

- issue the same signed session cookie model already used by GitHub OAuth
- if `Remember this device` is checked, keep the session for `30 days`
- otherwise keep the session for `24 hours` or browser session only

This avoids building a separate auth/session system.

## Backend Design

### New routes

Under `/api/auth`:

- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`

Optional:

- `POST /api/auth/otp/logout`
  - can reuse existing logout route

### Request flow

`POST /api/auth/otp/request`

Input:

- `email`

Behavior:

1. normalize email to lowercase
2. verify it is allowlisted
3. generate secure random OTP
4. hash OTP with server secret
5. persist OTP record with expiry
6. send email through Resend
7. return generic success response

Always return a generic response like:

- `If this email is allowed, a code has been sent`

This avoids leaking whether an email is configured.

### Verify flow

`POST /api/auth/otp/verify`

Input:

- `email`
- `code`
- `rememberDevice`

Behavior:

1. normalize email
2. load latest unconsumed OTP for email
3. reject expired OTP
4. compare hash in constant time
5. reject after too many attempts
6. mark OTP consumed
7. issue signed session cookie

### Session model

Reuse the current session-cookie approach from GitHub auth.

Add a generic session payload shape, for example:

- `authType`
- `subject`
- `email`
- `name`

GitHub sessions can keep their existing fields.

Email OTP sessions should not pretend to be GitHub users.

## Storage

### First pass

Store OTP records locally on the dashboard server in a file under:

- `SYSTEM/dashboard/data/auth/otp-store.json`

or similar server-only path.

This is acceptable for:

- single-user cloud
- on-prem
- local dev

### Later

Move to SQLite or a small server-side auth store if we need:

- multi-user
- auditability
- rotation/history

## Email sending

Use Resend from the dashboard backend.

Env:

- `RESEND_API_KEY`
- `OTP_FROM_EMAIL=max@clawmax.ai`

Optional:

- `OTP_EMAIL_SUBJECT=Your ClawMax login code`

Template should be minimal:

- code
- expiry
- note to ignore if unexpected

## Dev mode

Do not special-case dev into insecure auth.

Instead support:

- `OTP_DEV_MODE=log`

Behavior:

- still generate OTP normally
- instead of sending email, log the code to server console and optionally a local file

This gives local developers a real OTP flow without requiring live email delivery.

Also require:

- `OTP_ALLOWED_EMAILS=dev@example.com`

So dev still must use an explicit allowed email.

## Security Requirements

### Required

- short expiry, default `15m`
- secure random generation
- hash-at-rest
- constant-time compare
- attempt limit per code, e.g. `5`
- rate limit request endpoint per IP and per email
- rate limit verify endpoint per IP and per email
- generic response on request
- invalidate older unused codes when a new one is issued
- consume code immediately on successful verification
- secure cookies in production

### Nice to have

- audit log entries for request/verify success/failure
- optional trusted-device label in session metadata

## Current resend behavior

ClawMax now supports OTP resend directly from the login screen.

Behavior:

- show `Resend code` after the first OTP request
- show a visible countdown until resend is allowed again
- allow `Change email` without reloading the page

Server-side resend protection:

- sends `1-3`: `30s` cooldown
- sends `4-5`: `60s` cooldown
- sends `6-7`: `120s` cooldown
- sends `8+`: capped at `300s`

Hard limits:

- max `10` OTP sends per email per hour
- max `20` OTP sends per IP per hour

When cooldown or limits apply, the server returns retry metadata so the login page can show the user exactly when resend becomes available again.

## UX

Login screen should show auth mode(s) available:

- GitHub OAuth
- Email code

For OTP flow:

1. enter email
2. request code
3. enter code
4. optional `Remember this device`
5. sign in

For dev/log mode:

- keep the same UX
- code just appears in server logs

## Not Recommended

- 24-hour OTP validity
- storing raw OTP
- allowing arbitrary emails without allowlist
- writing `.env` from the browser
- replacing GitHub OAuth entirely

## Suggested First Pass Scope

1. add `email_otp` auth mode
2. allow one explicit email via env
3. add Resend-backed delivery
4. add local `OTP_DEV_MODE=log`
5. reuse cookie session model
6. update login page to show Email OTP when configured

## Follow-up

- hybrid auth mode
- Google / Apple / X OAuth providers
- admin UI for allowed emails
- SQLite-backed auth store
- trusted device management
