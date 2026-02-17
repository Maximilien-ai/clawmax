#!/usr/bin/env bash
# install.sh — Platform-aware dependency installer for OpenClaw instance setup.
# Source this file; do not execute directly.
#
# Exports:
#   check_and_install_deps   — detects & optionally installs all prerequisites

# ---------------------------------------------------------------------------
# _install_homebrew  (macOS only)
# ---------------------------------------------------------------------------
_install_homebrew() {
  info "Homebrew not found."
  if confirm "Install Homebrew now? (requires internet + sudo for Xcode CLT)"; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Homebrew may install to /opt/homebrew (Apple Silicon) or /usr/local (Intel)
    for brew_candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if [ -x "$brew_candidate" ]; then
        eval "$("$brew_candidate" shellenv)"
        break
      fi
    done
    ok "Homebrew installed"
  else
    die "Homebrew is required on macOS. Install manually: https://brew.sh"
  fi
}

# ---------------------------------------------------------------------------
# _install_node_macos
# ---------------------------------------------------------------------------
_install_node_macos() {
  local current_ver="${1:-0}"
  if [ "$current_ver" -eq 0 ]; then
    info "Node.js not found."
    if confirm "Install Node.js 22+ via Homebrew?"; then
      brew install node
      ok "Node.js installed"
    else
      die "Node.js 22+ is required. Install manually: brew install node  OR  https://nodejs.org"
    fi
  else
    warn "Node.js v$current_ver is too old (need 22+)."
    if confirm "Upgrade Node.js via Homebrew?"; then
      brew upgrade node
      ok "Node.js upgraded"
    else
      die "Node.js 22+ is required. Upgrade manually: brew upgrade node"
    fi
  fi
}

# ---------------------------------------------------------------------------
# _install_node_linux
# ---------------------------------------------------------------------------
_install_node_linux() {
  local current_ver="${1:-0}"
  if [ "$current_ver" -eq 0 ]; then
    info "Node.js not found."
  else
    warn "Node.js v$current_ver is too old (need 22+)."
  fi

  printf "\n  Choose an install method:\n"
  printf "  1) NodeSource (apt)   — sudo required\n"
  printf "  2) nvm                — installs to ~/.nvm, no sudo\n"
  printf "  3) Skip               — I'll install manually\n"
  printf "${YELLOW}Choice [1/2/3]:${RESET} "
  read -r _choice
  case "$_choice" in
    1)
      info "Installing Node.js 22 via NodeSource…"
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
      ok "Node.js installed via NodeSource"
      ;;
    2)
      info "Installing nvm…"
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
      # shellcheck disable=SC1090
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
      nvm install 22
      nvm use 22
      ok "Node.js 22 installed via nvm"
      ;;
    *)
      die "Node.js 22+ is required. Install manually: https://nodejs.org"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# _install_openclaw
# ---------------------------------------------------------------------------
_install_openclaw() {
  info "openclaw CLI not found in PATH."
  if confirm "Install openclaw globally via npm? (npm install -g openclaw)"; then
    npm install -g openclaw
    ok "openclaw installed"
  else
    warn "Skipping openclaw install."
    warn "Options:"
    warn "  npm install -g openclaw"
    warn "  OR: clone the repo, pnpm install && pnpm build && npm link"
    die "openclaw CLI is required to continue."
  fi
}

# ---------------------------------------------------------------------------
# check_and_install_deps
#   Checks prerequisites for the current platform and offers to install
#   anything missing. Called at the top of setup.sh before any real work.
# ---------------------------------------------------------------------------
check_and_install_deps() {
  local os
  os=$(detect_os)

  step "0  Checking system dependencies"
  printf "  Platform: %s\n" "$os"
  echo ""

  case "$os" in
    # -----------------------------------------------------------------------
    macos)
      # --- Homebrew ---
      if ! command -v brew >/dev/null 2>&1; then
        _install_homebrew
      else
        ok "Homebrew $(brew --version 2>/dev/null | head -1 | awk '{print $2}')"
      fi

      # --- Node.js ---
      local node_ver=0
      if command -v node >/dev/null 2>&1; then
        node_ver=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
      fi
      if [ "$node_ver" -lt 22 ]; then
        _install_node_macos "$node_ver"
        # Re-read version after install
        node_ver=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
      fi
      ok "Node.js v$node_ver"

      # --- openclaw ---
      if ! command -v openclaw >/dev/null 2>&1 && [ -z "${OPENCLAW_BIN:-}" ]; then
        # Check if a local dist exists before offering global install
        local found_local=0
        for candidate in \
          "$HOME/github/maximilien/openclaw/dist/entry.js" \
          "$HOME/github/openclaw/openclaw/dist/entry.js"; do
          if [ -f "$candidate" ]; then
            found_local=1
            ok "openclaw (local dist): $candidate"
            info "Tip: run 'npm link' from that directory to get a global 'openclaw' command"
            break
          fi
        done
        if [ "$found_local" -eq 0 ]; then
          _install_openclaw
        fi
      else
        ok "openclaw CLI: $(command -v openclaw 2>/dev/null || echo "${OPENCLAW_BIN}")"
      fi
      ;;

    # -----------------------------------------------------------------------
    linux)
      # --- Node.js ---
      local node_ver=0
      if command -v node >/dev/null 2>&1; then
        node_ver=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
      fi
      if [ "$node_ver" -lt 22 ]; then
        _install_node_linux "$node_ver"
        node_ver=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
      fi
      ok "Node.js v$node_ver"

      # --- openclaw ---
      if ! command -v openclaw >/dev/null 2>&1 && [ -z "${OPENCLAW_BIN:-}" ]; then
        _install_openclaw
      else
        ok "openclaw CLI: $(command -v openclaw 2>/dev/null || echo "${OPENCLAW_BIN}")"
      fi
      ;;

    # -----------------------------------------------------------------------
    *)
      warn "Unknown platform — skipping automatic dependency installation."
      warn "Please ensure Node.js 22+ and openclaw CLI are installed manually."
      ;;
  esac

  echo ""
}
