#!/usr/bin/env bash
# detect.sh — Environment detection helpers. Source this file; do not execute directly.

# ---------------------------------------------------------------------------
# detect_node_version  →  prints major version or exits if too old
# ---------------------------------------------------------------------------
detect_node_version() {
  if ! command -v node >/dev/null 2>&1; then
    die "Node.js not found. Install Node 22+ via: brew install node  OR  https://nodejs.org"
  fi
  local ver
  ver=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
  if [ "$ver" -lt 22 ]; then
    die "Node.js v$ver is too old. OpenClaw requires Node 22+. Run: brew upgrade node"
  fi
  echo "$ver"
}

# ---------------------------------------------------------------------------
# detect_openclaw_bin  →  prints path to openclaw CLI or dies
# ---------------------------------------------------------------------------
detect_openclaw_bin() {
  # 1. Check explicit env override
  if [ -n "${OPENCLAW_BIN:-}" ]; then echo "$OPENCLAW_BIN"; return; fi

  # 2. Global install
  if command -v openclaw >/dev/null 2>&1; then
    command -v openclaw; return
  fi

  # 3. Local dist from a clone
  for candidate in \
    "$OPENCLAW_DIR/dist/entry.js" \
    "$HOME/github/maximilien/openclaw/dist/entry.js" \
    "$HOME/github/openclaw/openclaw/dist/entry.js"; do
    if [ -f "$candidate" ]; then
      echo "node $candidate"; return
    fi
  done

  die "openclaw CLI not found. Install with: npm install -g openclaw  OR clone the repo and npm link"
}

# ---------------------------------------------------------------------------
# detect_openclaw_dir  →  prints path to openclaw source dir (for Baileys)
# ---------------------------------------------------------------------------
detect_openclaw_dir() {
  if [ -n "${OPENCLAW_DIR:-}" ]; then echo "$OPENCLAW_DIR"; return; fi

  # Try to find via which openclaw → follow symlink to package root
  if command -v openclaw >/dev/null 2>&1; then
    local bin
    bin=$(command -v openclaw)
    # Resolve symlink
    if command -v realpath >/dev/null 2>&1; then
      bin=$(realpath "$bin")
    fi
    # Walk up to find package.json
    local dir; dir=$(dirname "$bin")
    while [ "$dir" != "/" ]; do
      if [ -f "$dir/package.json" ] && grep -q '"openclaw"' "$dir/package.json" 2>/dev/null; then
        echo "$dir"; return
      fi
      dir=$(dirname "$dir")
    done
  fi

  # Fallback to known clone paths
  for candidate in \
    "$HOME/github/maximilien/openclaw" \
    "$HOME/github/openclaw/openclaw"; do
    if [ -f "$candidate/package.json" ]; then
      echo "$candidate"; return
    fi
  done

  echo ""  # not found, caller must handle
}

# ---------------------------------------------------------------------------
# detect_baileys_path  →  prints path to @whiskeysockets/baileys lib dir
# ---------------------------------------------------------------------------
detect_baileys_path() {
  local oc_dir="${1:-$(detect_openclaw_dir)}"

  # 1. pnpm workspace (fork/clone)
  if [ -d "$oc_dir/node_modules/.pnpm" ]; then
    local found
    found=$(find "$oc_dir/node_modules/.pnpm" -maxdepth 4 \
      -path "*/node_modules/@whiskeysockets/baileys" -type d 2>/dev/null | head -1)
    if [ -n "$found" ]; then echo "$found"; return; fi
  fi

  # 2. Regular node_modules (npm install)
  if [ -d "$oc_dir/node_modules/@whiskeysockets/baileys" ]; then
    echo "$oc_dir/node_modules/@whiskeysockets/baileys"; return
  fi

  # 3. npm global
  local npm_root
  npm_root=$(npm root -g 2>/dev/null || true)
  if [ -d "$npm_root/openclaw/node_modules/@whiskeysockets/baileys" ]; then
    echo "$npm_root/openclaw/node_modules/@whiskeysockets/baileys"; return
  fi

  # 4. Broad search (slow, last resort)
  find "$HOME/.npm-global" "$HOME/.local/lib" /opt/homebrew/lib/node_modules \
    -maxdepth 6 -path "*whiskeysockets/baileys" -type d 2>/dev/null | head -1
}

# ---------------------------------------------------------------------------
# detect_boom_path  →  prints path to @hapi/boom lib dir
# ---------------------------------------------------------------------------
detect_boom_path() {
  local oc_dir="${1:-$(detect_openclaw_dir)}"

  if [ -d "$oc_dir/node_modules/.pnpm" ]; then
    local found
    found=$(find "$oc_dir/node_modules/.pnpm" -maxdepth 4 \
      -path "*/node_modules/@hapi/boom" -type d 2>/dev/null | head -1)
    if [ -n "$found" ]; then echo "$found"; return; fi
  fi

  if [ -d "$oc_dir/node_modules/@hapi/boom" ]; then
    echo "$oc_dir/node_modules/@hapi/boom"; return
  fi

  local npm_root
  npm_root=$(npm root -g 2>/dev/null || true)
  if [ -d "$npm_root/openclaw/node_modules/@hapi/boom" ]; then
    echo "$npm_root/openclaw/node_modules/@hapi/boom"; return
  fi

  find "$HOME/.npm-global" "$HOME/.local/lib" /opt/homebrew/lib/node_modules \
    -maxdepth 6 -path "*@hapi/boom" -type d 2>/dev/null | head -1
}

# ---------------------------------------------------------------------------
# find_free_port <start>  →  prints first unused TCP port >= start
# ---------------------------------------------------------------------------
find_free_port() {
  local port="${1:-18789}"
  while lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; do
    port=$((port + 100))
  done
  echo "$port"
}

# ---------------------------------------------------------------------------
# detect_os  →  prints "macos" | "linux" | "unknown"
# ---------------------------------------------------------------------------
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    *)      echo "unknown" ;;
  esac
}

# ---------------------------------------------------------------------------
# openclaw_state_dir <name> <profile_mode>
#   Returns the state dir for an instance.
#   profile_mode=1  → ~/.openclaw-<name>
#   profile_mode=0  → ~/.openclaw  (separate machine)
# ---------------------------------------------------------------------------
openclaw_state_dir() {
  local name="$1" profile_mode="${2:-0}"
  if [ "$profile_mode" = "1" ]; then
    echo "$HOME/.openclaw-$name"
  else
    echo "$HOME/.openclaw"
  fi
}
