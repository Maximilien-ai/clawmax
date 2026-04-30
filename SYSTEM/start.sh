#!/bin/bash
# Start ClawMax Dashboard (backend + frontend)
#
# Usage:
#   ./SYSTEM/start.sh            - Start in background, logs to /tmp/dashboard.log
#   ./SYSTEM/start.sh --follow   - Start in foreground with live logs and restart stale dev servers on the target ports
#   ./SYSTEM/start.sh -f         - Same as --follow
#   ./SYSTEM/start.sh --restart  - Force-restart dashboard processes on the target ports before starting
#   ./SYSTEM/start.sh --ngrok    - Start with ngrok tunnel on drmaximilien.ngrok.dev
#   ./SYSTEM/start.sh -n         - Same as --ngrok

cd "$(dirname "$0")/dashboard"

BACKEND_PORT="${DASHBOARD_PORT:-3001}"
FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"
FRONTEND_ORIGIN="${DASHBOARD_APP_URL:-http://localhost:${FRONTEND_PORT}}"
API_ORIGIN="${DASHBOARD_PUBLIC_URL:-http://localhost:${BACKEND_PORT}}"
REPO_ROOT="$(pwd | sed 's|/SYSTEM/dashboard||')"
export DASHBOARD_PORT="$BACKEND_PORT"
export DASHBOARD_CLIENT_PORT="$FRONTEND_PORT"
export DASHBOARD_APP_URL="$FRONTEND_ORIGIN"
export DASHBOARD_PUBLIC_URL="$API_ORIGIN"
if [ -z "$CORS_ORIGIN" ]; then
  export CORS_ORIGIN="$FRONTEND_ORIGIN"
fi

# Set workspace to WORKSPACES/default if not already set
if [ -z "$OPENCLAW_WORKSPACE" ]; then
  export OPENCLAW_WORKSPACE="$REPO_ROOT/WORKSPACES/default"
fi

# Parse arguments
FOLLOW_LOGS=false
USE_NGROK=false
FORCE_RESTART=false
for arg in "$@"; do
  if [[ "$arg" == "--follow" ]] || [[ "$arg" == "-f" ]]; then
    FOLLOW_LOGS=true
    FORCE_RESTART=true
  elif [[ "$arg" == "--restart" ]]; then
    FORCE_RESTART=true
  elif [[ "$arg" == "--ngrok" ]] || [[ "$arg" == "-n" ]]; then
    USE_NGROK=true
  fi
done

# Auto-install deps if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "First run detected — installing dependencies..."
  npm install --no-audit --no-fund 2>&1 | tail -1
  echo ""
fi

echo "Starting ClawMax Dashboard..."
echo "Workspace: $OPENCLAW_WORKSPACE"
echo "Backend: $API_ORIGIN"
echo "Frontend: $FRONTEND_ORIGIN"
echo ""

