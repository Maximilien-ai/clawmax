#!/bin/bash

# ClawMax Setup Script v2
# Automated installation and configuration for ClawMax Dashboard
# Supports: local dev with Email OTP or bypass, and production with GitHub OAuth or Email OTP

set -e

# Keep local setup aligned with the tested runtime pin used by the canonical Docker image.
OPENCLAW_GIT_REF="${OPENCLAW_GIT_REF:-1116ae97662cce066dd130bc07d925fdd1dd3f32}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_header() { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${BLUE}$1${NC}\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
ask_yn() { read -p "  $1 (y/N): " -n 1 -r; echo; [[ $REPLY =~ ^[Yy]$ ]]; }

# Non-interactive mode (CI)
INTERACTIVE=true
if [ ! -t 0 ] || [ "$CI" = "true" ] || [ "$1" = "--non-interactive" ]; then
  INTERACTIVE=false
fi

# ============================================================================
# Uninstall mode
# ============================================================================

if [ "$1" = "--uninstall" ] || [ "$1" = "uninstall" ]; then
  if [ -t 1 ] && [ -n "${TERM:-}" ]; then clear 2>/dev/null || true; fi
  echo -e "${CYAN}"
  cat << "EOF"
   ____ _               __  __
  / ___| | __ ___      _|  \/  | __ ___  __
 | |   | |/ _` \ \ /\ / / |\/| |/ _` \ \/ /
 | |___| | (_| |\ V  V /| |  | | (_| |>  <
  \____|_|\__,_| \_/\_/ |_|  |_|\__,_/_/\_\

  Multiagent Orchestration Platform
EOF
  echo -e "${NC}"
  print_info "ClawMax Uninstall"
  echo -e "${YELLOW}This will remove ClawMax and OpenClaw from your system.${NC}"
  echo ""
  echo "  What happens:"
  echo "    - ClawMax/OpenClaw runtime setup is removed from this machine"
  echo "    - Local dashboard dependencies and generated runtime config are removed"
  echo "    - Your work product is preserved unless you manually delete it later"
  echo ""
  echo "  The following will be removed:"
  echo "    - OpenClaw CLI (npm global or Homebrew)"
  echo "    - OpenClaw runtime config and local metadata (~/.openclaw/*.json, logs, temp state)"
  echo "    - Dashboard dependencies (SYSTEM/dashboard/node_modules/)"
  echo "    - Dashboard build artifacts (SYSTEM/dashboard/dist/)"
  echo "    - Dashboard .env (SYSTEM/dashboard/.env)"
  echo ""
  echo -e "  ${BOLD}NOT removed:${NC}"
  echo "    - This git repository (delete manually if desired)"
  echo "    - Your workspace data (WORKSPACES/) — preserved for safety"
  echo "    - Agent directories and files created by you or your agents (~/.openclaw/agents/, ~/.openclaw/workspace/, ~/.openclaw/workspaces/)"
  echo ""
  echo "  To cancel:"
  echo "    - Type anything other than ${BOLD}yes${NC} at the confirmation prompt"
  echo "    - Or press ${BOLD}Ctrl+C${NC} before the uninstall starts"
  echo ""

  if [ "$INTERACTIVE" = true ]; then
    read -p "  Are you sure you want to uninstall? (yes/N): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo ""
      print_info "Uninstall cancelled."
      exit 0
    fi
  else
    print_warning "Running in non-interactive uninstall mode — proceeding without a confirmation prompt."
  fi

  echo ""
  print_header "Stopping Dashboard"
  if [ -f "SYSTEM/stop.sh" ]; then
    bash SYSTEM/stop.sh 2>/dev/null || true
    print_success "Dashboard stopped"
  else
    print_info "No stop script found, skipping"
  fi

  print_header "Removing OpenClaw CLI"
  if command -v openclaw &> /dev/null; then
    # Try npm uninstall first
    if npm list -g openclaw &> /dev/null; then
      npm uninstall -g openclaw 2>/dev/null && print_success "Removed openclaw (npm)" || print_warning "npm uninstall failed"
    fi
    # Try brew uninstall
    if command -v brew &> /dev/null && brew list --formula maximilien-ai/openclaw/openclaw &> /dev/null 2>&1; then
      brew uninstall maximilien-ai/openclaw/openclaw 2>/dev/null && print_success "Removed openclaw (Homebrew)" || print_warning "brew uninstall failed"
    fi
    # Verify removal
    if command -v openclaw &> /dev/null; then
      print_warning "openclaw still found at $(which openclaw) — remove manually"
    fi
  else
    print_info "OpenClaw CLI not installed, skipping"
  fi

  print_header "Removing OpenClaw Data"
  OPENCLAW_DIR="$HOME/.openclaw"
  if [ -d "$OPENCLAW_DIR" ]; then
    rm -f \
      "$OPENCLAW_DIR/openclaw.json" \
      "$OPENCLAW_DIR/openclaw.json.bak" \
      "$OPENCLAW_DIR/dashboard-workspaces.json" \
      "$OPENCLAW_DIR/dashboard-workspaces.json.bak" \
      "$OPENCLAW_DIR/gateway-control-ui-token" \
      "$OPENCLAW_DIR/gateway.log" \
      "$OPENCLAW_DIR/gateway.pid" \
      "$OPENCLAW_DIR/gateway.sock" \
      "$OPENCLAW_DIR/gateway-state.json" \
      "$OPENCLAW_DIR/doctor-report.json" \
      "$OPENCLAW_DIR/auth-token" 2>/dev/null || true
    if [ -d "$OPENCLAW_DIR/logs" ]; then
      rm -rf "$OPENCLAW_DIR/logs"
    fi
    if [ -d "$OPENCLAW_DIR/tmp" ]; then
      rm -rf "$OPENCLAW_DIR/tmp"
    fi
    print_success "Removed OpenClaw config and runtime metadata"
    print_info "Preserved ~/.openclaw/agents, ~/.openclaw/workspace, and ~/.openclaw/workspaces"
  else
    print_info "No ~/.openclaw/ directory found"
  fi

  print_header "Cleaning Dashboard"
  if [ -d "SYSTEM/dashboard/node_modules" ]; then
    rm -rf SYSTEM/dashboard/node_modules
    print_success "Removed node_modules/"
  fi
  if [ -d "SYSTEM/dashboard/dist" ]; then
    rm -rf SYSTEM/dashboard/dist
    print_success "Removed dist/"
  fi
  if [ -f "SYSTEM/dashboard/.env" ]; then
    # Back up .env before removing (may have user's API keys)
    cp SYSTEM/dashboard/.env SYSTEM/dashboard/.env.uninstall-backup
    rm -f SYSTEM/dashboard/.env
    print_success "Removed .env (backup saved as .env.uninstall-backup)"
  fi
  # Clean log files
  rm -f /tmp/dashboard.log /tmp/ngrok.log 2>/dev/null
  if [ -d "SYSTEM/dashboard/server/logs" ]; then
    rm -rf SYSTEM/dashboard/server/logs
    print_success "Removed server logs"
  fi

  # Remove Homebrew tap
  if command -v brew &> /dev/null && brew tap | grep -q "maximilien-ai/openclaw"; then
    brew untap maximilien-ai/openclaw 2>/dev/null && print_success "Removed Homebrew tap" || true
  fi

  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Uninstall complete${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  Your workspace data in WORKSPACES/ has been preserved."
  echo "  Your agent/workspace files in ~/.openclaw/ have been preserved."
  echo "  To fully remove ClawMax, delete this directory:"
  echo -e "    ${BOLD}rm -rf $(pwd)${NC}"
  echo ""
  echo "  To reinstall later: git clone + ./setup.sh"
  echo ""
  exit 0
fi

# Welcome
if [ -t 1 ] && [ -n "${TERM:-}" ]; then clear 2>/dev/null || true; fi
echo -e "${CYAN}"
cat << "EOF"
   ____ _               __  __
  / ___| | __ ___      _|  \/  | __ ___  __
 | |   | |/ _` \ \ /\ / / |\/| |/ _` \ \/ /
 | |___| | (_| |\ V  V /| |  | | (_| |>  <
  \____|_|\__,_| \_/\_/ |_|  |_|\__,_/_/\_\

  Multiagent Orchestration Platform
EOF
echo -e "${NC}"
print_info "ClawMax v1.3.x Setup"
echo ""

# Must be in ClawMax directory
if [ ! -d "SYSTEM/dashboard" ]; then
  print_error "Not in a ClawMax directory. Please run from the clawmax repo root."
  exit 1
fi
CLAWMAX_DIR="$(pwd)"
SETUP_BACKEND_PORT="${DASHBOARD_PORT:-3001}"
SETUP_FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"
SETUP_FRONTEND_URL="${DASHBOARD_APP_URL:-http://localhost:${SETUP_FRONTEND_PORT}}"
SETUP_PUBLIC_URL="${DASHBOARD_PUBLIC_URL:-http://localhost:${SETUP_BACKEND_PORT}}"
SETUP_CORS_ORIGIN="${CORS_ORIGIN:-$SETUP_FRONTEND_URL}"

# ============================================================================
# 1. Prerequisites
# ============================================================================

print_header "1. Checking Prerequisites"

# Helper: offer to install a missing dependency
offer_install() {
  local name="$1"
  local brew_pkg="$2"
  local url="$3"

  if [ "$INTERACTIVE" = true ]; then
    echo ""
    echo -e "  ${BOLD}$name is required but not installed.${NC}"
    echo ""
    if command -v brew &> /dev/null && [ -n "$brew_pkg" ]; then
      echo -e "  Press ${BOLD}Enter${NC} to install via Homebrew (brew install $brew_pkg)"
      echo -e "  Press ${BOLD}s${NC} to skip and install manually"
      echo -e "  Get it from: $url"
      echo ""
      read -p "  [Enter/s]: " -n 1 -r; echo
      if [[ -z "$REPLY" || "$REPLY" == $'\n' ]]; then
        print_info "Installing $name via Homebrew..."
        if brew install "$brew_pkg"; then
          print_success "$name installed"
          return 0
        else
          print_error "Homebrew install failed"
          return 1
        fi
      fi
    else
      echo -e "  Installing from: $url"
      echo -e "  Press ${BOLD}Enter${NC} after installing, or ${BOLD}s${NC} to skip"
      read -p "  [Enter/s]: " -n 1 -r; echo
      if [[ -z "$REPLY" || "$REPLY" == $'\n' ]]; then
        # Check again after user says they installed
        return 0
      fi
    fi
    return 1
  else
    print_error "$name not found — install from $url"
    return 1
  fi
}

# Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | sed 's/v//')
  if [ "$NODE_MAJOR" -lt 18 ]; then
    print_error "Node.js 18+ required (found $NODE_VERSION)"
    if ! offer_install "Node.js 18+" "node" "https://nodejs.org/"; then
      exit 1
    fi
  fi
  print_success "Node.js: $(node --version)"
else
  if offer_install "Node.js" "node" "https://nodejs.org/"; then
    if command -v node &> /dev/null; then
      print_success "Node.js: $(node --version)"
    else
      print_error "Node.js still not found after install attempt"
      exit 1
    fi
  else
    exit 1
  fi
fi

# npm (comes with Node.js)
if command -v npm &> /dev/null; then
  print_success "npm: v$(npm --version)"
else
  print_error "npm not found (should come with Node.js)"
  exit 1
fi

# git
if command -v git &> /dev/null; then
  print_success "git: v$(git --version | cut -d' ' -f3)"
else
  if offer_install "git" "git" "https://git-scm.com/"; then
    if command -v git &> /dev/null; then
      print_success "git: v$(git --version | cut -d' ' -f3)"
    else
      print_error "git still not found"
      exit 1
    fi
  else
    exit 1
  fi
fi

echo ""

# ============================================================================
# 2. OpenClaw CLI
# ============================================================================

print_header "2. OpenClaw CLI"

OPENCLAW_INSTALLED=false
OPENCLAW_HOMEBREW_FORMULA="maximilien-ai/openclaw/openclaw"
OPENCLAW_BREW_MANAGED=false
if command -v openclaw &> /dev/null; then
  OPENCLAW_INSTALLED=true
  OPENCLAW_VER=$(openclaw --version 2>&1 | head -1 | grep -o '[0-9]\{4\}\.[0-9]*\.[0-9]*' || echo "unknown")
  print_success "OpenClaw CLI: $OPENCLAW_VER"
  if command -v brew &> /dev/null && brew list --formula "$OPENCLAW_HOMEBREW_FORMULA" &> /dev/null 2>&1; then
    OPENCLAW_BREW_MANAGED=true
    print_info "OpenClaw is managed by Homebrew — refreshing to latest tap formula..."
    brew tap maximilien-ai/openclaw >/dev/null 2>&1 || true
    brew update --quiet maximilien-ai/openclaw >/dev/null 2>&1 || brew update --quiet >/dev/null 2>&1 || true
    if brew upgrade --formula "$OPENCLAW_HOMEBREW_FORMULA"; then
      hash -r 2>/dev/null || true
      OPENCLAW_VER=$(openclaw --version 2>&1 | head -1 | grep -o '[0-9]\{4\}\.[0-9]*\.[0-9]*' || echo "unknown")
      print_success "OpenClaw CLI updated via Homebrew: $OPENCLAW_VER"
    else
      print_warning "Homebrew upgrade did not complete cleanly — keeping existing OpenClaw install"
    fi
  fi
else
  print_warning "OpenClaw CLI not found — required for agent management"
  echo ""

  if [ "$INTERACTIVE" = true ]; then
    echo -e "  Choose an installation method:"
    echo ""
    echo -e "  ${BOLD}1)${NC} npm global install ${GREEN}← recommended (fastest)${NC}"
    echo "     npm install -g github:openclaw/openclaw#$OPENCLAW_GIT_REF"
    echo ""
    echo -e "  ${BOLD}2)${NC} Homebrew (Maximilien-ai tap)"
    echo "     brew tap maximilien-ai/openclaw && brew install openclaw"
    echo ""
    echo -e "  ${BOLD}3)${NC} Skip for now (dashboard will work but agent features limited)"
    echo ""
    echo -e "  ${YELLOW}Note:${NC} Tracks the upstream OpenClaw project (https://openclaw.ai)."
    echo "  For production, we recommend staying current with upstream releases."
    echo ""
    echo -e "  Press ${BOLD}Enter${NC} for option 1 (recommended)"
    read -p "  Choice (1/2/3) [1]: " -n 1 -r; echo

    REPLY=${REPLY:-1}
    case $REPLY in
      1|"")
        print_info "Installing OpenClaw via npm (fastest, pinned to tested ref)..."
        if npm install -g "github:openclaw/openclaw#$OPENCLAW_GIT_REF"; then
          hash -r 2>/dev/null || true
          OPENCLAW_INSTALLED=true
          print_success "OpenClaw CLI installed"
        else
          print_warning "npm install failed — trying Homebrew..."
          brew tap maximilien-ai/openclaw || true
          brew update --quiet maximilien-ai/openclaw >/dev/null 2>&1 || brew update --quiet >/dev/null 2>&1 || true
          if brew install --formula "$OPENCLAW_HOMEBREW_FORMULA"; then
            hash -r 2>/dev/null || true
            OPENCLAW_INSTALLED=true
            print_success "OpenClaw CLI installed via Homebrew"
          else
            print_warning "Installation failed"
            echo "  Try manually: npm install -g github:openclaw/openclaw#$OPENCLAW_GIT_REF"
          fi
        fi
        ;;
      2)
        print_info "Installing OpenClaw via Homebrew..."
        brew tap maximilien-ai/openclaw || true
        brew update --quiet maximilien-ai/openclaw >/dev/null 2>&1 || brew update --quiet >/dev/null 2>&1 || true
        if brew install --formula "$OPENCLAW_HOMEBREW_FORMULA"; then
          hash -r 2>/dev/null || true
          OPENCLAW_INSTALLED=true
          print_success "OpenClaw CLI installed via Homebrew"
        else
          print_warning "Homebrew install failed — try: npm install -g github:openclaw/openclaw#$OPENCLAW_GIT_REF"
        fi
        ;;
      *)
        print_info "Skipped OpenClaw installation"
        ;;
    esac
  else
    # Non-interactive: try npm install automatically
    print_info "Installing OpenClaw CLI..."
    if npm install -g "github:openclaw/openclaw#$OPENCLAW_GIT_REF" 2>/dev/null; then
      hash -r 2>/dev/null || true
      OPENCLAW_INSTALLED=true
      print_success "OpenClaw CLI installed"
    else
      print_warning "OpenClaw install failed — try: npm install -g github:openclaw/openclaw#$OPENCLAW_GIT_REF"
    fi
  fi
fi

# Verify installation
if [ "$OPENCLAW_INSTALLED" = false ] && command -v openclaw &> /dev/null; then
  OPENCLAW_INSTALLED=true
fi
if [ "$OPENCLAW_INSTALLED" = true ]; then
  OPENCLAW_VER=$(openclaw --version 2>&1 | head -1 | grep -o '[0-9]\{4\}\.[0-9]*\.[0-9]*' || echo "installed")
  print_success "OpenClaw CLI ready: $OPENCLAW_VER"
elif [ "$OPENCLAW_INSTALLED" = false ]; then
  print_warning "OpenClaw CLI not installed — agent start/stop/chat will not work"
  echo -e "  Install later: ${BOLD}npm install -g github:openclaw/openclaw#$OPENCLAW_GIT_REF${NC}"
fi

echo ""

# ============================================================================
# 3. Mode Selection
# ============================================================================

print_header "3. Setup Mode"

AUTH_MODE="${AUTH_MODE:-}"
OTP_ALLOWED_EMAILS=""
OTP_DEV_MODE=""
if [ "$INTERACTIVE" = true ]; then
  echo -e "  ${BOLD}1) Local dev with bypass${NC}    — fastest, no login, good default for developers"
  echo -e "  ${BOLD}2) Local dev with Email OTP${NC} — realistic auth testing with login codes"
  echo -e "  ${BOLD}3) Production with GitHub OAuth${NC}"
  echo ""
  while true; do
    read -p "  Choose auth mode [1-3]: " AUTH_CHOICE
    case "${AUTH_CHOICE}" in
    1)
      AUTH_MODE="bypass"
      print_success "Local dev bypass selected"
      break
      ;;
    2)
      AUTH_MODE="email_otp"
      OTP_DEV_MODE="log"
      read -p "  OTP login email (default: dev@example.com): " OTP_ALLOWED_EMAILS
      OTP_ALLOWED_EMAILS=${OTP_ALLOWED_EMAILS:-dev@example.com}
      print_success "Local dev Email OTP selected"
      print_info "Codes will be written to .clawmax-otp-dev.json at the repo root"
      break
      ;;
    3)
      AUTH_MODE="github_oauth"
      print_success "Production mode selected (GitHub OAuth)"
      break
      ;;
    *)
      print_warning "Choose 1, 2, or 3."
      ;;
    esac
  done
