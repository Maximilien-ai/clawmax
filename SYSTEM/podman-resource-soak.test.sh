#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
RUNNER="$SCRIPT_DIR/podman-resource-soak.sh"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-resource-soak.XXXXXX")"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT
mkdir -p "$FIXTURE_ROOT/bin"

cat > "$FIXTURE_ROOT/bin/podman" <<'EOF'
#!/usr/bin/env sh
case "$1" in
  inspect)
    if [ "$2" = "--format" ]; then echo true; else echo '[{"ImageName":"ghcr.io/example/clawmax:rc46","Image":"sha256:image","ImageDigest":"sha256:digest","Architecture":"arm64","Os":"linux","Config":{"Image":"fallback"}}]'; fi
    ;;
  stats) echo '[{"mem_usage":"350 MiB / 8 GiB","pids":24,"cpu_percent":"0.5%"}]' ;;
  top) printf 'PID PPID USER RSS COMMAND\n10 1 node 1234 dashboard\n' ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$FIXTURE_ROOT/bin/podman"

PATH="$FIXTURE_ROOT/bin:$PATH" "$RUNNER" \
  --container clawmax-dashboard \
  --output-dir "$FIXTURE_ROOT/evidence" \
  --duration-seconds 0 \
  --interval-seconds 1 >/dev/null

grep -Fq 'image_digest=sha256:digest' "$FIXTURE_ROOT/evidence/metadata.txt"
grep -Fq $'0\t' "$FIXTURE_ROOT/evidence/samples.tsv"
grep -Fq $'350 MiB / 8 GiB\t24\t0.5%' "$FIXTURE_ROOT/evidence/samples.tsv"
grep -Fq 'dashboard' "$FIXTURE_ROOT/evidence/processes/00000.txt"
test -s "$FIXTURE_ROOT/evidence/stats/00000.json"

if PATH="$FIXTURE_ROOT/bin:$PATH" "$RUNNER" --container '../unsafe' --output-dir "$FIXTURE_ROOT/unsafe" >/dev/null 2>&1; then
  echo "unsafe container name unexpectedly accepted" >&2
  exit 1
fi

if PATH="$FIXTURE_ROOT/bin:$PATH" "$RUNNER" --container clawmax-dashboard --output-dir "$FIXTURE_ROOT/evidence" --duration-seconds 0 >/dev/null 2>&1; then
  echo "existing evidence directory unexpectedly overwritten" >&2
  exit 1
fi

echo "podman-resource-soak.test.sh: 7 assertions passed"
