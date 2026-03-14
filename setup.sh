#!/bin/bash

# ClawMax Setup Script
# Automated installation and setup for ClawMax Dashboard

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Tested OpenClaw version
OPENCLAW_VERSION="v0.3.0"
OPENCLAW_COMMIT="55c2aaf"

# Print functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Welcome message
clear
echo -e "${BLUE}"
cat << "EOF"
   ____ _               __  __
  / ___| | __ ___      _|  \/  | __ ___  __
 | |   | |/ _` \ \ /\ / / |\/| |/ _` \ \/ /
 | |___| | (_| |\ V  V /| |  | | (_| |>  <
  \____|_|\__,_| \_/\_/ |_|  |_|\__,_/_/\_\

  Visual Management Dashboard for OpenClaw
EOF
echo -e "${NC}"
print_info "ClawMax v1.0.1 Setup"
echo ""

# ============================================================================
# 1. Check Prerequisites
# ============================================================================

print_header "Checking Prerequisites"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js: $NODE_VERSION"

    # Check if version is 18+
    NODE_MAJOR=$(node --version | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        print_error "Node.js 18+ required (found v$NODE_MAJOR)"
        print_info "Install from: https://nodejs.org/"
        exit 1
    fi
else
    print_error "Node.js not found"
    print_info "Install from: https://nodejs.org/"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm: v$NPM_VERSION"
else
    print_error "npm not found"
    exit 1
fi

# Check git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    print_success "git: v$GIT_VERSION"
else
    print_error "git not found"
    print_info "Install from: https://git-scm.com/"
    exit 1
fi

# Check OpenClaw
OPENCLAW_INSTALLED=false
if command -v openclaw &> /dev/null; then
    OPENCLAW_INSTALLED=true
    print_success "OpenClaw: installed"

    # Check version
    OPENCLAW_DIR="$HOME/github/maximilien/openclaw"
    if [ -d "$OPENCLAW_DIR/.git" ]; then
        cd "$OPENCLAW_DIR"
        CURRENT_COMMIT=$(git rev-parse --short HEAD)

        if [ "$CURRENT_COMMIT" = "$OPENCLAW_COMMIT" ]; then
            print_success "OpenClaw version: $OPENCLAW_COMMIT (tested)"
        else
            print_warning "OpenClaw commit: $CURRENT_COMMIT (tested: $OPENCLAW_COMMIT)"
            print_info "ClawMax v1.0.1 is tested with OpenClaw commit $OPENCLAW_COMMIT"
        fi
        cd - > /dev/null
    fi
else
    print_error "OpenClaw not found"
    print_info "ClawMax requires OpenClaw to manage agents"
    print_info "Install from: https://openclaw.ai or https://github.com/openclaw/openclaw"
    echo ""
    read -p "Would you like installation instructions? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        print_info "OpenClaw Installation:"
        echo "  1. Clone the repository:"
        echo "     git clone https://github.com/openclaw/openclaw.git ~/github/maximilien/openclaw"
        echo ""
        echo "  2. Follow the installation guide at https://openclaw.ai"
        echo ""
        echo "  3. After installing OpenClaw, re-run this setup script"
        echo ""
    fi
    exit 1
fi

echo ""

# ============================================================================
# 2. Detect or Set Workspace
# ============================================================================

print_header "Workspace Configuration"

# Check if we're already in a ClawMax directory
if [ -d "SYSTEM/dashboard" ]; then
    CLAWMAX_DIR="$(pwd)"
    print_success "Found ClawMax in current directory"
else
    print_error "Not in a ClawMax directory"
    print_info "Please run this script from the ClawMax root directory"
    exit 1
fi

# Determine workspace path
# Note: v1.1.0 will introduce workspaces/ directory structure
# For now, we use the ClawMax root directory as workspace
if [ -n "$OPENCLAW_WORKSPACE" ]; then
    WORKSPACE="$OPENCLAW_WORKSPACE"
    print_info "Using existing workspace: $WORKSPACE"
else
    WORKSPACE="$CLAWMAX_DIR"
    print_info "Setting workspace to: $WORKSPACE"
    print_info "(v1.1.0 will introduce workspaces/ directory)"
fi

# Verify workspace structure
if [ ! -d "$WORKSPACE/AGENTS" ]; then
    mkdir -p "$WORKSPACE/AGENTS"
    print_success "Created AGENTS/ directory"
fi

if [ ! -d "$WORKSPACE/WORKFLOWS" ]; then
    mkdir -p "$WORKSPACE/WORKFLOWS"
    print_success "Created WORKFLOWS/ directory"
fi

if [ ! -d "$WORKSPACE/GROUPS" ]; then
    mkdir -p "$WORKSPACE/GROUPS"
    touch "$WORKSPACE/GROUPS/GROUPS.md"
    print_success "Created GROUPS/ directory"
fi

if [ ! -d "$WORKSPACE/COMMUNITIES" ]; then
    mkdir -p "$WORKSPACE/COMMUNITIES"
    touch "$WORKSPACE/COMMUNITIES/COMMUNITIES.md"
    print_success "Created COMMUNITIES/ directory"
fi

echo ""

# ============================================================================
# 3. Check OpenClaw Configuration
# ============================================================================

print_header "OpenClaw Configuration"

OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"

if [ ! -f "$OPENCLAW_CONFIG" ]; then
    print_warning "OpenClaw config not found at $OPENCLAW_CONFIG"
    print_info "Creating minimal OpenClaw configuration..."

    mkdir -p "$HOME/.openclaw"

    cat > "$OPENCLAW_CONFIG" << 'EOF'
{
  "agents": {
    "list": []
  },
  "meta": {
    "version": "0.3.0",
    "lastTouchedAt": "2026-03-15T00:00:00.000Z"
  }
}
EOF
    print_success "Created openclaw.json"
else
    print_success "OpenClaw config exists"
fi

# Check for API keys
MISSING_KEYS=()

if ! grep -q "ANTHROPIC_API_KEY" "$OPENCLAW_CONFIG" 2>/dev/null && [ -z "$ANTHROPIC_API_KEY" ]; then
    MISSING_KEYS+=("ANTHROPIC_API_KEY")
fi

if ! grep -q "OPENAI_API_KEY" "$OPENCLAW_CONFIG" 2>/dev/null && [ -z "$OPENAI_API_KEY" ]; then
    MISSING_KEYS+=("OPENAI_API_KEY")
fi

if [ ${#MISSING_KEYS[@]} -gt 0 ]; then
    print_warning "Missing API keys detected"
    echo ""
    echo "ClawMax agents require API keys to function:"
    echo ""

    for key in "${MISSING_KEYS[@]}"; do
        echo "  • $key"
    done

    echo ""
    print_info "You can add these to your environment or OpenClaw config"
    echo ""
    echo "Option 1: Export environment variables (recommended):"
    echo "  export ANTHROPIC_API_KEY='your-key-here'"
    echo "  export OPENAI_API_KEY='your-key-here'"
    echo ""
    echo "Option 2: Add to ~/.openclaw/openclaw.json:"
    echo '  "env": {'
    echo '    "ANTHROPIC_API_KEY": "your-key-here",'
    echo '    "OPENAI_API_KEY": "your-key-here"'
    echo '  }'
    echo ""

    read -p "Continue setup without API keys? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Please configure API keys and re-run setup"
        exit 1
    fi
else
    print_success "API keys configured"
fi

echo ""

# ============================================================================
# 4. Install Dashboard Dependencies
# ============================================================================

print_header "Installing Dashboard Dependencies"

cd "$CLAWMAX_DIR/SYSTEM/dashboard"

if [ -d "node_modules" ]; then
    print_info "node_modules already exists"

    # Check if we need to update
    if [ "package.json" -nt "node_modules" ]; then
        print_warning "package.json is newer than node_modules"
        read -p "Re-run npm install? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Running npm install..."
            npm install
            print_success "Dependencies updated"
        fi
    else
        print_success "Dependencies up to date"
    fi
else
    print_info "Running npm install (this may take a few minutes)..."
    npm install
    print_success "Dependencies installed"
fi

cd "$CLAWMAX_DIR"
echo ""

# ============================================================================
# 5. Configure Dashboard Token
# ============================================================================

print_header "Dashboard Authentication"

TOKEN_FILE="$CLAWMAX_DIR/SYSTEM/dashboard/.dashboard-token"

if [ -f "$TOKEN_FILE" ]; then
    print_success "Dashboard token already exists"
else
    # Generate random token
    if command -v openssl &> /dev/null; then
        TOKEN=$(openssl rand -hex 32)
    else
        TOKEN=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1)
    fi

    echo "$TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    print_success "Generated dashboard token"
fi

echo ""

# ============================================================================
# 6. Environment Setup
# ============================================================================

print_header "Environment Configuration"

# Create .env file if it doesn't exist
ENV_FILE="$CLAWMAX_DIR/SYSTEM/dashboard/.env"

if [ -f "$ENV_FILE" ]; then
    print_success ".env file already exists"
else
    cat > "$ENV_FILE" << EOF
# ClawMax Dashboard Environment
OPENCLAW_WORKSPACE=$WORKSPACE
NODE_ENV=development
PORT=3001
VITE_PORT=5173
EOF
    print_success "Created .env file"
fi

print_info "Workspace: $WORKSPACE"
print_info "Backend: http://localhost:3001"
print_info "Frontend: http://localhost:5173"

echo ""

# ============================================================================
# 7. Gateway Setup (Optional)
# ============================================================================

print_header "OpenClaw Gateway (Optional)"

if command -v openclaw &> /dev/null; then
    # Check if gateway is installed
    if openclaw gateway status &> /dev/null || [ -f "$HOME/.openclaw/.gateway-installed" ]; then
        print_success "Gateway already installed"
    else
        print_info "The OpenClaw Gateway enables real-time agent chat"
        read -p "Install gateway now? (recommended) (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Installing gateway..."
            if openclaw gateway install; then
                print_success "Gateway installed"
                touch "$HOME/.openclaw/.gateway-installed"
            else
                print_warning "Gateway installation failed (optional feature)"
            fi
        else
            print_info "Skipped gateway installation (you can install later with: openclaw gateway install)"
        fi
    fi
fi

echo ""

# ============================================================================
# 8. Verify Setup
# ============================================================================

print_header "Verifying Setup"

# Check all components
SETUP_VALID=true

if [ ! -d "$WORKSPACE/AGENTS" ]; then
    print_error "Workspace AGENTS directory missing"
    SETUP_VALID=false
fi

if [ ! -d "$CLAWMAX_DIR/SYSTEM/dashboard/node_modules" ]; then
    print_error "Dashboard dependencies not installed"
    SETUP_VALID=false
fi

if [ ! -f "$TOKEN_FILE" ]; then
    print_error "Dashboard token missing"
    SETUP_VALID=false
fi

if [ "$SETUP_VALID" = true ]; then
    print_success "All components verified"
else
    print_error "Setup incomplete - please review errors above"
    exit 1
fi

echo ""

# ============================================================================
# 9. Summary and Next Steps
# ============================================================================

print_header "Setup Complete!"

echo -e "${GREEN}✓ ClawMax is ready to use!${NC}\n"

echo "Next steps:"
echo ""
echo "  1. Start the dashboard:"
echo -e "     ${BLUE}./SYSTEM/start.sh${NC}"
echo ""
echo "  2. Open in browser:"
echo -e "     ${BLUE}http://localhost:5173${NC}"
echo ""
echo "  3. Import a template:"
echo "     - Go to Templates → Organizations"
echo "     - Try 'Small Startup Team' to get started"
echo ""
echo "  4. Create your first agent:"
echo "     - Go to Templates → Agents"
echo "     - Choose a template (dave, golang-engineer, etc.)"
echo "     - Customize and import"
echo ""
echo "  5. Check the docs:"
echo "     - README.md - Getting started"
echo "     - SYSTEM/docs/WORKFLOWS.md - Creating workflows"
echo "     - SYSTEM/docs/TESTING_GUIDE.md - Running tests"
echo ""

if [ ${#MISSING_KEYS[@]} -gt 0 ]; then
    print_warning "Remember to configure API keys for agent functionality"
    echo "  See: SYSTEM/docs/KNOWN_ISSUES.md"
    echo ""
fi

print_info "Useful commands:"
echo "  ./SYSTEM/stop.sh   - Stop dashboard"
echo "  ./SYSTEM/status.sh - Check status"
echo "  ./SYSTEM/test.sh   - Run tests"

echo ""
echo -e "${BLUE}🦞 Happy agent orchestration!${NC}"
echo ""