else
  case "$AUTH_MODE" in
    bypass)
      print_info "Non-interactive: using local dev bypass"
      ;;
    email_otp)
      OTP_DEV_MODE="${OTP_DEV_MODE:-log}"
      OTP_ALLOWED_EMAILS="${OTP_ALLOWED_EMAILS:-dev@example.com}"
      print_info "Non-interactive: using Email OTP"
      ;;
    github_oauth)
      print_info "Non-interactive: using GitHub OAuth"
      ;;
    *)
      print_error "Non-interactive setup requires AUTH_MODE to be set to bypass, email_otp, or github_oauth"
      exit 1
      ;;
  esac
fi

echo ""

# ============================================================================
# 4. Keys & BYOK
# ============================================================================

print_header "4. Keys & BYOK"

echo "  setup.sh no longer collects provider or monitoring keys."
echo "  This keeps open-source setup consistent across clean machines."
echo ""
echo -e "  ${BOLD}Recommended path:${NC}"
echo "    1. Finish setup and start the dashboard"
echo "    2. Add model keys later in BYOK or Keys & Secrets"
echo "    3. Optionally edit SYSTEM/dashboard/.env for shared runtime keys"
echo ""
echo "  This also means partner integrations are opt-in by default."
echo ""
print_info "No API keys will be written by setup.sh"

