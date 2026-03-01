#!/bin/bash
# Stop ClawMax Dashboard servers

echo "Stopping ClawMax Dashboard..."
echo ""

stopped=0

# Kill backend server (ts-node)
if pkill -f "ts-node server/index.ts" 2>/dev/null; then
  echo "✓ Stopped backend server"
  ((stopped++))
fi

# Kill frontend server (vite)
if pkill -f "vite" 2>/dev/null; then
  echo "✓ Stopped frontend server"
  ((stopped++))
fi

# Kill npm run dev parent process
if pkill -f "npm run dev" 2>/dev/null; then
  echo "✓ Stopped dev process"
  ((stopped++))
fi

# Force kill any remaining processes on the ports
if lsof -ti:3001 > /dev/null 2>&1; then
  lsof -ti:3001 | xargs kill -9 2>/dev/null
  echo "✓ Freed port 3001"
  ((stopped++))
fi

if lsof -ti:5173 > /dev/null 2>&1; then
  lsof -ti:5173 | xargs kill -9 2>/dev/null
  echo "✓ Freed port 5173"
  ((stopped++))
fi

sleep 1

if [ $stopped -eq 0 ]; then
  echo "ℹ No dashboard processes were running"
else
  echo ""
  echo "✓ Dashboard stopped"
fi

# Clean up log file
rm -f /tmp/dashboard.log 2>/dev/null
