#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

. "$SCRIPT_DIR/openclaw-version.sh"

PREPARED_WORK_ROOT=""

usage() {
  cat <<'EOF'
Usage: ./SYSTEM/prepare-openclaw-target.sh [--print-bin|--print-skills-dir]

Build the branch-targeted OpenClaw checkout in an isolated cache directory and
create a branch-local wrapper binary suitable for OPENCLAW_BIN.
EOF
}

ensure_supported_node() {
  node <<'EOF'
const [majorRaw = "0", minorRaw = "0", patchRaw = "0"] = process.versions.node.split(".");
const major = Number(majorRaw);
const minor = Number(minorRaw);
const patch = Number(patchRaw);
const atLeast = (wantedMinor, wantedPatch) =>
  minor > wantedMinor || (minor === wantedMinor && patch >= wantedPatch);
if (
  (major === 22 && atLeast(22, 3)) ||
  (major === 24 && atLeast(15, 0)) ||
  (major === 25 && atLeast(9, 0)) ||
  major > 25
) {
  process.exit(0);
}
console.error(
  `prepare-openclaw-target.sh requires Node.js 22.22.3+, 24.15.0+, or 25.9.0+ (current: ${process.versions.node})`,
);
process.exit(1);
EOF
}

run_pnpm() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return 0
  fi

  echo "pnpm or corepack is required to prepare OpenClaw ${CLAWMAX_OPENCLAW_TARGET}" >&2
  exit 1
}

ensure_pnpm_on_path() {
  local shim_dir="$1"

  if command -v corepack >/dev/null 2>&1; then
    mkdir -p "$shim_dir"
    cat >"${shim_dir}/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec corepack pnpm "$@"
EOF
    chmod +x "${shim_dir}/pnpm"
    export PATH="${shim_dir}:${PATH}"
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi

  echo "pnpm or corepack is required to prepare OpenClaw ${CLAWMAX_OPENCLAW_TARGET}" >&2
  exit 1
}

sanitize_ref() {
  printf '%s' "$1" | tr '/:@' '---'
}

prepare_checkout() {
  local sanitized_ref cache_root work_root src_dir current_tag prepared_stamp current_commit
  sanitized_ref="$(sanitize_ref "$CLAWMAX_OPENCLAW_TARGET")"
  cache_root="${CLAWMAX_OPENCLAW_CACHE_DIR:-${TMPDIR:-/tmp}/clawmax-openclaw-targets}"
  work_root="${cache_root}/${sanitized_ref}"
  src_dir="${work_root}/src"
  prepared_stamp="${work_root}/.prepared-commit"

  mkdir -p "$work_root"

  if [ -d "$src_dir" ] && [ ! -f "$src_dir/package.json" ]; then
    rm -rf "$src_dir"
  fi

  if [ ! -d "$src_dir/.git" ]; then
    git clone --depth 1 --branch "$CLAWMAX_OPENCLAW_TARGET" https://github.com/openclaw/openclaw.git "$src_dir" >&2
  fi

  (
    cd "$src_dir"
    current_tag="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
    if [ "$current_tag" != "$CLAWMAX_OPENCLAW_TARGET" ]; then
      git fetch --depth 1 --tags --force origin "$CLAWMAX_OPENCLAW_TARGET" >&2
      git checkout --force "$CLAWMAX_OPENCLAW_TARGET" >&2
    fi
  )

  ensure_supported_node

  current_commit="$(
    cd "$src_dir"
    git rev-parse HEAD
  )"

  if [ ! -f "${src_dir}/dist/index.js" ] || [ ! -f "$prepared_stamp" ] || [ "$(cat "$prepared_stamp" 2>/dev/null || true)" != "$current_commit" ]; then
    (
      cd "$src_dir"
      export COREPACK_HOME="${COREPACK_HOME:-${work_root}/corepack}"
      ensure_pnpm_on_path "${work_root}/bin"
      run_pnpm install --frozen-lockfile --ignore-scripts >&2
      run_pnpm run build:docker >&2
      node "$SCRIPT_DIR/patch-openclaw-fs-safe.mjs" "$src_dir" >&2
      node scripts/postinstall-bundled-plugins.mjs >&2 || true
      node - dist/cli-startup-metadata.json <<'EOF'
const fs = require("node:fs");
const metadata = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const channels = new Set(metadata.channelOptions ?? []);
for (const channel of ["whatsapp", "discord", "telegram", "slack"]) {
  if (!channels.has(channel)) {
    throw new Error(`OpenClaw startup metadata is missing channel: ${channel}`);
  }
}
EOF
    )
    printf '%s\n' "$current_commit" > "$prepared_stamp"
  fi

  mkdir -p "${work_root}/bin"
  cat >"${work_root}/bin/openclaw" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$src_dir"
exec node "$src_dir/openclaw.mjs" "\$@"
EOF
  chmod +x "${work_root}/bin/openclaw"

  PREPARED_WORK_ROOT="$work_root"
}

main() {
  local work_root
  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
  esac

  prepare_checkout
  work_root="$PREPARED_WORK_ROOT"

  case "${1:-}" in
    --print-bin)
      printf '%s\n' "${work_root}/bin/openclaw"
      ;;
    --print-skills-dir)
      printf '%s\n' "${work_root}/src/skills"
      ;;
    "")
      printf 'Prepared OpenClaw %s\n' "$CLAWMAX_OPENCLAW_TARGET"
      printf 'OPENCLAW_BIN=%s\n' "${work_root}/bin/openclaw"
      printf 'OPENCLAW_SKILLS_DIR=%s\n' "${work_root}/src/skills"
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