echo ""

# ============================================================================
# 5. GitHub OAuth (Production Mode)
# ============================================================================

GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

if [ "$AUTH_MODE" = "github_oauth" ] && [ "$INTERACTIVE" = true ]; then
  print_header "5. GitHub OAuth"

  echo "  Production mode requires GitHub OAuth for login."
  echo ""
  echo -e "  ${BOLD}Setup steps:${NC}"
  echo "  1. Go to: https://github.com/settings/developers"
  echo "  2. Click 'New OAuth App'"
  echo "  3. Set Homepage URL: http://localhost:5173"
  echo "  4. Set Callback URL: http://localhost:3001/api/auth/github/callback"
  echo "  5. Copy Client ID and Client Secret"
  echo ""
  echo "  For detailed guide: SYSTEM/docs/OAUTH_SETUP.md"
  echo ""

  read -p "  GITHUB_CLIENT_ID: " GITHUB_CLIENT_ID
  read -p "  GITHUB_CLIENT_SECRET: " GITHUB_CLIENT_SECRET

  if [ -n "$GITHUB_CLIENT_ID" ] && [ -n "$GITHUB_CLIENT_SECRET" ]; then
    print_success "GitHub OAuth configured"
  else
    print_warning "OAuth credentials incomplete — falling back to local dev Email OTP"
    AUTH_MODE="email_otp"
    OTP_ALLOWED_EMAILS="dev@example.com"
    OTP_DEV_MODE="log"
  fi
