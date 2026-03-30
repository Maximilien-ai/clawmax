#!/bin/bash

# ClawMax Setup Script v2
# Automated installation and configuration for ClawMax Dashboard
# Supports: dev mode (bypass OAuth) and production mode (GitHub OAuth)

set -e

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
print_info "ClawMax v1.1.21 Setup"
echo ""

# Must be in ClawMax directory
if [ ! -d "SYSTEM/dashboard" ]; then
  print_error "Not in a ClawMax directory. Please run from the clawmax repo root."
  exit 1
fi
CLAWMAX_DIR="$(pwd)"

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
      echo -e "  Install from: $url"
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
if command -v openclaw &> /dev/null; then
  OPENCLAW_INSTALLED=true
  OPENCLAW_VER=$(openclaw --version 2>&1 | head -1 | grep -o '[0-9]\{4\}\.[0-9]*\.[0-9]*' || echo "unknown")
  print_success "OpenClaw CLI: $OPENCLAW_VER"
else
  print_warning "OpenClaw CLI not found — required for agent management"
  echo ""

  if [ "$INTERACTIVE" = true ]; then
    echo "  Choose an installation source:"
    echo ""
    echo "  ${BOLD}1)${NC} Maximilien-ai fork (tested with ClawMax v1.1.21)"
    echo "     brew install maximilien-ai/openclaw/openclaw"
    echo ""
    echo "  ${BOLD}2)${NC} OpenClaw community (latest release — may have compatibility issues)"
    echo "     brew install openclaw/tap/openclaw"
    echo "     If issues arise, please submit at: https://github.com/Maximilien-ai/clawmax/issues"
    echo ""
    echo "  ${BOLD}3)${NC} Skip for now (dashboard will work but agent features limited)"
    echo ""
    read -p "  Choice (1/2/3): " -n 1 -r; echo

    case $REPLY in
      1)
        print_info "Installing from Maximilien-ai fork..."
        if brew install maximilien-ai/openclaw/openclaw 2>/dev/null; then
          OPENCLAW_INSTALLED=true
          print_success "OpenClaw installed from Maximilien-ai fork"
        else
          print_warning "Homebrew install failed — try manually: brew tap maximilien-ai/openclaw && brew install openclaw"
        fi
        ;;
      2)
        print_info "Installing from OpenClaw community..."
        if brew install openclaw/tap/openclaw 2>/dev/null; then
          OPENCLAW_INSTALLED=true
          print_success "OpenClaw installed from community"
          print_warning "Community version may have compatibility differences — test carefully"
        else
          print_warning "Install failed — try manually: brew tap openclaw/tap && brew install openclaw"
        fi
        ;;
      *)
        print_info "Skipped OpenClaw installation"
        ;;
    esac
  else
    print_info "Non-interactive: skipping OpenClaw install"
  fi
fi

echo ""

# ============================================================================
# 3. Mode Selection
# ============================================================================

print_header "3. Setup Mode"

DEV_MODE=false
if [ "$INTERACTIVE" = true ]; then
  echo "  ${BOLD}Development mode:${NC} Bypass OAuth, faster iteration"
  echo "  ${BOLD}Production mode:${NC}  GitHub OAuth login required"
  echo ""
  if ask_yn "Use development mode? (recommended for local dev)"; then
    DEV_MODE=true
    print_success "Development mode selected (OAuth bypassed)"
  else
    print_success "Production mode selected (GitHub OAuth required)"
  fi
else
  DEV_MODE=true
  print_info "Non-interactive: using development mode"
fi

echo ""

# ============================================================================
# 4. API Keys Configuration
# ============================================================================

print_header "4. API Keys"

echo "  ClawMax uses AI model APIs for agent creation and execution."
echo "  You need at least one provider key."
echo ""
echo "  ${BOLD}Key scopes:${NC}"
echo "    SYSTEM_* keys — used by dashboard features (AI generate, templates)"
echo "    USER_* keys   — used by your agents and workflows"
echo "    BYOK           — users can also provide keys in-browser"
echo ""

SYSTEM_OPENAI_KEY=""
SYSTEM_ANTHROPIC_KEY=""
OPIK_KEY=""

