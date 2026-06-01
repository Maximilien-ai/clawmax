#!/bin/bash
# ClawMax Doctor — Full platform health check
#
# Usage:
#   ./SYSTEM/doctor.sh           - Run all checks
#   ./SYSTEM/doctor.sh --fix     - Auto-fix what can be fixed

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/openclaw-cli.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
FIXED=0
FIX_MODE=false

if [ "$1" = "--fix" ]; then
  FIX_MODE=true
fi

pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARN=$((WARN + 1)); }
fix()  { echo -e "  ${CYAN}⟳${NC} $1"; FIXED=$((FIXED + 1)); }
info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

get_env_value() {
  local key="$1"
  local file="$2"
  [ -f "$file" ] || return 1
  grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^"//; s/"$//' | tr -d '\r'
}

probe_gateway() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 3 \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: Y2xhd21heC1kb2N0b3ItcHJvYmU=" \
    "http://127.0.0.1:18789/" 2>/dev/null || echo "000")

  case "$code" in
    101|400|401|404|426)
      pass "Gateway probe responded (HTTP $code)"
      ;;
    000)
      warn "Gateway probe failed (no HTTP response)"
      info "Check: ${OPENCLAW_BIN:-openclaw} gateway status --deep"
      ;;
    *)
      warn "Gateway probe returned unexpected HTTP $code"
      info "Check: ${OPENCLAW_BIN:-openclaw} gateway status --deep"
      ;;
  esac
}

test_provider_key() {
  local provider="$1"
  local key="$2"
  local code=""
  [ -n "$key" ] || return 1

  if ! command -v curl >/dev/null 2>&1; then
    warn "$provider key present, but curl is not installed so live API test was skipped"
    return 0
  fi

  if [ "$provider" = "OpenAI" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 8 \
      -H "Authorization: Bearer $key" \
      https://api.openai.com/v1/models 2>/dev/null || echo "000")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 8 \
      -H "x-api-key: $key" \
      -H "anthropic-version: 2023-06-01" \
      https://api.anthropic.com/v1/models 2>/dev/null || echo "000")
  fi

  case "$code" in
    200)
      pass "$provider API key test succeeded"
      ;;
    401|403)
      fail "$provider API key rejected (HTTP $code)"
      ;;
    429)
      warn "$provider API key reached rate limit during test (HTTP 429)"
      ;;
    000)
      warn "$provider API key test could not reach provider API"
      ;;
    *)
      warn "$provider API key test returned HTTP $code"
      ;;
  esac
}

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  ClawMax Doctor${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Must be in ClawMax directory
if [ ! -d "SYSTEM/dashboard" ]; then
  fail "Not in a ClawMax directory. Run from the clawmax repo root."
  exit 1
fi
CLAWMAX_DIR="$(pwd)"

# ── 1. Node.js ──────────────────────────────────────────────────────
echo -e "${BOLD}1. Node.js${NC}"
if command -v node &> /dev/null; then
  NODE_VER=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    pass "Node.js $NODE_VER"
  else
    fail "Node.js $NODE_VER (need 18+)"
  fi
else
  fail "Node.js not installed"
fi
echo ""

# ── 2. OpenClaw CLI ─────────────────────────────────────────────────
echo -e "${BOLD}2. OpenClaw CLI${NC}"
if openclaw_cli_available; then
  OC_PATH="$(resolve_openclaw_cli)"
  OC_VER=$(openclaw_cli_run --version 2>&1 | head -1 | grep -o '[0-9]\{4\}\.[0-9]*\.[0-9]*' || echo "unknown")
  pass "OpenClaw CLI: $OC_VER ($OC_PATH)"
else
  fail "OpenClaw CLI not installed"
  info "Fix: npm install -g openclaw"
  if [ "$FIX_MODE" = true ]; then
    npm install -g openclaw 2>/dev/null && fix "Installed openclaw CLI" || fail "Auto-install failed"
  fi
fi

# OpenClaw config
OC_CONFIG="$HOME/.openclaw/openclaw.json"
if [ -f "$OC_CONFIG" ]; then
  # Check for known bad keys
  if grep -q '"version"' "$OC_CONFIG" 2>/dev/null; then
    if cat "$OC_CONFIG" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'version' not in d.get('meta',{}) else 1)" 2>/dev/null; then
      pass "OpenClaw config valid"
    else
      warn "OpenClaw config has unrecognized 'version' key in meta"
      info "Fix: ${OPENCLAW_BIN:-openclaw} doctor --fix"
      if [ "$FIX_MODE" = true ] && openclaw_cli_available; then
        echo "y" | openclaw_cli_run doctor --fix 2>/dev/null && fix "Ran openclaw doctor --fix" || true
      fi
    fi
  else
    pass "OpenClaw config valid"
  fi
