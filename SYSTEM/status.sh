#!/bin/bash
# Check ClawMax Dashboard status

BACKEND_PORT="${DASHBOARD_PORT:-3001}"
FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"
API_BASE="http://localhost:${BACKEND_PORT}"
FRONTEND_URL="${DASHBOARD_APP_URL:-http://localhost:${FRONTEND_PORT}}"

echo "ClawMax Dashboard Status"
echo "========================"
echo ""

# Check backend
if lsof -ti:"$BACKEND_PORT" > /dev/null 2>&1; then
  backend_pid=$(lsof -ti:"$BACKEND_PORT")
  echo "✓ Backend: RUNNING (PID: $backend_pid, Port: $BACKEND_PORT)"

  # Check API health
  if curl -s "$API_BASE/api/health" | jq -e '.ok' > /dev/null 2>&1; then
    workspace=$(curl -s "$API_BASE/api/health" | jq -r '.workspace')
    echo "  └─ API responding"
    echo "  └─ Workspace: $workspace"
  else
    echo "  └─ ⚠ API not responding"
  fi
else
  echo "✗ Backend: NOT RUNNING (Port: $BACKEND_PORT)"
fi

echo ""

# Check frontend
if lsof -ti:"$FRONTEND_PORT" > /dev/null 2>&1; then
  frontend_pid=$(lsof -ti:"$FRONTEND_PORT")
  echo "✓ Frontend: RUNNING (PID: $frontend_pid, Port: $FRONTEND_PORT)"
  echo "  └─ URL: $FRONTEND_URL"
else
  echo "✗ Frontend: NOT RUNNING (Port: $FRONTEND_PORT)"
fi

echo ""

# Overall status
if lsof -ti:"$BACKEND_PORT" > /dev/null 2>&1 && lsof -ti:"$FRONTEND_PORT" > /dev/null 2>&1; then
  echo "Status: 🟢 ONLINE"
  echo ""
  echo "Access dashboard at: $FRONTEND_URL"
  echo ""
  echo "Commands:"
  echo "  Stop:  ./SYSTEM/stop.sh"
  echo "  Logs:  tail -f /tmp/dashboard.log"
  echo "  Tests: ./SYSTEM/test.sh"
elif lsof -ti:"$BACKEND_PORT" > /dev/null 2>&1 || lsof -ti:"$FRONTEND_PORT" > /dev/null 2>&1; then
  echo "Status: 🟡 PARTIAL"
  echo ""
  echo "Some servers are not running. Try:"
  echo "  ./SYSTEM/stop.sh && ./SYSTEM/start.sh"
else
  echo "Status: 🔴 OFFLINE"
  echo ""
  echo "Start dashboard with:"
  echo "  ./SYSTEM/start.sh"
fi
