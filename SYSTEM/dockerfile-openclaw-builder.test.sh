#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERFILE="$ROOT_DIR/Dockerfile"
VERSION_HELPER="$ROOT_DIR/SYSTEM/openclaw-version.sh"
TEST_WRAPPER="$ROOT_DIR/SYSTEM/test-with-server.sh"
TEST_IMAGE_WORKFLOW="$ROOT_DIR/.github/workflows/test-container-image.yml"

[ -f "$VERSION_HELPER" ] || {
  echo "Expected version helper to exist: $VERSION_HELPER" >&2
  exit 1
}

. "$VERSION_HELPER"

[ -n "${CLAWMAX_OPENCLAW_TARGET:-}" ] || {
  echo "Expected CLAWMAX_OPENCLAW_TARGET to be set by version helper" >&2
  exit 1
}

assert_contains() {
  needle="$1"
  if ! grep -F "$needle" "$DOCKERFILE" >/dev/null 2>&1; then
    echo "Expected Dockerfile to contain: $needle" >&2
    exit 1
  fi
}

assert_contains "RUN npm install -g pnpm"
assert_contains "ARG OPENCLAW_GIT_REF=$CLAWMAX_OPENCLAW_TARGET"
assert_contains "retry() { \\"
assert_contains "retry 3 5 pnpm install --frozen-lockfile --ignore-scripts;"
assert_contains "retry 3 5 npm ci --legacy-peer-deps --ignore-scripts;"
assert_contains "RUN npm run build:docker"
assert_contains "COPY SYSTEM/patch-openclaw-fs-safe.mjs /tmp/patch-openclaw-fs-safe.mjs"
assert_contains "RUN node /tmp/patch-openclaw-fs-safe.mjs /opt/openclaw-src"
assert_contains "RUN npm pack --ignore-scripts"
assert_contains "RUN node scripts/postinstall-bundled-plugins.mjs \\"
assert_contains "grep -q '\"qqbot\"' dist/cli-startup-metadata.json"
assert_contains "ARG BUILDPLATFORM"
assert_contains "ARG TARGETPLATFORM"
assert_contains "FROM --platform=\$BUILDPLATFORM node:22.19.0-bookworm-slim AS openclaw-builder"
assert_contains "FROM --platform=\$BUILDPLATFORM node:22.19.0-bookworm-slim AS builder"
assert_contains "FROM --platform=\$TARGETPLATFORM node:22.19.0-bookworm-slim AS runtime"
assert_contains "retry 3 5 npm ci --legacy-peer-deps;"
assert_contains "retry 3 5 npm ci --omit=dev --legacy-peer-deps;"
assert_contains "COPY SKILLS/custom/clawmax-resend ./SKILLS/custom/clawmax-resend"
assert_contains "COPY SKILLS/custom/clawmax-workspace-ls ./SKILLS/custom/clawmax-workspace-ls"
assert_contains "COPY SKILLS/custom/workspace-ls ./SKILLS/custom/workspace-ls"
assert_contains "COPY SKILLS/custom/clawmax-secret-test ./SKILLS/custom/clawmax-secret-test"
assert_contains "COPY SYSTEM/dashboard/clawmax-resend-send /usr/local/bin/clawmax-resend-send"
assert_contains "COPY SYSTEM/dashboard/clawmax-skill-run /usr/local/bin/clawmax-skill-run"
assert_contains "COPY SYSTEM/dashboard/openclaw-auth-store.mjs ./SYSTEM/dashboard/openclaw-auth-store.mjs"
assert_contains "ARG CLAWMAX_ENABLED_PLUGINS="
assert_contains 'ENV CLAWMAX_ENABLED_PLUGINS=${CLAWMAX_ENABLED_PLUGINS}'

grep -Fq 'TEST_PLUGIN_IDS="plugin-lab-guardrails,plugin-lab-evals,plugin-lab-review-notes"' "$TEST_WRAPPER" \
  || { echo "Expected local test wrapper to enable synthetic plugins" >&2; exit 1; }
grep -Fq 'CLAWMAX_ENABLED_PLUGINS=plugin-lab-guardrails,plugin-lab-evals,plugin-lab-review-notes' "$TEST_IMAGE_WORKFLOW" \
  || { echo "Expected test images to enable synthetic plugins" >&2; exit 1; }

echo "dockerfile openclaw builder tests passed"