else
  if [ "$AUTH_MODE" = "bypass" ]; then
    print_info "Dev mode: OAuth bypassed (BYPASS_OAUTH=true)"
  elif [ "$AUTH_MODE" = "email_otp" ] && [ "$OTP_DEV_MODE" = "log" ]; then
    print_info "Dev mode: Email OTP enabled (codes written to .clawmax-otp-dev.json)"
  fi
fi

echo ""

# ============================================================================
# 6. Workspace Setup
# ============================================================================

print_header "6. Workspace Configuration"

WORKSPACE="$CLAWMAX_DIR/WORKSPACES/default"

# Create workspace structure
for dir in WORKSPACES/default WORKSPACES/default/AGENTS WORKSPACES/default/WORKFLOWS WORKSPACES/default/ORG WORKSPACES/default/TEMPLATES WORKSPACES/default/PARTNERS WORKSPACES/default/SKILLS/custom WORKSPACES/default/SYSTEM; do
  mkdir -p "$CLAWMAX_DIR/$dir"
done
print_success "Workspace structure created: $WORKSPACE"

if [ -d "$CLAWMAX_DIR/PARTNERS" ]; then
  print_success "Built-in partner definitions found"
else
  mkdir -p "$CLAWMAX_DIR/PARTNERS"
  print_warning "Repo PARTNERS/ directory was missing — created an empty directory"
