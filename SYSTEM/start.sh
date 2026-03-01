#!/bin/bash
# Start ClawMax Dashboard (backend + frontend)

cd "$(dirname "$0")/dashboard"

echo "Starting ClawMax Dashboard..."
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

# Start both servers using concurrently
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
    exit 0
  fi
  echo -n "."
done

echo ""
echo "⚠ Servers took too long to start. Check logs:"
echo "  tail -f /tmp/dashboard.log"
exit 1
