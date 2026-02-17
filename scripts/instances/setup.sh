#!/usr/bin/env bash
# setup.sh — Automate standing up a new OpenClaw instance (max1, max2, …)
#
# Usage:
#   ./scripts/instances/setup.sh <name> [options]
#
# Examples:
#   ./scripts/instances/setup.sh max1 --whatsapp +14085551234
#   ./scripts/instances/setup.sh max1 --whatsapp +14085551234 --allow-from +14089604761
#   ./scripts/instances/setup.sh max1 --telegram BOT_TOKEN_HERE
#   ./scripts/instances/setup.sh max1                          # configure channels later
#   ./scripts/instances/setup.sh max1 --profile               # same machine, isolated profile
#   ./scripts/instances/setup.sh max1 --port 18889 --model openai/gpt-4o --whatsapp +14085551234
#
# Options:
#   --whatsapp <number>     WhatsApp number for this instance (E.164, e.g. +14155551234)
#   --allow-from <number>   Your number that can message this instance (default: +14089604761)
#   --telegram <token>      Telegram bot token (from @BotFather)
#   --port <port>           Gateway port (default: auto-detect free port >= 18789)
#   --model <model>         AI model (default: openai/gpt-4o)
#   --profile               Same-machine mode: isolate state under ~/.openclaw-<name>
#   --openclaw-dir <dir>    Path to openclaw clone (default: auto-detect)
#   --no-gateway            Skip gateway install (manual start later)
#   --no-desktop            Skip ~/Desktop/<name> shortcut
#   --no-aliases            Skip shell alias setup
#   --dry-run               Print what would be done, make no changes
#   -h, --help              Show this help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
TMPL_DIR="$SCRIPT_DIR/templates"

# shellcheck source=lib/colors.sh
source "$LIB_DIR/colors.sh"
# shellcheck source=lib/detect.sh
source "$LIB_DIR/detect.sh"
# shellcheck source=lib/install.sh
source "$LIB_DIR/install.sh"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
INSTANCE_NAME=""
WA_PHONE=""           # WhatsApp number for this instance (digits only, no +)
ALLOW_FROM="+14089604761"  # Your personal number that can message the bot
TG_TOKEN=""
GATEWAY_PORT=""       # auto-detected if empty
MODEL="openai/gpt-4o"
PROFILE_MODE=0        # 0=separate machine, 1=same machine with --profile
OPENCLAW_DIR_OVERRIDE=""
SETUP_GATEWAY=1
SETUP_DESKTOP=1
SETUP_ALIASES=1
DRY_RUN=0

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  sed -n '/^# Usage:/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
  exit 0
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
parse_args() {
  if [ $# -eq 0 ]; then usage; fi
  # Handle --help/-h before consuming the first positional arg
  for arg in "$@"; do
    case "$arg" in -h|--help) usage ;; esac
  done

  INSTANCE_NAME="$1"; shift

  while [ $# -gt 0 ]; do
    case "$1" in
      --whatsapp)       WA_PHONE=$(echo "${2:-}" | tr -d '+- ()'); shift 2 ;;
      --allow-from)     ALLOW_FROM="${2:-}"; shift 2 ;;
      --telegram)       TG_TOKEN="${2:-}"; shift 2 ;;
      --port)           GATEWAY_PORT="${2:-}"; shift 2 ;;
      --model)          MODEL="${2:-}"; shift 2 ;;
      --profile)        PROFILE_MODE=1; shift ;;
      --openclaw-dir)   OPENCLAW_DIR_OVERRIDE="${2:-}"; shift 2 ;;
      --no-gateway)     SETUP_GATEWAY=0; shift ;;
      --no-desktop)     SETUP_DESKTOP=0; shift ;;
      --no-aliases)     SETUP_ALIASES=0; shift ;;
      --dry-run)        DRY_RUN=1; shift ;;
      -h|--help)        usage ;;
      *) die "Unknown option: $1  (run with --help)" ;;
    esac
  done

  # Validate instance name
  if ! echo "$INSTANCE_NAME" | grep -qE '^[a-z][a-z0-9_-]*$'; then
    die "Instance name must start with a letter and contain only [a-z0-9_-]: $INSTANCE_NAME"
  fi
}

