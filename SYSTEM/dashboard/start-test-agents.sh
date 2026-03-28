#!/bin/bash
# Start gateways for test agents (ceo, engineer, max0)

FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"

echo "🚀 Starting agent gateways for workflow testing..."
echo ""

# Start each agent gateway in background
echo "Starting ceo gateway (port 18890)..."
cd ~/.openclaw/workspace/AGENTS/ceo && openclaw gateway run &
CEO_PID=$!

echo "Starting engineer gateway (port 18891)..."
cd ~/.openclaw/workspace/AGENTS/engineer && openclaw gateway run &
ENGINEER_PID=$!

echo "Starting max0 gateway (port 18892)..."
cd ~/.openclaw/workspace/AGENTS/max0 && openclaw gateway run &
MAX0_PID=$!

# Wait a bit for gateways to start
sleep 3

echo ""
echo "✅ Agent gateways started!"
echo ""
echo "Gateway PIDs:"
echo "  ceo:      $CEO_PID (port 18890)"
echo "  engineer: $ENGINEER_PID (port 18891)"
echo "  max0:     $MAX0_PID (port 18892)"
echo ""
echo "Verify gateways are listening:"
echo "  lsof -ti:18890,18891,18892"
echo ""
echo "Dashboard: http://localhost:$FRONTEND_PORT"
echo ""
echo "To stop all gateways:"
echo "  kill $CEO_PID $ENGINEER_PID $MAX0_PID"
echo ""
echo "Press Ctrl+C to stop all gateways and exit"
echo ""

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Stopping all agent gateways..."
  kill $CEO_PID $ENGINEER_PID $MAX0_PID 2>/dev/null
  echo "✅ All gateways stopped"
  exit 0
}

# Trap Ctrl+C
trap cleanup INT

# Wait indefinitely
wait
