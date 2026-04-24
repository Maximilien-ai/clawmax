#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${CLEANROOM_PODMAN_IMAGE:-docker.io/node:22-bookworm}"
CONTAINER_NAME="${CLEANROOM_PODMAN_CONTAINER_NAME:-clawmax-cleanroom-setup-test}"
BACKEND_PORT="${CLEANROOM_DASHBOARD_PORT:-3001}"
FRONTEND_PORT="${CLEANROOM_DASHBOARD_CLIENT_PORT:-5173}"
FRONTEND_URL="${CLEANROOM_DASHBOARD_APP_URL:-http://localhost:${FRONTEND_PORT}}"
KEEP_CONTAINER="${KEEP_CONTAINER:-false}"
RUN_INTEGRATION="${RUN_INTEGRATION:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
pass() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

cleanup() {
  if [ "${KEEP_CONTAINER}" = "true" ]; then
    warn "Keeping container ${CONTAINER_NAME} for inspection"
    return
  fi
  podman rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

if ! command -v podman >/dev/null 2>&1; then
  fail "podman is required"
  exit 1
fi

if ! podman info >/dev/null 2>&1; then
  info "Starting podman machine..."
  podman machine start >/dev/null
fi

if ! podman info >/dev/null 2>&1; then
  fail "podman is not available after machine start"
  exit 1
fi

info "Preparing fresh clean-room container ${CONTAINER_NAME}"
podman rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

podman run -d \
  --name "${CONTAINER_NAME}" \
  -v "${ROOT_DIR}:/src:ro" \
  "${IMAGE}" \
  sleep infinity >/dev/null

info "Installing clean-room prerequisites in container"
podman exec "${CONTAINER_NAME}" bash -lc "
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    golang \
    jq \
    lsof \
    openssl \
    procps \
    python3 \
    make \
    g++
  rm -rf /var/lib/apt/lists/*
"

info "Copying repository into disposable workspace inside container"
podman exec "${CONTAINER_NAME}" bash -lc "
  rm -rf /tmp/clawmax-cleanroom /tmp/clawmax-home
  mkdir -p /tmp/clawmax-cleanroom /tmp/clawmax-home
  cp -a /src/. /tmp/clawmax-cleanroom
"

info "Installing OpenClaw CLI in the clean-room container"
podman exec "${CONTAINER_NAME}" bash -lc "
  rm -rf /tmp/openclaw
  git clone https://github.com/openclaw/openclaw.git /tmp/openclaw
  cd /tmp/openclaw
  git checkout v0.2.16 2>/dev/null || true
  go build -o /usr/local/bin/openclaw .
  openclaw --version >/dev/null
"

TEST_MODE_ARGS=""
if [ "${RUN_INTEGRATION}" = "true" ]; then
  TEST_MODE_ARGS="integration"
fi

info "Running setup.sh, start.sh, and SYSTEM/test.sh in clean-room container"
podman exec "${CONTAINER_NAME}" bash -lc "
  set -euo pipefail
  export HOME=/tmp/clawmax-home
  export CI=true
  export DASHBOARD_PORT=${BACKEND_PORT}
  export DASHBOARD_CLIENT_PORT=${FRONTEND_PORT}
  export DASHBOARD_APP_URL=${FRONTEND_URL}
  cd /tmp/clawmax-cleanroom

  ./setup.sh --non-interactive

  if [ ! -f SYSTEM/dashboard/.dashboard-token ]; then
    echo 'Expected SYSTEM/dashboard/.dashboard-token after setup' >&2
    exit 1
  fi

  bash -lc 'set -a; . ./SYSTEM/dashboard/.env; set +a' >/dev/null

  ./SYSTEM/start.sh --restart

  for i in \$(seq 1 60); do
    if curl -fsS http://127.0.0.1:${BACKEND_PORT}/api/health >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  curl -fsS http://127.0.0.1:${BACKEND_PORT}/api/health >/dev/null

  ./SYSTEM/test.sh ${TEST_MODE_ARGS}
"

pass "Clean-room Podman setup test passed"
