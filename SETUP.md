# ClawMax Setup Guide

## Gateway Pairing

1. Start the Dashboard:  
   ```bash
   ./SYSTEM/start.sh --follow
   ```
2. The dashboard will print a **Gateway Control UI** link once the backend is running. Open that link in your browser.
3. Click **Pair Device** to generate a pairing QR code. Scan the code with your agent or log in from another browser.

---

## ngrok Setup (for Public Access)

1. Install ngrok:
   ```bash
   brew install ngrok
   # or see https://ngrok.com/download
   ```
2. Get your ngrok Authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
3. Authenticate ngrok locally:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```
4. In `SYSTEM/dashboard/.env`, add:
   ```env
   NGROK_URL=yourdomain.ngrok.dev
   ```
5. Start with ngrok enabled:
   ```bash
   ./SYSTEM/start.sh --ngrok
   ```
6. The dashboard will display the public ngrok URL when ready.

For more details, see the README.md.

---

## Agent Runtimes (optional)

OpenClaw is the default agent runtime and needs no extra setup. To let agents run via Claude Code or Factory Droid instead:

1. Install the CLI you want:
   ```bash
   npm install -g @anthropic-ai/claude-code          # Claude Code
   curl -fsSL https://app.factory.ai/cli | sh         # Factory Droid
   ```
2. Set its auth key in `SYSTEM/dashboard/.env`: `ANTHROPIC_API_KEY` for Claude Code, `FACTORY_API_KEY` for Factory Droid.
3. Pick a workspace default in **Integrations → Runtime**, or pin an individual agent to a runtime in the agent editor.

`./setup.sh` and `./SYSTEM/doctor.sh` report whether each CLI is detected, but never install them automatically. See the "Agent Runtimes" section in [README.md](README.md) for the full picture, including headless auth and which features (Gateway, `openclaw logs`, `openclaw cron`) stay OpenClaw-only.

**Docker image pinning note:** the `curl -fsSL https://app.factory.ai/cli | sh` one-liner above (for local/manual installs) always fetches whatever Factory currently publishes — it is not version-pinned. The Docker image does **not** use that installer. Its published installer script hardcodes an internal version literal with no env-var override, so the Dockerfile instead downloads the same versioned, checksummed artifact the installer itself would fetch (`https://downloads.factory.ai/factory-cli/releases/<version>/linux/<arch>/droid` + `.sha256`), verifies the checksum, and asserts `droid --version` reports the pinned `FACTORY_DROID_VERSION` build arg — failing the build otherwise. See the comment above the Factory Droid `RUN` step in `Dockerfile` for the full mechanism.