# ---------------------------------------------------------------------------
# Dry-run wrapper
# ---------------------------------------------------------------------------
run() {
  if [ "$DRY_RUN" = "1" ]; then
    info "[dry-run] $*"
  else
    "$@"
  fi
}

run_eval() {
  if [ "$DRY_RUN" = "1" ]; then
    info "[dry-run] eval: $*"
  else
    eval "$@"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"

  # Run dependency check/install before printing the banner
  # (skip in dry-run so we don't prompt for installs that won't happen)
  if [ "$DRY_RUN" = "0" ]; then
    check_and_install_deps
  else
    step "0  Dependency check"
    info "[dry-run] Skipping dependency installation"
  fi

  printf "\n${BOLD}OpenClaw Instance Setup${RESET}\n"
  printf "Instance : ${CYAN}%s${RESET}\n" "$INSTANCE_NAME"
  printf "Profile  : %s\n" "$([ "$PROFILE_MODE" = "1" ] && echo "same-machine (--profile)" || echo "separate machine")"
  printf "Model    : %s\n" "$MODEL"
  [ -n "$WA_PHONE" ] && printf "WhatsApp : +%s\n" "$WA_PHONE"
  [ -n "$TG_TOKEN" ] && printf "Telegram : (token provided)\n"
  [ "$DRY_RUN" = "1" ] && warn "DRY RUN — no changes will be made"
  echo ""

  # -------------------------------------------------------------------
  step "1/7  Checking prerequisites"
  # -------------------------------------------------------------------
  local node_ver
  node_ver=$(detect_node_version)
  ok "Node.js v$node_ver"

  local oc_dir="${OPENCLAW_DIR_OVERRIDE:-$(detect_openclaw_dir)}"
  if [ -z "$oc_dir" ]; then
    warn "Could not auto-detect openclaw clone directory."
    warn "Set OPENCLAW_DIR or pass --openclaw-dir /path/to/openclaw"
    oc_dir=""
  else
    ok "OpenClaw dir: $oc_dir"
  fi

  local oc_bin
  oc_bin=$(detect_openclaw_bin)
  ok "openclaw CLI: $oc_bin"

  # -------------------------------------------------------------------
  step "2/7  Resolving state directory and port"
  # -------------------------------------------------------------------
  local state_dir
  state_dir=$(openclaw_state_dir "$INSTANCE_NAME" "$PROFILE_MODE")
  ok "State dir: $state_dir"

  if [ -z "$GATEWAY_PORT" ]; then
    # On same machine, shift port by 100 per instance number (crude but effective)
    local start_port=18789
    if [ "$PROFILE_MODE" = "1" ]; then
      # Extract trailing number from name (max1→1, max2→2, etc.)
      local n; n=$(echo "$INSTANCE_NAME" | tr -dc '0-9' | head -c3)
      [ -n "$n" ] && start_port=$((18789 + n * 100))
    fi
    GATEWAY_PORT=$(find_free_port "$start_port")
  fi
  ok "Gateway port: $GATEWAY_PORT"

  # -------------------------------------------------------------------
  step "3/7  Generating config"
  # -------------------------------------------------------------------
  local config_path="$state_dir/openclaw.json"
  local gateway_token
  gateway_token=$(openssl rand -hex 24 2>/dev/null || node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")

  local whatsapp_enabled="false"
  [ -n "$WA_PHONE" ] && whatsapp_enabled="true"
  [ -n "$TG_TOKEN" ] && whatsapp_enabled="false"

  if [ "$DRY_RUN" = "0" ]; then
    mkdir -p "$state_dir"
    sed \
      -e "s|{{INSTANCE_NAME}}|$INSTANCE_NAME|g" \
      -e "s|{{STATE_DIR}}|$state_dir|g" \
      -e "s|{{GATEWAY_PORT}}|$GATEWAY_PORT|g" \
      -e "s|{{GATEWAY_TOKEN}}|$gateway_token|g" \
      -e "s|{{ALLOW_FROM}}|$ALLOW_FROM|g" \
      -e "s|{{MODEL}}|$MODEL|g" \
      -e "s|{{WHATSAPP_ENABLED}}|$whatsapp_enabled|g" \
      -e "s|{{CREATED_AT}}|$(date -u +%Y-%m-%dT%H:%M:%SZ)|g" \
      "$TMPL_DIR/openclaw.json.tmpl" > "$config_path"
    ok "Config written: $config_path"

    # Add Telegram config if token provided
    if [ -n "$TG_TOKEN" ]; then
      # Use node to inject telegram config (avoids jq dependency)
      node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$config_path', 'utf8'));
        cfg.channels = cfg.channels || {};
        cfg.channels.telegram = { token: '$TG_TOKEN', dmPolicy: 'allowlist', allowFrom: ['$ALLOW_FROM'] };
        delete cfg.plugins?.entries?.whatsapp;
        fs.writeFileSync('$config_path', JSON.stringify(cfg, null, 2) + '\n');
      "
      ok "Telegram channel configured"
    fi
  else
    info "[dry-run] Would write config to $config_path"
  fi

  # -------------------------------------------------------------------
  step "4/7  WhatsApp pairing"
  # -------------------------------------------------------------------
  if [ -n "$WA_PHONE" ]; then
    local baileys_path boom_path
    baileys_path=$(detect_baileys_path "$oc_dir")
    boom_path=$(detect_boom_path "$oc_dir")

    if [ -z "$baileys_path" ] || [ -z "$boom_path" ]; then
      warn "Could not find Baileys/Boom libraries. Skipping automatic WhatsApp pairing."
      warn "After setup, run manually:"
      warn "  node $LIB_DIR/whatsapp-pair.mjs $WA_PHONE $state_dir/credentials/whatsapp/default <baileys_path> <boom_path>"
    else
      ok "Baileys: $baileys_path"
      ok "Boom:    $boom_path"

      local creds_dir="$state_dir/credentials/whatsapp/default"

      if [ "$DRY_RUN" = "0" ]; then
        mkdir -p "$creds_dir"

        # Check for existing credentials
        if [ -f "$creds_dir/creds.json" ]; then
          if confirm "Existing WhatsApp credentials found. Re-pair? (this will replace them)"; then
            rm -f "$creds_dir/creds.json"
          else
            ok "Keeping existing credentials — skipping pairing"
          fi
        fi

        if [ ! -f "$creds_dir/creds.json" ]; then
          info "Starting WhatsApp pairing for +$WA_PHONE …"
          if node "$LIB_DIR/whatsapp-pair.mjs" "$WA_PHONE" "$creds_dir" "$baileys_path" "$boom_path"; then
            ok "WhatsApp linked!"
          else
            warn "WhatsApp pairing did not complete. You can retry later with:"
            warn "  node $LIB_DIR/whatsapp-pair.mjs $WA_PHONE $creds_dir $baileys_path $boom_path"
          fi
        fi
      else
        info "[dry-run] Would run WhatsApp pairing for +$WA_PHONE"
      fi
    fi
  else
    info "Skipping WhatsApp pairing (no --whatsapp number given)"
    info "Add later: openclaw$([ "$PROFILE_MODE" = "1" ] && echo " --profile $INSTANCE_NAME") channels login --channel whatsapp"
  fi

  # -------------------------------------------------------------------
  step "5/7  Installing gateway service"
  # -------------------------------------------------------------------
  if [ "$SETUP_GATEWAY" = "1" ]; then
    if [ "$DRY_RUN" = "0" ]; then
      local profile_flag=""
      [ "$PROFILE_MODE" = "1" ] && profile_flag="--profile $INSTANCE_NAME"

      # Stop any running gateway for this instance
      $oc_bin $profile_flag gateway stop 2>/dev/null || true

      # Install as LaunchAgent / systemd
      OPENCLAW_CONFIG_PATH="$config_path" $oc_bin $profile_flag gateway install \
        --port "$GATEWAY_PORT" 2>&1 | grep -v '^$' || true

      ok "Gateway service installed (port $GATEWAY_PORT)"
    else
      info "[dry-run] Would install gateway service on port $GATEWAY_PORT"
    fi
  else
    info "Skipping gateway install (--no-gateway)"
    info "Start manually: openclaw$([ "$PROFILE_MODE" = "1" ] && echo " --profile $INSTANCE_NAME") gateway install --port $GATEWAY_PORT"
  fi

  # -------------------------------------------------------------------
  step "6/7  Desktop shortcut"
  # -------------------------------------------------------------------
  if [ "$SETUP_DESKTOP" = "1" ]; then
    local desktop="$HOME/Desktop/$INSTANCE_NAME"
    local workspace="$state_dir/workspace"
    if [ "$DRY_RUN" = "0" ]; then
      mkdir -p "$workspace"
      ln -sf "$workspace" "$desktop"
      ok "Desktop shortcut: $desktop → $workspace"
    else
      info "[dry-run] Would create: $desktop → $workspace"
    fi
  fi

  # -------------------------------------------------------------------
  step "7/7  Shell aliases"
  # -------------------------------------------------------------------
  if [ "$SETUP_ALIASES" = "1" ]; then
    local shell_rc="$HOME/.zshrc"
    [ ! -f "$shell_rc" ] && shell_rc="$HOME/.bashrc"

    local profile_flag=""
    [ "$PROFILE_MODE" = "1" ] && profile_flag=" --profile $INSTANCE_NAME"

    local alias_block
    alias_block=$(cat <<ALIASES

# OpenClaw — $INSTANCE_NAME
alias ${INSTANCE_NAME}logs='tail -f /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log | node -e "const rl=require(\"readline\").createInterface({input:process.stdin});rl.on(\"line\",l=>{try{const o=JSON.parse(l);const msg=o[1]||o[0];if(msg&&typeof msg===\"string\")console.log(new Date().toLocaleTimeString(),o._meta?.logLevelName,\"|\",msg.substring(0,120));}catch{}});"'
alias ${INSTANCE_NAME}status='openclaw${profile_flag} gateway status'
alias ${INSTANCE_NAME}stop='openclaw${profile_flag} gateway stop'
alias ${INSTANCE_NAME}start='openclaw${profile_flag} gateway install'
ALIASES
)

    if [ "$DRY_RUN" = "0" ]; then
      # Avoid duplicate blocks
      if ! grep -q "# OpenClaw — $INSTANCE_NAME" "$shell_rc" 2>/dev/null; then
        printf '%s\n' "$alias_block" >> "$shell_rc"
        ok "Aliases added to $shell_rc"
        info "Run: source $shell_rc  (or open a new terminal)"
      else
        info "Aliases already exist in $shell_rc — skipping"
      fi
    else
      info "[dry-run] Would append aliases to $shell_rc:"
      echo "$alias_block"
    fi
  fi

  # -------------------------------------------------------------------
  printf "\n${GREEN}${BOLD}Done! ${INSTANCE_NAME} is ready.${RESET}\n\n"

  if [ "$DRY_RUN" = "0" ]; then
    printf "  State dir : %s\n" "$state_dir"
    printf "  Workspace : %s\n" "$state_dir/workspace"
    printf "  Config    : %s\n" "$config_path"
    printf "  Gateway   : ws://127.0.0.1:%s\n" "$GATEWAY_PORT"
    printf "  Desktop   : ~/Desktop/%s\n" "$INSTANCE_NAME"
    [ -n "$WA_PHONE" ] && printf "  WhatsApp  : +%s\n" "$WA_PHONE"
    [ -n "$TG_TOKEN" ] && printf "  Telegram  : configured\n"
    printf "\n"
    printf "  Check status : ${INSTANCE_NAME}status\n"
    printf "  View logs    : ${INSTANCE_NAME}logs\n"
    printf "  Stop         : ${INSTANCE_NAME}stop\n"

    if [ "$SETUP_ALIASES" = "1" ]; then
      printf "\n${YELLOW}Remember to:${RESET} source ~/.zshrc  (or open a new terminal)\n"
    fi

    if [ -n "$WA_PHONE" ] && [ "$SETUP_GATEWAY" = "1" ]; then
      printf "\n${CYAN}Next step:${RESET} Install the Chrome extension for browser relay:\n"
      printf "  openclaw$([ "$PROFILE_MODE" = "1" ] && echo " --profile $INSTANCE_NAME") browser extension install\n"
    fi
  fi
  echo ""
}

main "$@"
