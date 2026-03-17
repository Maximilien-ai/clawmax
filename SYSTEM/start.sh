#!/bin/bash
# Start ClawMax Dashboard (backend + frontend)
#
# Usage:
#   ./SYSTEM/start.sh           - Start in background, logs to /tmp/dashboard.log
#   ./SYSTEM/start.sh --follow  - Start in foreground with live logs
#   ./SYSTEM/start.sh -f        - Same as --follow

cd "$(dirname "$0")/dashboard"

# Set workspace to WORKSPACES/default if not already set
if [ -z "$OPENCLAW_WORKSPACE" ]; then
  REPO_ROOT="$(pwd | sed 's|/SYSTEM/dashboard||')"
  export OPENCLAW_WORKSPACE="$REPO_ROOT/WORKSPACES/default"
fi

# Parse arguments
FOLLOW_LOGS=false
if [[ "$1" == "--follow" ]] || [[ "$1" == "-f" ]]; then
  FOLLOW_LOGS=true
fi

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

if [ "$FOLLOW_LOGS" = true ]; then
  # Run in foreground with live logs
  echo ""
  echo "Running with live logs (Ctrl+C to stop)..."
  echo "Dashboard will be available at http://localhost:5173"
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
      echo ""
      echo "Logs: tail -f /tmp/dashboard.log"
      echo "Stop: ./SYSTEM/stop.sh"

      # Check for AI model API keys
      if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
        echo ""
        echo "⚠ No AI model API keys detected (ANTHROPIC_API_KEY, OPENAI_API_KEY)"
        echo "  Agent creation requires at least one API key configured."
        echo "  Add keys to SYSTEM/dashboard/.env or export in your shell."
        echo "  See README.md for details."
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