fi

# OpenClaw config
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
if [ ! -f "$OPENCLAW_CONFIG" ]; then
  mkdir -p "$HOME/.openclaw"
  cat > "$OPENCLAW_CONFIG" << 'OCEOF'
{
  "agents": {}
}
OCEOF
  print_success "Created OpenClaw config"
else
  print_success "OpenClaw config exists"
fi

echo ""

# ============================================================================
# 7. Install Dependencies
# ============================================================================

print_header "7. Installing Dashboard Dependencies"

cd "$CLAWMAX_DIR/SYSTEM/dashboard"
if [ -d "node_modules" ] && [ ! "package.json" -nt "node_modules" ]; then
  print_success "Dependencies up to date"
else
  print_info "Running npm install..."
  npm install --loglevel warn
  print_success "Dependencies installed"
fi
cd "$CLAWMAX_DIR"

echo ""

# ============================================================================
# 8. Generate .env
# ============================================================================

print_header "8. Environment Configuration"

ENV_FILE="$CLAWMAX_DIR/SYSTEM/dashboard/.env"

# Always regenerate to capture new settings
cat > "$ENV_FILE" << ENVEOF
# ClawMax Dashboard Environment — generated by setup.sh
# Edit this file to update keys and settings

# Workspace
OPENCLAW_WORKSPACE=$WORKSPACE
NODE_ENV=development
DASHBOARD_PORT=$SETUP_BACKEND_PORT
CORS_ORIGIN=$SETUP_CORS_ORIGIN
DASHBOARD_APP_URL=$SETUP_FRONTEND_URL
DASHBOARD_PUBLIC_URL=$SETUP_PUBLIC_URL