if [ "$INTERACTIVE" = true ]; then
  # OpenAI
  echo -e "  ${CYAN}OpenAI${NC} — for GPT models (gpt-4o, gpt-4o-mini, gpt-5)"
  echo "  Get key: https://platform.openai.com/api-keys"
  read -p "  SYSTEM_OPENAI_API_KEY (paste or Enter to skip): " SYSTEM_OPENAI_KEY
  if [ -n "$SYSTEM_OPENAI_KEY" ]; then
    print_success "OpenAI key configured"
  else
    print_info "Skipped OpenAI (can add later in .env)"
  fi
  echo ""

  # Anthropic
  echo -e "  ${CYAN}Anthropic${NC} — for Claude models (claude-sonnet-4, claude-opus-4-6)"
  echo "  Get key: https://console.anthropic.com/settings/keys"
  read -p "  SYSTEM_ANTHROPIC_API_KEY (paste or Enter to skip): " SYSTEM_ANTHROPIC_KEY
  if [ -n "$SYSTEM_ANTHROPIC_KEY" ]; then
    print_success "Anthropic key configured"
  else
    print_info "Skipped Anthropic (can add later in .env)"
  fi
  echo ""

  if [ -z "$SYSTEM_OPENAI_KEY" ] && [ -z "$SYSTEM_ANTHROPIC_KEY" ]; then
    print_warning "No API keys configured — AI features will be limited"
    print_info "Add keys later: edit SYSTEM/dashboard/.env"
  fi
  echo ""

  # Opik (optional monitoring)
  echo -e "  ${CYAN}Comet Opik${NC} — optional agent monitoring and cost tracking"
  echo "  Get key: https://www.comet.com/signup (free tier available)"
  if ask_yn "Configure Opik monitoring?"; then
    read -p "  OPIK_API_KEY: " OPIK_KEY
    if [ -n "$OPIK_KEY" ]; then
      read -p "  OPIK_WORKSPACE (default: clawmax): " OPIK_WORKSPACE
      OPIK_WORKSPACE=${OPIK_WORKSPACE:-clawmax}
      print_success "Opik configured"
    fi
  else
    print_info "Skipped Opik (can add later)"
  fi
fi

echo ""

# ============================================================================
# 5. GitHub OAuth (Production Mode)
# ============================================================================

GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

if [ "$DEV_MODE" = false ] && [ "$INTERACTIVE" = true ]; then
  print_header "5. GitHub OAuth"

  echo "  Production mode requires GitHub OAuth for login."
  echo ""
  echo "  ${BOLD}Setup steps:${NC}"
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
    print_warning "OAuth credentials incomplete — falling back to dev mode"
    DEV_MODE=true
  fi
else
  if [ "$DEV_MODE" = true ]; then
    print_info "Dev mode: OAuth bypassed (BYPASS_OAUTH=true)"
  fi
fi

echo ""

# ============================================================================
# 6. Workspace Setup
# ============================================================================

print_header "6. Workspace Configuration"

WORKSPACE="$CLAWMAX_DIR/WORKSPACES/default"

# Create workspace structure
for dir in WORKSPACES/default WORKSPACES/default/AGENTS WORKSPACES/default/WORKFLOWS WORKSPACES/default/ORG WORKSPACES/default/TEMPLATES WORKSPACES/default/SKILLS/custom WORKSPACES/default/SYSTEM; do
  mkdir -p "$CLAWMAX_DIR/$dir"
done
print_success "Workspace structure created: $WORKSPACE"

