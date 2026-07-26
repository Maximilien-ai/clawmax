#!/bin/bash
# Build ClawMax Dashboard for production
#
# Usage:
#   ./SYSTEM/build.sh           - Install deps + build everything
#   ./SYSTEM/build.sh --clean   - Remove dist/ first, then build

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"

cd "$DASHBOARD_DIR"

# Parse arguments
CLEAN=false
for arg in "$@"; do
  if [[ "$arg" == "--clean" ]] || [[ "$arg" == "-c" ]]; then
    CLEAN=true
  fi
done

echo "=== ClawMax Dashboard Build ==="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null || true)
if [ -z "$NODE_VERSION" ]; then
  echo "ERROR: Node.js is not installed."
  echo "  Install Node.js 22.19+ from https://nodejs.org or via:"
  echo "    brew install node"
  exit 1
fi
if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 19) ? 0 : 1)'; then
  echo "ERROR: Node.js 22.19+ required (found $NODE_VERSION)"
  exit 1
fi
echo "Node.js $NODE_VERSION"

# Clean if requested
if [ "$CLEAN" = true ]; then
  echo "Cleaning dist/..."
  rm -rf dist/
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install --no-audit --no-fund 2>&1 | tail -1
echo "Dependencies installed."

# Build server (TypeScript -> JavaScript)
echo ""
echo "Compiling server..."
npx tsc -p tsconfig.server.json
echo "Server compiled to dist/server/"

# Build client (Vite)
echo ""
echo "Building client..."
npx vite build 2>&1 | grep -E "^(vite|✓|dist/)" || true
echo "Client built to dist/client/"

echo ""
echo "=== Build complete ==="
echo ""
echo "To start in production mode:"
echo "  cd SYSTEM/dashboard && npm start"
echo ""
echo "Or use the dev server (with hot reload):"
echo "  ./SYSTEM/start.sh"