# Auth mode
ENVEOF

if [ "$AUTH_MODE" = "bypass" ]; then
  cat >> "$ENV_FILE" << 'ENVEOF'
DASHBOARD_AUTH_MODE=bypass
BYPASS_OAUTH=true
DASHBOARD_AUTH_DISABLED=true
# ⚠ Dev mode: no login required. Do NOT use in production.
ENVEOF
elif [ "$AUTH_MODE" = "email_otp" ]; then
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | fold -w 64 | head -n 1)
  cat >> "$ENV_FILE" << ENVEOF
DASHBOARD_AUTH_MODE=email_otp
BYPASS_OAUTH=false
OTP_ALLOWED_EMAILS=$OTP_ALLOWED_EMAILS
OTP_EXPIRY_MINUTES=15
OTP_FROM_EMAIL=max@clawmax.ai
OTP_EMAIL_SUBJECT="Your ClawMax login code"
JWT_SECRET=$JWT_SECRET
ENVEOF
  if [ "$OTP_DEV_MODE" = "log" ]; then
    cat >> "$ENV_FILE" << 'ENVEOF'
OTP_DEV_MODE=log
# Local dev: latest code is also written to .clawmax-otp-dev.json
ENVEOF
  else
    cat >> "$ENV_FILE" << 'ENVEOF'
# RESEND_API_KEY=re_xxx
ENVEOF
  fi
else
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | fold -w 64 | head -n 1)
  cat >> "$ENV_FILE" << ENVEOF
DASHBOARD_AUTH_MODE=github_oauth
BYPASS_OAUTH=false
GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET
JWT_SECRET=$JWT_SECRET
ENVEOF
fi

cat >> "$ENV_FILE" << ENVEOF

# Hosted provider keys are optional here.
# Add them later in BYOK / Keys & Secrets, or uncomment these for shared runtime defaults:
# SYSTEM_OPENAI_API_KEY=sk-...
# SYSTEM_ANTHROPIC_API_KEY=sk-ant-...

# Allow system keys for user agent execution (dev convenience)
ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true

# BYOK: users can also provide keys in-browser via the BYOK wizard

# Workflow execution timeout (defaults to 10 minutes in current releases)
# CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS=600000

# Partner integrations shown in Workspaces Integrations (comma-separated)
# Default is opt-in: leave empty until a user selects partners explicitly.
WORKSPACES_INTEGRATIONS_THIRD_PARTIES=

# Extra partner definition roots (optional)
# Built-in partner definitions ship in repo PARTNERS/
CLAWMAX_EXTRA_PARTNER_DIRS=$WORKSPACE/PARTNERS
ENVEOF

cat >> "$ENV_FILE" << 'ENVEOF'

# Comet Opik — optional monitoring (https://www.comet.com/signup)
# Add these later if you want runtime tracing and budget data:
# OPIK_API_KEY=
# OPIK_WORKSPACE=clawmax
# OPIK_PROJECT_NAME=<choose-a-project-name>
ENVEOF

