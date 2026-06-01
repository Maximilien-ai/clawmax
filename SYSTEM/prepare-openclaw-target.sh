#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

. "$SCRIPT_DIR/openclaw-version.sh"

usage() {
  cat <<'EOF'
Usage: ./SYSTEM/prepare-openclaw-target.sh [--print-bin|--print-skills-dir]

Build the branch-targeted OpenClaw checkout in an isolated cache directory and
create a branch-local wrapper binary suitable for OPENCLAW_BIN.
EOF
}

ensure_supported_node() {
  node <<'EOF'
const [majorRaw = "0", minorRaw = "0"] = process.versions.node.split(".");
const major = Number(majorRaw);
const minor = Number(minorRaw);
if (major > 22 || (major === 22 && minor >= 19)) {
  process.exit(0);
}
console.error(
  `prepare-openclaw-target.sh requires Node.js >=22.19.0 (current: ${process.versions.node})`,
);
process.exit(1);
EOF
}

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
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
      run_pnpm install --frozen-lockfile --ignore-scripts >&2
      npm run build:docker >&2
      node scripts/postinstall-bundled-plugins.mjs >&2 || true
      grep -q '"qqbot"' dist/cli-startup-metadata.json
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

  printf '%s\n' "$work_root"
}

main() {
  local work_root
  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
  esac

  work_root="$(prepare_checkout)"

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
