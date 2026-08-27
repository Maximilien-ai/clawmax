#!/usr/bin/env bash
# Installs the Claude Code and Factory Droid CLIs for CI so agent-runtime tests can exercise
# the real "is this CLI available?" check (server/lib/agent-runtime.ts: resolveRuntimeCliPath)
# instead of failing with "<runtime> CLI is not available in this runtime". Tests never need a
# real turn from these CLIs -- only presence on disk -- so no API key/auth is required here.
#
# Version pins mirror the Dockerfile's CLAUDE_CODE_VERSION / FACTORY_DROID_VERSION ARGs. Update
# both places together when bumping either CLI.

set -euo pipefail

CLAUDE_CODE_VERSION="${CLAUDE_CODE_VERSION:-2.1.205}"
FACTORY_DROID_VERSION="${FACTORY_DROID_VERSION:-0.158.0}"
FACTORY_DROID_AMD64_SHA256="${FACTORY_DROID_AMD64_SHA256:-f64a55bb6d314c8d925063ce741c97796208ef0facdd4b4f1881a358acb668d8}"
FACTORY_DROID_AMD64_BASELINE_SHA256="${FACTORY_DROID_AMD64_BASELINE_SHA256:-891325d02d7c013188ffc49b0c9654c539e1dd637f27f302bb41e5e888fb714f}"
FACTORY_DROID_ARM64_SHA256="${FACTORY_DROID_ARM64_SHA256:-fe9d06b4c0136add0619d964afb3dac2cc9b13ac6c0e448f11691d749203c584}"

echo "Installing Claude Code CLI ${CLAUDE_CODE_VERSION}..."
npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"
command -v claude >/dev/null 2>&1 || { echo "claude not found on PATH after install" >&2; exit 1; }

echo "Installing Factory Droid CLI ${FACTORY_DROID_VERSION}..."
droid_arch="$(uname -m)"
case "$droid_arch" in
  x86_64|amd64) droid_arch="x64"; droid_expected_sha="$FACTORY_DROID_AMD64_SHA256" ;;
  arm64|aarch64) droid_arch="arm64"; droid_expected_sha="$FACTORY_DROID_ARM64_SHA256" ;;
  *) echo "Unsupported architecture for droid: $droid_arch" >&2; exit 1 ;;
esac

droid_os="$(uname -s | tr '[:upper:]' '[:lower:]')"
droid_suffix=""
if [ "$droid_os" = "linux" ] && [ "$droid_arch" = "x64" ] && ! grep -qi avx2 /proc/cpuinfo 2>/dev/null; then
  droid_suffix="-baseline"
  droid_expected_sha="$FACTORY_DROID_AMD64_BASELINE_SHA256"
fi

droid_url="https://downloads.factory.ai/factory-cli/releases/${FACTORY_DROID_VERSION}/${droid_os}/${droid_arch}${droid_suffix}/droid"
command -v sha256sum >/dev/null 2>&1 \
  || { echo "sha256sum is required to verify the droid download" >&2; exit 1; }

tmp_droid="$(mktemp)"
curl -fsSL -o "$tmp_droid" "$droid_url"
actual_sha="$(sha256sum "$tmp_droid" | awk '{print $1}')"
[ -n "$droid_expected_sha" ] && [ "$actual_sha" = "$droid_expected_sha" ] \
  || { echo "droid checksum mismatch: expected '$droid_expected_sha', got '$actual_sha'" >&2; exit 1; }

mkdir -p "$HOME/.local/bin"
install -m 0755 "$tmp_droid" "$HOME/.local/bin/droid"
rm -f "$tmp_droid"
"$HOME/.local/bin/droid" --version | grep -F "${FACTORY_DROID_VERSION}" \
  || { echo "droid --version did not report pinned version ${FACTORY_DROID_VERSION}" >&2; exit 1; }

# resolveRuntimeCliPath falls back to ~/.local/bin/<bin> directly, so PATH is not required for
# droid to resolve -- but export it anyway so any direct `droid` invocation in later steps works.
echo "$HOME/.local/bin" >> "${GITHUB_PATH:-/dev/null}" 2>/dev/null || true

echo "claude: $(command -v claude)"
echo "droid:  $HOME/.local/bin/droid"
