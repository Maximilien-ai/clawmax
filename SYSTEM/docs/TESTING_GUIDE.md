# ClawMax Testing Guide

> Last updated: March 17, 2026 (v1.1.0)

## Prerequisites

Before running tests, complete setup:

```bash
# 1. Install dependencies (continues even without OpenClaw)
./setup.sh

# 2. Add API keys to SYSTEM/dashboard/.env
#    ANTHROPIC_API_KEY=sk-ant-...
#    OPENAI_API_KEY=sk-...

# 3. Start the dashboard
./SYSTEM/start.sh

# 4. Run tests
./SYSTEM/test.sh
```

## Pre-flight Checks

`test.sh` validates before running:
- Node.js 18+
- Dashboard dependencies installed (`SYSTEM/dashboard/node_modules`)
- OpenClaw CLI available
- OpenClaw config (`~/.openclaw/openclaw.json`)
- Dashboard server running on `http://localhost:3001`

If any check fails, it exits with instructions.

## Test Suite

**90 tests** across 17 sections:

| Section | Tests | Description |
|---|---|---|
| 0 | 3 | TypeScript type check, Skills unit tests (17), Templates unit tests (15) |
| 1 | 6 | Health & System APIs |
| 2 | 10 | Agent APIs |
| 3-6 | skipped | Validation tests (use `--with-validation` to run) |
| 7 | 4 | Document APIs |
| 8 | 4 | Channel APIs |
| 9 | 7 | Group Chat APIs |
| 10 | 5 | Activity Feed |
| 11 | varies | WhatsApp Integration (conditional) |
| 12 | 2 | MANDATE.md Schema |
| 13 | 4 | DocHub Search |
| 14 | 16 | Skills & Tools APIs |
| 15 | varies | Gateway RPC Compatibility (conditional) |
| 16 | 11 | Workflows APIs |
| 17 | 8 | Custom Skills Import |

### Running

```bash
# Standard run (skips validation tests)
./SYSTEM/test.sh

# Include validation tests (modifies live data!)
./SYSTEM/test.sh --with-validation
```

### Unit Tests (standalone)

```bash
cd SYSTEM/dashboard
npx ts-node --transpileOnly server/lib/skills.test.ts     # 17 tests
npx ts-node --transpileOnly server/lib/templates.test.ts  # 15 tests
```

## CI/CD

GitHub Actions runs on every PR to `main` and every push to non-main branches.

Workflow: `.github/workflows/ci.yml`

Steps:
1. Setup Node.js 20 + Go (for OpenClaw CLI)
2. Install OpenClaw CLI from source
3. Run `./setup.sh`
4. Start dashboard with `DASHBOARD_AUTH_DISABLED=true`
5. Run `./SYSTEM/test.sh`

## Auth

The test suite uses an `apicurl` wrapper that automatically includes the dashboard auth token from `SYSTEM/dashboard/.dashboard-token`. For local dev, set `DASHBOARD_AUTH_DISABLED=true` in `.env`.

## Troubleshooting

### Tests hang
- Check dashboard is running: `./SYSTEM/status.sh`
- All curl calls have 5s connect / 10s max timeouts

### HTTP 401 errors
- Add `DASHBOARD_AUTH_DISABLED=true` to `SYSTEM/dashboard/.env`
- Restart dashboard

### Unit tests fail
- Ensure `npm install` was run in `SYSTEM/dashboard/`
- Check OpenClaw skills directory is accessible
