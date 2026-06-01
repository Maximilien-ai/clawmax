#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERFILE="$ROOT_DIR/Dockerfile"

assert_contains() {
  needle="$1"
  if ! grep -F "$needle" "$DOCKERFILE" >/dev/null 2>&1; then
    echo "Expected Dockerfile to contain: $needle" >&2
    exit 1
  fi
}

assert_contains "RUN npm install -g pnpm"
assert_contains "ARG OPENCLAW_GIT_REF=v2026.5.26"
assert_contains "if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --ignore-scripts;"
assert_contains "elif [ -f package-lock.json ]; then npm ci --legacy-peer-deps --ignore-scripts;"
assert_contains "RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi"
assert_contains "RUN if [ -f package-lock.json ]; then npm ci --omit=dev --legacy-peer-deps; else npm install --omit=dev --legacy-peer-deps; fi"

echo "dockerfile openclaw builder tests passed"
