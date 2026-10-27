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

if [ -e ".git" ] && command -v git >/dev/null 2>&1; then
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    warn "Git worktree is dirty. Skipping automatic git pull."
  else
    current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
    upstream_ref="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
    if [ -z "$current_branch" ]; then
      warn "Detached release checkout. Skipping automatic git pull."
    elif [ -z "$upstream_ref" ]; then
      warn "Branch $current_branch has no configured upstream. Skipping automatic git pull."
    else
      info "Pulling latest changes for $current_branch from $upstream_ref"
      git pull --ff-only
      ok "Git checkout updated"
    fi
  fi
fi

info "Re-running setup in non-interactive mode"
./setup.sh --non-interactive
ok "Update prepared. Restart the dashboard to use the updated source."
echo "From the ClawMax repository root:"
echo "  Stop before restarting: ./SYSTEM/stop.sh"
echo "  Start the dashboard:    ./SYSTEM/start.sh"
echo "  Follow startup logs:    ./SYSTEM/start.sh --follow"
