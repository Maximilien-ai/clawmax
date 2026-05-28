#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
ok() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

if [ ! -d "SYSTEM/dashboard" ]; then
  echo "Run update.sh from the ClawMax repo root."
  exit 1
fi

TARGET_REF="${1:-}"

if [ -n "$TARGET_REF" ] && [ -f "./install.sh" ]; then
  info "Delegating update to install.sh $TARGET_REF"
  exec ./install.sh "$TARGET_REF"
fi

if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    warn "Git worktree is dirty. Skipping automatic git pull."
  else
    info "Pulling latest changes from origin/main"
    git pull --ff-only origin main
    ok "Git checkout updated"
  fi
fi

info "Re-running setup in non-interactive mode"
./setup.sh --non-interactive
ok "Update complete"
