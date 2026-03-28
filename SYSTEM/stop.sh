#!/bin/bash
# Stop ClawMax Dashboard servers

BACKEND_PORT="${DASHBOARD_PORT:-3001}"
FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"

echo "Stopping ClawMax Dashboard..."
echo "Backend port: $BACKEND_PORT"
echo "Frontend port: $FRONTEND_PORT"
echo ""

stopped=0

# Force kill any remaining processes on the ports
if lsof -ti:"$BACKEND_PORT" > /dev/null 2>&1; then
  lsof -ti:"$BACKEND_PORT" | xargs kill -9 2>/dev/null
  echo "✓ Freed port $BACKEND_PORT"
  ((stopped++))
fi

if lsof -ti:"$FRONTEND_PORT" > /dev/null 2>&1; then
  lsof -ti:"$FRONTEND_PORT" | xargs kill -9 2>/dev/null
  echo "✓ Freed port $FRONTEND_PORT"
  ((stopped++))
fi

# Kill ngrok if running
if pkill -f "ngrok http" 2>/dev/null; then
  echo "✓ Stopped ngrok tunnel"
  ((stopped++))
fi

sleep 1

if [ $stopped -eq 0 ]; then
  echo "ℹ No dashboard processes were running"
else
  echo ""
  echo "✓ Dashboard stopped"
fi

# Clean up log files
rm -f /tmp/dashboard.log 2>/dev/null
rm -f /tmp/ngrok.log 2>/dev/null