else
  warn "OpenClaw config not found ($OC_CONFIG)"
  if [ "$FIX_MODE" = true ]; then
    mkdir -p "$HOME/.openclaw"
    echo '{"agents":{}}' > "$OC_CONFIG"
    fix "Created minimal openclaw config"
  fi
fi
echo ""

# ── 3. Gateway ──────────────────────────────────────────────────────
echo -e "${BOLD}3. Gateway${NC}"
if openclaw_cli_available; then
  # Check gateway mode
  GW_MODE=$(openclaw_cli_run config get gateway.mode 2>/dev/null || echo "")
  if [ -n "$GW_MODE" ] && [ "$GW_MODE" != "unset" ] && [ "$GW_MODE" != "undefined" ]; then
    pass "Gateway mode: $GW_MODE"
  else
    fail "Gateway mode not configured"
    info "Fix: ${OPENCLAW_BIN:-openclaw} config set gateway.mode local"
    if [ "$FIX_MODE" = true ]; then
      openclaw_cli_run config set gateway.mode local 2>/dev/null && fix "Set gateway.mode=local" || true
    fi
  fi

  # Check gateway auth token
  GW_TOKEN=$(openclaw_cli_run config get gateway.auth.token 2>/dev/null || echo "")
  if [ -n "$GW_TOKEN" ] && [ "$GW_TOKEN" != "unset" ] && [ "$GW_TOKEN" != "undefined" ]; then
    pass "Gateway auth token configured"
  else
    fail "Gateway auth token missing"
    if [ "$FIX_MODE" = true ]; then
      GW_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
      openclaw_cli_run config set gateway.auth.token "$GW_TOKEN" 2>/dev/null && fix "Generated gateway token" || true
    fi
  fi

  # Check gateway port
  if lsof -ti:18789 > /dev/null 2>&1; then
    pass "Gateway running on port 18789"
    probe_gateway
  else
    fail "Gateway not running (port 18789 free)"
    info "Fix: ${OPENCLAW_BIN:-openclaw} gateway restart"
    if [ "$FIX_MODE" = true ]; then
      openclaw_cli_run gateway install 2>/dev/null || true
      openclaw_cli_run gateway restart 2>/dev/null &
      sleep 5
      if lsof -ti:18789 > /dev/null 2>&1; then
        fix "Gateway started"
      else
        fail "Gateway failed to start — check: ${OPENCLAW_BIN:-openclaw} gateway status --deep"
      fi
    fi
  fi
else
  fail "Gateway requires OpenClaw CLI"
fi
echo ""

# ── 4. Dashboard ────────────────────────────────────────────────────
echo -e "${BOLD}4. Dashboard${NC}"
BACKEND_PORT="${DASHBOARD_PORT:-3001}"
FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"

# .env file
ENV_FILE="$CLAWMAX_DIR/SYSTEM/dashboard/.env"
if [ -f "$ENV_FILE" ]; then
  pass ".env exists"

  # Check auth config
  if grep -q "BYPASS_OAUTH=true\|DASHBOARD_AUTH_DISABLED=true" "$ENV_FILE" 2>/dev/null; then
    pass "Auth: dev mode (no login required)"
  elif grep -q "GITHUB_CLIENT_ID" "$ENV_FILE" 2>/dev/null; then
    GH_ID=$(grep GITHUB_CLIENT_ID "$ENV_FILE" | cut -d= -f2)
    if [ -n "$GH_ID" ] && [ "$GH_ID" != "your-github-client-id" ]; then
      pass "Auth: GitHub OAuth configured"
    else
      warn "Auth: GITHUB_CLIENT_ID is placeholder"
    fi
  else
    warn "Auth: no auth method configured"
  fi
