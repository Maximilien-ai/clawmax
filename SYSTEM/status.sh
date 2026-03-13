#!/bin/bash
# Check ClawMax Dashboard status

echo "ClawMax Dashboard Status"
echo "========================"
echo ""

# Check backend
if lsof -ti:3001 > /dev/null 2>&1; then
  backend_pid=$(lsof -ti:3001)
  echo "✓ Backend: RUNNING (PID: $backend_pid, Port: 3001)"

  # Check API health
  if curl -s http://localhost:3001/api/health | jq -e '.ok' > /dev/null 2>&1; then
    workspace=$(curl -s http://localhost:3001/api/health | jq -r '.workspace')
    echo "  └─ API responding"
    echo "  └─ Workspace: $workspace"
  else
    echo "  └─ ⚠ API not responding"
  fi
else
  echo "✗ Backend: NOT RUNNING (Port: 3001)"
fi

echo ""

# Check frontend
if lsof -ti:5173 > /dev/null 2>&1; then
  frontend_pid=$(lsof -ti:5173)
  echo "✓ Frontend: RUNNING (PID: $frontend_pid, Port: 5173)"
  echo "  └─ URL: http://localhost:5173"
else
  echo "✗ Frontend: NOT RUNNING (Port: 5173)"
fi

echo ""

# Overall status
if lsof -ti:3001 > /dev/null 2>&1 && lsof -ti:5173 > /dev/null 2>&1; then
  echo "Status: 🟢 ONLINE"
  echo ""
  echo "Access dashboard at: http://localhost:5173"
  echo ""
  echo "Commands:"
  echo "  Stop:  ./SYSTEM/stop.sh"
  echo "  Logs:  tail -f /tmp/dashboard.log"
  echo "  Tests: ./SYSTEM/test.sh"
elif lsof -ti:3001 > /dev/null 2>&1 || lsof -ti:5173 > /dev/null 2>&1; then
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
