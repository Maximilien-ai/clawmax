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
assert_contains "ARG TARGETARCH"
assert_contains "ARG QBO_VERSION=0.6.1"
assert_contains "ARG QBO_LINUX_AMD64_SHA256=ce7774c7c641b1c6fe356e2e522465fbf16d80bce0a87fd2c8027774e2a46f31"
assert_contains "ARG QBO_LINUX_ARM64_SHA256=150cdb50c2dacc8c990c3594b358dcd84f2336de31cad73de266bbdf32b3d4e0"
assert_contains 'qbo_archive="qbo-cli_${QBO_VERSION}_linux_${TARGETARCH}.tar.gz"'
assert_contains 'echo "${qbo_sha256}  /tmp/${qbo_archive}" | sha256sum -c -'
assert_contains "install -m 0755 /tmp/qbo-cli/qbo /usr/local/bin/qbo"
assert_contains "install -m 0644 /tmp/qbo-cli/LICENSE /usr/share/doc/qbo-cli/LICENSE"
assert_contains "qbo --json schema"
assert_contains "'.name == \"qbo\" and .version == \$expected'"
assert_contains "retry 3 5 npm ci --legacy-peer-deps;"
assert_contains "retry 3 5 npm ci --omit=dev --legacy-peer-deps;"
assert_contains "COPY SKILLS/custom/clawmax-resend ./SKILLS/custom/clawmax-resend"
assert_contains "COPY SKILLS/custom/clawmax-workspace-ls ./SKILLS/custom/clawmax-workspace-ls"
assert_contains "COPY SKILLS/custom/workspace-ls ./SKILLS/custom/workspace-ls"
assert_contains "COPY SKILLS/custom/clawmax-secret-test ./SKILLS/custom/clawmax-secret-test"
assert_contains "COPY SKILLS/custom/clawmax-mail ./SKILLS/custom/clawmax-mail"
assert_contains "COPY SYSTEM/dashboard/clawmax-resend-send /usr/local/bin/clawmax-resend-send"
assert_contains "COPY SYSTEM/dashboard/clawmax-skill-run /usr/local/bin/clawmax-skill-run"
assert_contains "COPY SYSTEM/dashboard/clawmax-mail-run /usr/local/bin/clawmax-mail-run"
assert_contains "COPY SYSTEM/dashboard/openclaw-auth-store.mjs ./SYSTEM/dashboard/openclaw-auth-store.mjs"
assert_contains "ARG CLAWMAX_ENABLED_PLUGINS="
assert_contains 'ENV CLAWMAX_ENABLED_PLUGINS=${CLAWMAX_ENABLED_PLUGINS}'

grep -Fq 'TEST_PLUGIN_IDS="plugin-evals,plugin-guardrails,plugin-resource-plans,clawmax-lifecycle,plugin-review-notes"' "$TEST_WRAPPER" \
  || { echo "Expected local test wrapper to enable synthetic plugins" >&2; exit 1; }
grep -Fq 'CLAWMAX_ENABLED_PLUGINS=clawmax-lifecycle,plugin-review-notes' "$TEST_IMAGE_WORKFLOW" \
  || { echo "Expected public test images to enable only public product plugins" >&2; exit 1; }

assert_not_contains() {
  needle="$1"
  if grep -F "$needle" "$DOCKERFILE" >/dev/null 2>&1; then
    echo "Expected Dockerfile to NOT contain: $needle" >&2
    exit 1
  fi
}

# Factory Droid must be genuinely pinned via a checksum-verified direct
# download keyed off FACTORY_DROID_VERSION, not the mutable curl|sh
# installer piped straight into the image (see Dockerfile comment).
assert_not_contains "curl -fsSL https://app.factory.ai/cli | sh"
assert_contains "ARG FACTORY_DROID_VERSION=0.158.0"
assert_contains 'droid_url="https://downloads.factory.ai/factory-cli/releases/${FACTORY_DROID_VERSION}/linux/${droid_arch}${droid_suffix}/droid"'
assert_contains "curl -fsSL -o /tmp/droid \"\$droid_url\""
assert_contains "curl -fsSL -o /tmp/droid.sha256 \"\${droid_url}.sha256\""
assert_contains 'actual_sha="$(sha256sum /tmp/droid | awk '"'"'{print $1}'"'"')"'
assert_contains '[ -n "$expected_sha" ] && [ "$actual_sha" = "$expected_sha" ]'
assert_contains 'droid" --version | grep -F "${FACTORY_DROID_VERSION}"'

echo "dockerfile openclaw builder tests passed"
