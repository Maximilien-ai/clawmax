#!/bin/bash

set -euo pipefail

OWNER="${CLAWMAX_GITHUB_OWNER:-Maximilien-ai}"
REPO="${CLAWMAX_GITHUB_REPO:-clawmax}"
DEFAULT_TARGET_DIR="${CLAWMAX_INSTALL_DIR:-clawmax}"

usage() {
  cat <<'EOF'
ClawMax bootstrap installer

Usage:
  ./install.sh [latest|vX.Y.Z] [--dir PATH] [--force] [setup.sh args...]

Examples:
  ./install.sh
  ./install.sh v1.5.6
  ./install.sh v1.5.6 --dir /opt/clawmax --non-interactive
EOF
}

print() { printf '%s\n' "$*"; }
print_info() { printf '\033[0;34mℹ\033[0m %s\n' "$*"; }
print_ok() { printf '\033[0;32m✓\033[0m %s\n' "$*"; }
print_warn() { printf '\033[1;33m⚠\033[0m %s\n' "$*"; }
print_error() { printf '\033[0;31m✗\033[0m %s\n' "$*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    print_error "Required command not found: $1"
    exit 1
  fi
}

resolve_latest_version() {
  curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${OWNER}/${REPO}/releases/latest" | awk -F/ '{print $NF}'
}

checksum_verify() {
  local checksum_file="$1"
  local asset_file="$2"

  if command -v shasum >/dev/null 2>&1; then
    (cd "$(dirname "$asset_file")" && shasum -a 256 -c "$(basename "$checksum_file")")
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "$asset_file")" && sha256sum -c "$(basename "$checksum_file")")
    return
  fi

  print_error "Neither shasum nor sha256sum is available for checksum verification"
  exit 1
}

VERSION=""
TARGET_DIR="$DEFAULT_TARGET_DIR"
FORCE_INSTALL=false
SETUP_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --dir)
      shift
      [ "$#" -gt 0 ] || { print_error "--dir requires a path"; exit 1; }
      TARGET_DIR="$1"
      ;;
    --force)
      FORCE_INSTALL=true
      ;;
    latest|v[0-9]*)
      if [ -z "$VERSION" ]; then
        VERSION="$1"
      else
        SETUP_ARGS+=("$1")
      fi
      ;;
    *)
      SETUP_ARGS+=("$1")
      ;;
  esac
  shift
done

require_cmd curl
require_cmd tar

if [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
  print_info "Resolving latest ClawMax release..."
  VERSION="$(resolve_latest_version)"
fi

case "$VERSION" in
  v[0-9]*)
    ;;
  *)
    print_error "Version must look like vX.Y.Z or 'latest' (got: $VERSION)"
    exit 1
    ;;
esac

ASSET_BASENAME="clawmax-${VERSION}.tar.gz"
CHECKSUM_BASENAME="clawmax-${VERSION}.sha256"
BASE_URL="https://github.com/${OWNER}/${REPO}/releases/download/${VERSION}"
ASSET_URL="${BASE_URL}/${ASSET_BASENAME}"
CHECKSUM_URL="${BASE_URL}/${CHECKSUM_BASENAME}"

TARGET_DIR_ABS="$(python3 - <<'PY' "$TARGET_DIR"
import os, sys
print(os.path.abspath(sys.argv[1]))
PY
)"
TARGET_PARENT="$(dirname "$TARGET_DIR_ABS")"
TARGET_NAME="$(basename "$TARGET_DIR_ABS")"

if [ -e "$TARGET_DIR_ABS" ] && [ "$FORCE_INSTALL" != true ]; then
  print_error "Target directory already exists: $TARGET_DIR_ABS"
  print_info "Use --force to replace it or choose --dir PATH"
  exit 1
fi

if [ -e "$TARGET_DIR_ABS" ] && [ "$FORCE_INSTALL" = true ]; then
  print_warn "Removing existing target directory: $TARGET_DIR_ABS"
  rm -rf "$TARGET_DIR_ABS"
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-install.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ARCHIVE_PATH="${TMP_DIR}/${ASSET_BASENAME}"
CHECKSUM_PATH="${TMP_DIR}/${CHECKSUM_BASENAME}"

print_info "Downloading ${VERSION} release bundle..."
curl -fsSL "$ASSET_URL" -o "$ARCHIVE_PATH"
curl -fsSL "$CHECKSUM_URL" -o "$CHECKSUM_PATH"
print_ok "Downloaded release assets"

print_info "Verifying checksum..."
checksum_verify "$CHECKSUM_PATH" "$ARCHIVE_PATH"
print_ok "Checksum verified"

mkdir -p "$TARGET_PARENT"
EXTRACT_DIR="${TMP_DIR}/extract"
mkdir -p "$EXTRACT_DIR"

print_info "Extracting ${ASSET_BASENAME}..."
tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR"
EXTRACTED_ROOT="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)"

if [ -z "$EXTRACTED_ROOT" ] || [ ! -f "$EXTRACTED_ROOT/setup.sh" ]; then
  print_error "Release bundle did not contain a valid ClawMax root with setup.sh"
  exit 1
fi

mv "$EXTRACTED_ROOT" "$TARGET_DIR_ABS"
print_ok "Installed release bundle to $TARGET_DIR_ABS"

print_info "Starting setup..."
cd "$TARGET_DIR_ABS"
exec ./setup.sh "${SETUP_ARGS[@]}"