# OpenClaw config
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
if [ ! -f "$OPENCLAW_CONFIG" ]; then
  mkdir -p "$HOME/.openclaw"
  cat > "$OPENCLAW_CONFIG" << 'OCEOF'
{
  "agents": {},
  "meta": { "version": "0.3.0" }
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
DASHBOARD_PORT=3001
CORS_ORIGIN=http://localhost:5173
DASHBOARD_APP_URL=http://localhost:5173

# Auth mode
ENVEOF

if [ "$DEV_MODE" = true ]; then
  cat >> "$ENV_FILE" << 'ENVEOF'
BYPASS_OAUTH=true
# ⚠ Dev mode: no login required. Do NOT use in production.
ENVEOF
else
  cat >> "$ENV_FILE" << ENVEOF
BYPASS_OAUTH=false
GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET
ENVEOF
fi

cat >> "$ENV_FILE" << ENVEOF

# API Keys — at least one provider required for AI features
ENVEOF

if [ -n "$SYSTEM_OPENAI_KEY" ]; then
  echo "SYSTEM_OPENAI_API_KEY=$SYSTEM_OPENAI_KEY" >> "$ENV_FILE"
else
  echo "# SYSTEM_OPENAI_API_KEY=sk-..." >> "$ENV_FILE"
fi

if [ -n "$SYSTEM_ANTHROPIC_KEY" ]; then
  echo "SYSTEM_ANTHROPIC_API_KEY=$SYSTEM_ANTHROPIC_KEY" >> "$ENV_FILE"
else
  echo "# SYSTEM_ANTHROPIC_API_KEY=sk-ant-..." >> "$ENV_FILE"
fi

cat >> "$ENV_FILE" << 'ENVEOF'

# Allow system keys for user agent execution (dev convenience)
ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true

# BYOK: users can also provide keys in-browser via the BYOK wizard
ENVEOF

# Opik
if [ -n "$OPIK_KEY" ]; then
  cat >> "$ENV_FILE" << ENVEOF

# Comet Opik — agent monitoring and cost tracking
OPIK_API_KEY=$OPIK_KEY
OPIK_WORKSPACE="${OPIK_WORKSPACE:-clawmax}"
OPIK_PROJECT_NAME="ClawMax"
ENVEOF
else
  cat >> "$ENV_FILE" << 'ENVEOF'

# Comet Opik — optional monitoring (https://www.comet.com/signup)
# OPIK_API_KEY=
# OPIK_WORKSPACE=clawmax
# OPIK_PROJECT_NAME=ClawMax
ENVEOF
fi

print_success "Created .env file"

# Dashboard token
TOKEN_FILE="$WORKSPACE/.dashboard-token"
if [ ! -f "$TOKEN_FILE" ]; then
  TOKEN=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
  echo "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  print_success "Generated dashboard token"
else
  print_success "Dashboard token exists"
fi

echo ""

# ============================================================================
# 9. Gateway (Optional)
# ============================================================================

print_header "9. OpenClaw Gateway (Optional)"

if [ "$OPENCLAW_INSTALLED" = true ]; then
  if openclaw gateway status 2>&1 | grep -q "running"; then
    print_success "Gateway already running"
  elif [ "$INTERACTIVE" = true ]; then
    print_info "The gateway enables real-time agent chat via WebSocket"
    if ask_yn "Install and start gateway?"; then
      openclaw gateway install 2>/dev/null && print_success "Gateway installed" || print_warning "Gateway install failed (optional)"
      openclaw gateway restart 2>/dev/null && print_success "Gateway started" || true
    else
      print_info "Skipped (install later: openclaw gateway install)"
    fi
  else
    print_info "Non-interactive: skipping gateway"
  fi
else
  print_info "Gateway requires OpenClaw CLI — install OpenClaw first"
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

if [ "$VALID" = true ]; then
  print_success "All components verified"
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

echo "  ${BOLD}Start the dashboard:${NC}"
echo -e "    ${CYAN}./SYSTEM/start.sh${NC}"
echo ""
echo "  ${BOLD}Open in browser:${NC}"
echo -e "    ${CYAN}http://localhost:5173${NC}"
echo ""
echo "  ${BOLD}Run tests:${NC}"
echo -e "    ${CYAN}./SYSTEM/test.sh${NC}              # API + unit tests"
echo -e "    ${CYAN}./SYSTEM/test.sh integration${NC}  # + live agent tests"
echo ""
echo "  ${BOLD}Deploy a team:${NC}"
echo "    Templates → pick a template → Apply"
echo "    Try 'Small Startup Team' or 'Dev Team' to get started"
echo ""

MODE_STR="Dev mode (no login)"
[ "$DEV_MODE" = false ] && MODE_STR="Production mode (GitHub OAuth)"

echo "  ${BOLD}Configuration:${NC}"
echo "    Mode:      $MODE_STR"
echo "    Workspace: $WORKSPACE"
echo "    Backend:   http://localhost:3001"
echo "    Frontend:  http://localhost:5173"
echo "    .env:      SYSTEM/dashboard/.env"
echo ""

if [ "$OPENCLAW_INSTALLED" = false ]; then
  print_warning "OpenClaw CLI not installed — agent features require it"
  echo ""
fi

echo "  ${BOLD}Documentation:${NC}"
echo "    README:           ./README.md"
echo "    Known Issues:     ./SYSTEM/docs/KNOWN_ISSUES.md"
echo "    Testing Guide:    ./SYSTEM/docs/TESTING_GUIDE.md"
echo "    OAuth Setup:      ./SYSTEM/docs/OAUTH_SETUP.md"
echo ""
echo "  ${BOLD}Specs & Registries:${NC}"
echo "    Templates:  https://github.com/Maximilien-ai/templates"
echo "    Workflows:  https://github.com/Maximilien-ai/workflows"
echo ""
echo "  ${BOLD}Commercial:${NC}"
echo "    Cloud, On-Premise, Enterprise: https://clawmax.ai"
echo "    Contact: contact@clawmax.ai"
echo ""
echo -e "${CYAN}🦞 Happy agent orchestration!${NC}"
echo ""