print_success "Created .env file"
if [ "$AUTH_MODE" = "email_otp" ]; then
  print_info "OTP login email: $OTP_ALLOWED_EMAILS"
  if [ "$OTP_DEV_MODE" = "log" ]; then
    print_info "Dev OTP codes will be written to: $CLAWMAX_DIR/.clawmax-otp-dev.json"
  else
    print_info "Add RESEND_API_KEY to SYSTEM/dashboard/.env to send live OTP emails"
  fi
fi

# Dashboard token — keep the canonical file in SYSTEM/dashboard so the server
# and test harness resolve the same token on first boot. Preserve a legacy
# workspace copy as a compatibility fallback for older scripts.
TOKEN_FILE="$CLAWMAX_DIR/SYSTEM/dashboard/.dashboard-token"
LEGACY_TOKEN_FILE="$WORKSPACE/.dashboard-token"
if [ ! -f "$TOKEN_FILE" ]; then
  TOKEN=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
  echo "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  print_success "Generated dashboard token"
else
  TOKEN="$(cat "$TOKEN_FILE" 2>/dev/null || true)"
  print_success "Dashboard token exists"
fi

if [ -n "$TOKEN" ]; then
  echo "$TOKEN" > "$LEGACY_TOKEN_FILE"
  chmod 600 "$LEGACY_TOKEN_FILE"
fi

echo ""

# ============================================================================
# 9. Gateway Setup
# ============================================================================

print_header "9. OpenClaw Gateway"

if [ "$OPENCLAW_INSTALLED" = true ]; then
  print_info "The gateway enables agent skills and tool-use (required for GitHub, Senso, etc.)"

  # Configure gateway mode
  GATEWAY_MODE=$(openclaw config get gateway.mode 2>/dev/null || echo "")
  if [ -z "$GATEWAY_MODE" ] || [ "$GATEWAY_MODE" = "unset" ] || [ "$GATEWAY_MODE" = "undefined" ]; then
    openclaw config set gateway.mode local 2>/dev/null
    print_success "Gateway mode set to local"
  else
    print_success "Gateway mode: $GATEWAY_MODE"
  fi

  # Generate auth token if missing
  GATEWAY_TOKEN=$(openclaw config get gateway.auth.token 2>/dev/null || echo "")
  if [ -z "$GATEWAY_TOKEN" ] || [ "$GATEWAY_TOKEN" = "unset" ] || [ "$GATEWAY_TOKEN" = "undefined" ]; then
    # Generate a random token
    GW_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
    openclaw config set gateway.auth.token "$GW_TOKEN" 2>/dev/null
    print_success "Gateway auth token generated"
  else
    print_success "Gateway auth token configured"
  fi

  # Install gateway service on macOS only.
  if [ "$(uname -s)" = "Darwin" ]; then
    if ! launchctl list 2>/dev/null | grep -q "ai.openclaw.gateway"; then
      openclaw gateway install 2>/dev/null && print_success "Gateway service installed" || print_warning "Gateway service install failed"
    else
      print_success "Gateway service already installed"
    fi
  else
    print_info "Skipping gateway service install on $(uname -s) — using direct gateway startup"
  fi

  # Start/restart gateway
  if openclaw gateway status 2>&1 | grep -q "running"; then
    print_success "Gateway already running"
  else
    print_info "Starting gateway..."
    openclaw gateway restart 2>/dev/null &
    GW_PID=$!

    # Wait up to 15s for gateway to start
    GW_READY=false
    for i in {1..15}; do
      sleep 1
      if lsof -ti:18789 > /dev/null 2>&1; then
        GW_READY=true
        break
      fi
      echo -n "."
    done
    echo ""

    if [ "$GW_READY" = true ]; then
      print_success "Gateway running on port 18789"
    else
      print_warning "Gateway didn't start in 15s — agents will use --local mode (chat works, skills limited)"
      echo -e "  Fix later: ${BOLD}openclaw config set gateway.mode local && openclaw gateway restart${NC}"
    fi
  fi

  # Create session store if missing
  SESSIONS_DIR="$HOME/.openclaw/agents/main/sessions"
  if [ ! -d "$SESSIONS_DIR" ]; then
    mkdir -p "$SESSIONS_DIR"
    print_success "Created session store"
  fi
else
  print_warning "Gateway requires OpenClaw CLI — agents will use --local mode"
fi

echo ""

# ============================================================================
# 10. Verify
# ============================================================================

print_header "10. Verifying Setup"

VALID=true
[ ! -d "$WORKSPACE/AGENTS" ] && print_error "AGENTS/ missing" && VALID=false
[ ! -d "$CLAWMAX_DIR/SYSTEM/dashboard/node_modules" ] && print_error "Dependencies missing" && VALID=false
[ ! -f "$ENV_FILE" ] && print_error ".env missing" && VALID=false