else
  fail ".env not found"
  info "Fix: ./setup.sh"
fi

# Dependencies
if [ -d "$CLAWMAX_DIR/SYSTEM/dashboard/node_modules" ]; then
  pass "Dependencies installed"
else
  fail "Dependencies not installed (node_modules missing)"
  info "Fix: cd SYSTEM/dashboard && npm install"
  if [ "$FIX_MODE" = true ]; then
    cd "$CLAWMAX_DIR/SYSTEM/dashboard" && npm install --no-audit --no-fund 2>&1 | tail -1 && fix "Dependencies installed" || true
    cd "$CLAWMAX_DIR"
  fi
fi

# Backend running
if lsof -ti:"$BACKEND_PORT" > /dev/null 2>&1; then
  pass "Backend running on port $BACKEND_PORT"

  # Health check
  HEALTH=$(curl -s "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)
  if echo "$HEALTH" | grep -q '"ok":true' 2>/dev/null; then
    pass "Health endpoint OK"
  else
    warn "Health endpoint not responding"
  fi
else
  warn "Backend not running (port $BACKEND_PORT free)"
  info "Start: ./SYSTEM/start.sh"
fi

# Frontend running
if lsof -ti:"$FRONTEND_PORT" > /dev/null 2>&1; then
  pass "Frontend running on port $FRONTEND_PORT"
else
  warn "Frontend not running (port $FRONTEND_PORT free)"
fi
echo ""

# ── 5. API Keys ─────────────────────────────────────────────────────
echo -e "${BOLD}5. API Keys${NC}"
if [ -f "$ENV_FILE" ]; then
  HAS_OPENAI=false
  HAS_ANTHROPIC=false
  OPENAI_KEY="$(get_env_value SYSTEM_OPENAI_API_KEY "$ENV_FILE")"
  [ -z "$OPENAI_KEY" ] && OPENAI_KEY="$(get_env_value OPENAI_API_KEY "$ENV_FILE")"
  [ -z "$OPENAI_KEY" ] && OPENAI_KEY="$(get_env_value USER_OPENAI_API_KEY "$ENV_FILE")"
  ANTHROPIC_KEY="$(get_env_value SYSTEM_ANTHROPIC_API_KEY "$ENV_FILE")"
  [ -z "$ANTHROPIC_KEY" ] && ANTHROPIC_KEY="$(get_env_value ANTHROPIC_API_KEY "$ENV_FILE")"
  [ -z "$ANTHROPIC_KEY" ] && ANTHROPIC_KEY="$(get_env_value USER_ANTHROPIC_API_KEY "$ENV_FILE")"

  if [ -n "$OPENAI_KEY" ]; then
    HAS_OPENAI=true
    pass "OpenAI key configured"
    test_provider_key "OpenAI" "$OPENAI_KEY"
  fi
  if [ -n "$ANTHROPIC_KEY" ]; then
    HAS_ANTHROPIC=true
    pass "Anthropic key configured"
    test_provider_key "Anthropic" "$ANTHROPIC_KEY"
  fi

  if [ "$HAS_OPENAI" = false ] && [ "$HAS_ANTHROPIC" = false ]; then
    warn "No system API keys in .env — BYOK keys from browser required"
    info "Users must configure keys via the BYOK wizard in the dashboard"
  fi
else
  warn "Cannot check API keys (.env missing)"
fi
echo ""

# ── 6. Workspace ────────────────────────────────────────────────────
echo -e "${BOLD}6. Workspace${NC}"
WS_PATH="${OPENCLAW_WORKSPACE:-$CLAWMAX_DIR/WORKSPACES/default}"
if [ -d "$WS_PATH" ]; then
  pass "Workspace: $WS_PATH"
  [ -d "$WS_PATH/AGENTS" ] && pass "AGENTS/ exists" || warn "AGENTS/ missing"
  [ -d "$WS_PATH/ORG" ] && pass "ORG/ exists" || warn "ORG/ missing"

  # Count agents
  AGENT_COUNT=$(ls -d "$WS_PATH/AGENTS"/*/ 2>/dev/null | wc -l | tr -d ' ')
  if [ "$AGENT_COUNT" -gt 0 ]; then
    pass "$AGENT_COUNT agent(s) in workspace"
  else
    info "No agents yet — deploy a template or create one"
  fi
else
  fail "Workspace not found: $WS_PATH"
fi
echo ""

# ── 7. GitHub CLI ───────────────────────────────────────────────────
echo -e "${BOLD}7. GitHub CLI${NC}"
if command -v gh &> /dev/null; then
  pass "GitHub CLI installed: $(gh --version 2>&1 | head -1)"
  if gh auth status 2>&1 | grep -q "Logged in"; then
    GH_USER=$(gh auth status 2>&1 | grep -o "account [^ ]*" | head -1 | cut -d' ' -f2)
    pass "GitHub authenticated: $GH_USER"
    # Check scopes
    GH_SCOPES=$(gh auth status 2>&1 | grep "Token scopes" | sed "s/.*Token scopes: '//;s/'//g")
    if echo "$GH_SCOPES" | grep -q "repo"; then
      pass "GitHub scopes include 'repo'"
    else
      warn "GitHub token missing 'repo' scope — agents can't create issues/PRs"
    fi
  else
    warn "GitHub CLI not authenticated"
    info "Fix: gh auth login"
  fi
else
  warn "GitHub CLI not installed — agents can't use gh-issues skill"
  info "Fix: brew install gh && gh auth login"
fi
echo ""

# ── 8. Agents Registration ─────────────────────────────────────────
echo -e "${BOLD}8. Agent Registration${NC}"
if openclaw_cli_available && [ -f "$OC_CONFIG" ]; then
  REGISTERED=$(cat "$OC_CONFIG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('agents',{}).get('list',[])))" 2>/dev/null || echo "0")
  pass "$REGISTERED agent(s) registered in openclaw"

  # Check for unregistered workspace agents
  if [ -d "$WS_PATH/AGENTS" ]; then
    UNREGISTERED=0
    for agent_dir in "$WS_PATH/AGENTS"/*/; do
      [ ! -d "$agent_dir" ] && continue
      AGENT_NAME=$(basename "$agent_dir")
      [ "$AGENT_NAME" = "archive" ] && continue
      if ! grep -q "\"$AGENT_NAME\"" "$OC_CONFIG" 2>/dev/null; then
        UNREGISTERED=$((UNREGISTERED + 1))
        warn "Agent '$AGENT_NAME' not registered with openclaw CLI"
        if [ "$FIX_MODE" = true ]; then
          WS_ARG="$WS_PATH/AGENTS/$AGENT_NAME"
          AD_ARG="$HOME/.openclaw/agents/$AGENT_NAME/agent"
          mkdir -p "$AD_ARG"
          openclaw_cli_run agents add "$AGENT_NAME" --workspace "$WS_ARG" --agent-dir "$AD_ARG" --non-interactive 2>/dev/null && fix "Registered $AGENT_NAME" || true
        fi
      fi
    done
    if [ "$UNREGISTERED" -eq 0 ]; then
      pass "All workspace agents registered"
    fi
  fi
else
  info "Cannot check agent registration (openclaw CLI or config missing)"
fi
echo ""

# ── Summary ─────────────────────────────────────────────────────────
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
TOTAL=$((PASS + FAIL + WARN))
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}All checks passed!${NC}  ✓ $PASS passed, ⚠ $WARN warnings"
  if [ "$FIXED" -gt 0 ]; then
    echo -e "  ${CYAN}⟳ $FIXED issue(s) auto-fixed${NC}"
  fi
else
  echo -e "  ${RED}${BOLD}$FAIL issue(s) found${NC}  ✓ $PASS passed, ✗ $FAIL failed, ⚠ $WARN warnings"
  if [ "$FIXED" -gt 0 ]; then
    echo -e "  ${CYAN}⟳ $FIXED issue(s) auto-fixed${NC}"
  fi
  echo ""
  echo -e "  Run ${BOLD}./SYSTEM/doctor.sh --fix${NC} to auto-fix what can be fixed"
  echo -e "  Run ${BOLD}./setup.sh${NC} for full reconfiguration"
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
