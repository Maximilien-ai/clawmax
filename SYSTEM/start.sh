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
if lsof -ti:3001 > /dev/null 2>&1; then
  echo "⚠ Backend already running on port 3001"
else
  echo "✓ Backend port 3001 is free"
fi

if lsof -ti:5173 > /dev/null 2>&1; then
  echo "⚠ Frontend already running on port 5173"
  echo ""
  echo "Dashboard already running at http://localhost:5173"
  exit 0
else
  echo "✓ Frontend port 5173 is free"
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
  exec npm run dev
else
  # Run in background and log to file
  npm run dev > /tmp/dashboard.log 2>&1 &
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

      # Check for AI model API keys in both env and .env file
      ENV_API_KEYS_MISSING=false
      if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
        # If the environment doesn't have the keys, check .env
        if [ -f ".env" ]; then
          . ./.env
        fi
        if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
          ENV_API_KEYS_MISSING=true
        fi
      fi
      if [ "$ENV_API_KEYS_MISSING" = true ]; then
        echo ""
        echo "⚠ No AI model API keys detected (ANTHROPIC_API_KEY, OPENAI_API_KEY)"
        echo "  Agent creation requires at least one API key configured."
        echo "  Add keys to SYSTEM/dashboard/.env or export in your shell."
        echo "  See README.md for details."
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
