#!/bin/bash
# Start ClawMax Dashboard (backend + frontend)
#
# Usage:
#   ./SYSTEM/start.sh            - Start in background, logs to /tmp/dashboard.log
#   ./SYSTEM/start.sh --follow   - Start in foreground with live logs
#   ./SYSTEM/start.sh -f         - Same as --follow
#   ./SYSTEM/start.sh --ngrok    - Start with ngrok tunnel on drmaximilien.ngrok.dev
#   ./SYSTEM/start.sh -n         - Same as --ngrok

cd "$(dirname "$0")/dashboard"

# Set workspace to WORKSPACES/default if not already set
if [ -z "$OPENCLAW_WORKSPACE" ]; then
  REPO_ROOT="$(pwd | sed 's|/SYSTEM/dashboard||')"
  export OPENCLAW_WORKSPACE="$REPO_ROOT/WORKSPACES/default"
fi

# Parse arguments
FOLLOW_LOGS=false
USE_NGROK=false
for arg in "$@"; do
  if [[ "$arg" == "--follow" ]] || [[ "$arg" == "-f" ]]; then
    FOLLOW_LOGS=true
  elif [[ "$arg" == "--ngrok" ]] || [[ "$arg" == "-n" ]]; then
    USE_NGROK=true
  fi
done

echo "Starting ClawMax Dashboard..."
echo "Workspace: $OPENCLAW_WORKSPACE"
echo ""

# Check if already running
BACKEND_RUNNING=false
FRONTEND_RUNNING=false

if lsof -ti:3001 > /dev/null 2>&1; then
  BACKEND_RUNNING=true
  echo "⚠ Backend already running on port 3001"
else
  echo "✓ Backend port 3001 is free"
fi

if lsof -ti:5173 > /dev/null 2>&1; then
  FRONTEND_RUNNING=true
  echo "⚠ Frontend already running on port 5173"
else
  echo "✓ Frontend port 5173 is free"
fi

if [ "$BACKEND_RUNNING" = true ] && [ "$FRONTEND_RUNNING" = true ]; then
  echo ""
  echo "Dashboard already running at http://localhost:5173"
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

    echo "Starting ngrok tunnel on $NGROK_URL -> localhost:5173..."
    ngrok http --url=$NGROK_URL 5173 > /tmp/ngrok.log 2>&1 &
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
  echo "Dashboard will be available at http://localhost:5173"
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
    npm run dev > /tmp/dashboard.log 2>&1 &
  elif [ "$BACKEND_RUNNING" = false ]; then
    npm run dev:server > /tmp/dashboard.log 2>&1 &
  else
    npm run dev:client > /tmp/dashboard.log 2>&1 &
  fi
  DASHBOARD_PID=$!

  echo "Dashboard starting (PID: $DASHBOARD_PID)"
  echo "Waiting for servers to be ready..."

  # Wait for servers to start
  for i in {1..15}; do
    sleep 1
    if lsof -ti:3001 > /dev/null 2>&1 && lsof -ti:5173 > /dev/null 2>&1; then
      echo ""
      echo "✓ Backend running on port 3001"
      echo "✓ Frontend running on port 5173"
      echo ""
      echo "🚀 Dashboard ready at http://localhost:5173"
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
