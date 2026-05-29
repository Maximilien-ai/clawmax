#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

pass() { printf '✓ %s\n' "$1"; }
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-install-test.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

release_root="$tmp_dir/clawmax-v0.0.0"
mkdir -p "$release_root"

cat >"$release_root/setup.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$#" > /tmp/clawmax-install-args-count.txt
printf '%s\n' "$*" > /tmp/clawmax-install-args.txt
EOF
chmod +x "$release_root/setup.sh"

archive_path="$tmp_dir/clawmax-v0.0.0.tar.gz"
checksum_path="$tmp_dir/clawmax-v0.0.0.sha256"
(cd "$tmp_dir" && tar -czf "$(basename "$archive_path")" "$(basename "$release_root")")
(cd "$tmp_dir" && shasum -a 256 "$(basename "$archive_path")" > "$(basename "$checksum_path")")

fake_curl_dir="$tmp_dir/bin"
mkdir -p "$fake_curl_dir"

cat >"$fake_curl_dir/curl" <<EOF
#!/usr/bin/env bash
set -euo pipefail
archive_path="$archive_path"
checksum_path="$checksum_path"
if [[ "\$*" == *"url_effective"* ]]; then
  printf 'https://github.com/Maximilien-ai/clawmax/releases/tag/v0.0.0'
  exit 0
fi
out=""
url=""
while [[ \$# -gt 0 ]]; do
  case "\$1" in
    -o)
      shift
      out="\$1"
      ;;
    http*)
      url="\$1"
      ;;
  esac
  shift || true
done
if [[ -z "\$out" || -z "\$url" ]]; then
  exit 1
fi
case "\$url" in
  *clawmax-v0.0.0.tar.gz) cp "\$archive_path" "\$out" ;;
  *clawmax-v0.0.0.sha256) cp "\$checksum_path" "\$out" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$fake_curl_dir/curl"

target_dir="$tmp_dir/install-target"
rm -f /tmp/clawmax-install-args-count.txt /tmp/clawmax-install-args.txt

(
  cd "$ROOT_DIR"
  PATH="$fake_curl_dir:$PATH" \
  CLAWMAX_GITHUB_OWNER=Maximilien-ai \
  CLAWMAX_GITHUB_REPO=clawmax \
  ./install.sh v0.0.0 --dir "$target_dir"
)

[[ -f /tmp/clawmax-install-args-count.txt ]] || fail "setup.sh was not invoked"
[[ "$(cat /tmp/clawmax-install-args-count.txt)" == "0" ]] || fail "expected zero setup args when installer is called without pass-through args"
pass "install.sh invokes setup.sh without error when no passthrough args are provided"

rm -rf "$target_dir"
rm -f /tmp/clawmax-install-args-count.txt /tmp/clawmax-install-args.txt

(
  cd "$ROOT_DIR"
  PATH="$fake_curl_dir:$PATH" \
  CLAWMAX_GITHUB_OWNER=Maximilien-ai \
  CLAWMAX_GITHUB_REPO=clawmax \
  ./install.sh v0.0.0 --dir "$target_dir" --non-interactive --port 3001
)

[[ -f /tmp/clawmax-install-args-count.txt ]] || fail "setup.sh was not invoked for passthrough args case"
[[ "$(cat /tmp/clawmax-install-args-count.txt)" == "3" ]] || fail "expected passthrough args to reach setup.sh"
[[ "$(cat /tmp/clawmax-install-args.txt)" == "--non-interactive --port 3001" ]] || fail "expected passthrough args to preserve ordering"
pass "install.sh forwards setup.sh passthrough args"