restart_port_if_needed() {
  local port="$1"
  local label="$2"
  if lsof -ti:"$port" > /dev/null 2>&1; then
    echo "↻ Restart requested — stopping existing $label process on port $port"
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

ensure_local_gateway_ready() {
  if [ "$(uname -s)" != "Darwin" ] || ! command -v openclaw >/dev/null 2>&1; then
    return
  fi

  if [ -n "$CLAWMAX_SKIP_GATEWAY_BOOTSTRAP" ]; then
    return
  fi

  local gateway_status
  gateway_status="$(openclaw gateway status 2>/dev/null || true)"

  if echo "$gateway_status" | grep -qi "Service not installed"; then
    echo "↻ Installing local OpenClaw gateway LaunchAgent..."
    openclaw gateway install >/dev/null 2>&1 || true
  fi

  if ! echo "$gateway_status" | grep -qi "RPC probe: ok"; then
    echo "↻ Ensuring local OpenClaw gateway is running..."
    openclaw gateway restart >/dev/null 2>&1 || true
  fi
}

if [ -z "$CLAWMAX_SKIP_GATEWAY_BOOTSTRAP" ] && [ "$(uname -s)" = "Darwin" ] && command -v openclaw >/dev/null 2>&1; then
  WATCHDOG_SCRIPT="$REPO_ROOT/SYSTEM/scripts/gateway-watchdog.sh"
  WATCHDOG_PLIST="$HOME/Library/LaunchAgents/ai.clawmax.gateway-watchdog.plist"
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.openclaw/logs"
  chmod +x "$WATCHDOG_SCRIPT"
  cat > "$WATCHDOG_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.clawmax.gateway-watchdog</string>
    <key>ProgramArguments</key>
    <array>
      <string>$WATCHDOG_SCRIPT</string>
    </array>
    <key>StartInterval</key>
    <integer>30</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.openclaw/logs/gateway-watchdog.out.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.openclaw/logs/gateway-watchdog.err.log</string>
  </dict>
</plist>
EOF
  launchctl unload "$WATCHDOG_PLIST" >/dev/null 2>&1 || true
  launchctl load "$WATCHDOG_PLIST" >/dev/null 2>&1 || true
fi

ensure_local_gateway_ready

# Force-restart before checking port state so stale dev servers do not keep serving old bundles
if [ "$FORCE_RESTART" = true ]; then
  restart_port_if_needed "$BACKEND_PORT" "backend"
  restart_port_if_needed "$FRONTEND_PORT" "frontend"
fi

# Check if already running
BACKEND_RUNNING=false
FRONTEND_RUNNING=false

if lsof -ti:"$BACKEND_PORT" > /dev/null 2>&1; then
  BACKEND_RUNNING=true
  echo "⚠ Backend already running on port $BACKEND_PORT"
else
  echo "✓ Backend port $BACKEND_PORT is free"
fi

if lsof -ti:"$FRONTEND_PORT" > /dev/null 2>&1; then
  FRONTEND_RUNNING=true
  echo "⚠ Frontend already running on port $FRONTEND_PORT"
else
  echo "✓ Frontend port $FRONTEND_PORT is free"
fi

if [ "$BACKEND_RUNNING" = true ] && [ "$FRONTEND_RUNNING" = true ]; then
  echo ""
  echo "Dashboard already running at $FRONTEND_ORIGIN"
  exit 0
fi

echo ""
echo "Starting servers..."

# Load .env for ngrok config (we're already in SYSTEM/dashboard/)
if [ -f ".env" ]; then
  NGROK_URL=$(grep '^NGROK_URL=' .env 2>/dev/null | cut -d= -f2)
fi
NGROK_URL="${NGROK_URL:-}"

# Start ngrok if requested
if [ "$USE_NGROK" = true ]; then
  # Check if ngrok is installed
  if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok not found. Please install it: brew install ngrok"
    exit 1
  fi

  if [ -z "$NGROK_URL" ]; then
    echo "❌ NGROK_URL not set. Add NGROK_URL=yourdomain.ngrok.dev to SYSTEM/dashboard/.env"
    echo ""
    echo "  Setup steps:"
    echo "  1. Sign up at https://dashboard.ngrok.com/signup"
    echo "  2. Get your authtoken: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "  3. Run: ngrok config add-authtoken YOUR_TOKEN"
    echo "  4. Add to SYSTEM/dashboard/.env: NGROK_URL=yourdomain.ngrok.dev"
    exit 1
  fi

  # Check if ngrok is already running
  if lsof -ti:80 > /dev/null 2>&1; then
    echo "⚠ Port 80 is already in use (ngrok may already be running)"
  else
    # Check if ngrok authtoken is configured
    if ! ngrok config check 2>/dev/null | grep -q "valid" && ! [ -f "$HOME/.config/ngrok/ngrok.yml" ] && ! [ -f "$HOME/Library/Application Support/ngrok/ngrok.yml" ]; then
      echo "⚠ ngrok may not be authenticated. If tunnel fails, run:"
      echo "  ngrok config add-authtoken YOUR_TOKEN"
      echo "  Get your token: https://dashboard.ngrok.com/get-started/your-authtoken"
      echo ""
    fi

    echo "Starting ngrok tunnel on $NGROK_URL -> localhost:$FRONTEND_PORT..."
    ngrok http --url=$NGROK_URL "$FRONTEND_PORT" > /tmp/ngrok.log 2>&1 &
    NGROK_PID=$!
    sleep 2

    # Verify ngrok started successfully
    if ! kill -0 $NGROK_PID 2>/dev/null; then
      echo "❌ ngrok failed to start. Check /tmp/ngrok.log"
      if grep -q "ERR_NGROK_4018\|authtoken" /tmp/ngrok.log 2>/dev/null; then
        echo ""
        echo "  ngrok is not authenticated. Run:"
        echo "  1. ngrok config add-authtoken YOUR_TOKEN"
        echo "  2. Get token: https://dashboard.ngrok.com/get-started/your-authtoken"
      fi
      # Continue without ngrok — dashboard still works locally
      echo ""
      echo "  Continuing without ngrok tunnel..."
      USE_NGROK=false
    else
      echo "✓ ngrok started (PID: $NGROK_PID)"
    fi
  fi
fi

if [ "$FOLLOW_LOGS" = true ]; then
  # Run in foreground with live logs
  echo ""
  echo "Running with live logs (Ctrl+C to stop)..."
  echo "Dashboard will be available at $FRONTEND_ORIGIN"
  if [ "$USE_NGROK" = true ]; then
    echo "Public URL: https://$NGROK_URL"
  fi
  echo ""
  if [ "$BACKEND_RUNNING" = false ] && [ "$FRONTEND_RUNNING" = false ]; then
    exec npm run dev
  elif [ "$BACKEND_RUNNING" = false ]; then
    exec npm run dev:server
  else
    exec npm run dev:client
  fi
else
  # Run in background and log to file
  if [ "$BACKEND_RUNNING" = false ] && [ "$FRONTEND_RUNNING" = false ]; then
    nohup npm run dev > /tmp/dashboard.log 2>&1 < /dev/null &
  elif [ "$BACKEND_RUNNING" = false ]; then
    nohup npm run dev:server > /tmp/dashboard.log 2>&1 < /dev/null &
  else
    nohup npm run dev:client > /tmp/dashboard.log 2>&1 < /dev/null &
  fi
  DASHBOARD_PID=$!

  echo "Dashboard starting (PID: $DASHBOARD_PID)"
  echo "Waiting for servers to be ready..."

  # Wait for servers to start
  for i in {1..15}; do
    sleep 1
    if lsof -ti:"$BACKEND_PORT" > /dev/null 2>&1 && lsof -ti:"$FRONTEND_PORT" > /dev/null 2>&1; then
      echo ""
      echo "✓ Backend running on port $BACKEND_PORT"
      echo "✓ Frontend running on port $FRONTEND_PORT"
      echo ""
      echo "🚀 Dashboard is ready: $FRONTEND_ORIGIN"
      if [ "$USE_NGROK" = true ]; then
        echo "🌍 Public URL: https://$NGROK_URL"
        echo ""
        echo "ngrok logs: tail -f /tmp/ngrok.log"
      fi
      echo ""
      echo "Logs: tail -f /tmp/dashboard.log"
      echo "Stop: ./SYSTEM/stop.sh"

      # Load .env for config checks
      if [ -f ".env" ]; then
        . ./.env
      fi

      # Check authentication config
      if [ "$BYPASS_OAUTH" = "true" ] || [ "$DASHBOARD_AUTH_DISABLED" = "true" ]; then
        echo ""
        echo "⚠ OAuth bypassed (BYPASS_OAUTH=true) — no login required"
        echo "  All API endpoints are open. Do NOT use in production."
      else
        if [ -z "$GITHUB_CLIENT_ID" ] || [ "$GITHUB_CLIENT_ID" = "your-github-client-id" ]; then
          echo ""
          echo "⚠ GitHub OAuth not configured (GITHUB_CLIENT_ID missing)"
          echo "  Either:"
          echo "  1. Set BYPASS_OAUTH=true in .env for solo/local development"
          echo "  2. Configure GitHub OAuth — see .env.example for setup steps"
        fi
      fi

      # Check for AI model API keys
      ENV_API_KEYS_MISSING=false
      if [ -z "$SYSTEM_ANTHROPIC_API_KEY" ] && [ -z "$SYSTEM_OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
        ENV_API_KEYS_MISSING=true
      fi
      if [ "$ENV_API_KEYS_MISSING" = true ]; then
        echo ""
        echo "⚠ No AI model API keys detected"
        echo "  Agent interactions require at least one key configured."
        echo "  Add SYSTEM_OPENAI_API_KEY or SYSTEM_ANTHROPIC_API_KEY to SYSTEM/dashboard/.env"
      fi

      # Check Opik metering
      if [ -z "$OPIK_API_KEY" ] || [ "$OPIK_API_KEY" = "your-opik-key-here" ]; then
        echo ""
        echo "ℹ Opik metering not configured (optional)"
        echo "  Add OPIK_API_KEY to .env for token/cost tracking."
      fi

      # Show gateway pairing URL if gateway is running
      if command -v openclaw &> /dev/null; then
        GATEWAY_URL=$(openclaw dashboard --no-open 2>/dev/null | grep -o 'http://[^ ]*')
        if [ -n "$GATEWAY_URL" ]; then
          echo ""
          echo "🔗 Gateway Control UI (pair device for agent chat):"
          echo "  $GATEWAY_URL"
        fi
      fi
      exit 0
    fi
    echo -n "."
  done

  echo ""
  echo "⚠ Servers took too long to start. Check logs:"
  echo "  tail -f /tmp/dashboard.log"
  exit 1
fi