# Check critical components
if command -v openclaw &> /dev/null; then
  print_success "OpenClaw CLI: $(openclaw --version 2>&1 | head -1 | grep -o '[0-9]\{4\}\.[0-9]*\.[0-9]*' || echo 'installed')"
else
  print_warning "OpenClaw CLI not installed — agent features limited"
fi

if lsof -ti:18789 > /dev/null 2>&1; then
  print_success "Gateway running on port 18789 (skills enabled)"
else
  print_warning "Gateway not running — agents will chat but can't use skills"
fi

if [ "$VALID" = true ]; then
  print_success "All core components verified"
else
  print_error "Setup incomplete — review errors above"
  exit 1
fi

echo ""

# ============================================================================
# 11. Summary
# ============================================================================

print_header "Setup Complete!"

echo -e "${GREEN}✓ ClawMax is ready!${NC}\n"

# Offer to start the dashboard
if [ "$INTERACTIVE" = true ]; then
  if ask_yn "Start the dashboard now?"; then
    print_info "Starting ClawMax dashboard..."
    ./SYSTEM/start.sh
    echo ""
    echo -e "  ${GREEN}Dashboard is running!${NC}"
    echo -e "  Open ${CYAN}http://localhost:5173${NC} in your browser"
    echo ""
  else
    echo ""
    echo -e "  To start later, run:"
    echo -e "    ${CYAN}./SYSTEM/start.sh${NC}"
    echo ""
  fi
else
  echo -e "  ${BOLD}Start the dashboard:${NC}"
  echo -e "    ${CYAN}./SYSTEM/start.sh${NC}"
fi
echo ""
echo -e "  ${BOLD}Open in browser:${NC}"
echo -e "    ${CYAN}$SETUP_FRONTEND_URL${NC}"
echo ""
echo -e "  ${BOLD}Run tests:${NC}"
echo -e "    ${CYAN}./SYSTEM/test.sh${NC}              # API + unit tests"
echo -e "    ${CYAN}./SYSTEM/test.sh integration${NC}  # + live agent tests"
echo ""
echo -e "  ${BOLD}Deploy a team:${NC}"
echo "    Templates → pick a template → Apply"
echo "    Try 'Small Startup Team' or 'Dev Team' to get started"
echo ""

MODE_STR="Production mode (GitHub OAuth)"
if [ "$AUTH_MODE" = "bypass" ]; then
  MODE_STR="Local dev (bypass auth)"
elif [ "$AUTH_MODE" = "email_otp" ] && [ "$OTP_DEV_MODE" = "log" ]; then
  MODE_STR="Local dev (Email OTP)"
elif [ "$AUTH_MODE" = "email_otp" ]; then
  MODE_STR="Production mode (Email OTP)"
fi

echo -e "  ${BOLD}Configuration:${NC}"
echo "    Mode:      $MODE_STR"
echo "    Workspace: $WORKSPACE"
echo "    Partners:  $CLAWMAX_DIR/PARTNERS"
echo "    Backend:   $SETUP_PUBLIC_URL"
echo "    Frontend:  $SETUP_FRONTEND_URL"
echo "    .env:      SYSTEM/dashboard/.env"
if [ "$AUTH_MODE" = "email_otp" ]; then
  echo "    OTP email: $OTP_ALLOWED_EMAILS"
  if [ "$OTP_DEV_MODE" = "log" ]; then
    echo "    OTP file:  ./.clawmax-otp-dev.json"
  fi
fi
echo ""

if [ "$OPENCLAW_INSTALLED" = false ]; then
  print_warning "OpenClaw CLI not installed — agent features require it"
  echo ""
fi

echo -e "  ${BOLD}Documentation:${NC}"
echo "    README:           ./README.md"
echo "    Known Issues:     ./SYSTEM/docs/KNOWN_ISSUES.md"
echo "    Testing Guide:    ./SYSTEM/docs/TESTING_GUIDE.md"
echo "    OAuth Setup:      ./SYSTEM/docs/OAUTH_SETUP.md"
echo ""
echo -e "  ${BOLD}Specs & Registries:${NC}"
echo "    Templates:  https://github.com/Maximilien-ai/templates"
echo "    Workflows:  https://github.com/Maximilien-ai/workflows"
echo ""
echo -e "  ${BOLD}Commercial:${NC}"
echo "    Cloud, On-Premise, Enterprise: https://clawmax.ai"
echo "    Contact: contact@clawmax.ai"
echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  ${BOLD}👉 Open your dashboard:${NC}  ${CYAN}http://localhost:5173${NC}"
echo ""
echo -e "  Not running? Start with: ${CYAN}./SYSTEM/start.sh${NC}"
echo ""
echo -e "${CYAN}🦞 Happy agent orchestration!${NC}"
echo ""
