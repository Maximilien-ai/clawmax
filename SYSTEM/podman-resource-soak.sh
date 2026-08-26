#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: $0 --container <name> --output-dir <new-directory> [--duration-seconds <seconds>] [--interval-seconds <seconds>]" >&2
}

container=""
output_dir=""
duration_seconds=86400
interval_seconds=300

while [ "$#" -gt 0 ]; do
  case "$1" in
    --container)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      container="$2"
      shift 2
      ;;
    --output-dir)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      output_dir="$2"
      shift 2
      ;;
    --duration-seconds)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      duration_seconds="$2"
      shift 2
      ;;
    --interval-seconds)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      interval_seconds="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

[ -n "$container" ] && [ -n "$output_dir" ] || { usage; exit 2; }
case "$container" in
  *[!A-Za-z0-9_.-]*|'') echo "Invalid container name: $container" >&2; exit 2 ;;
esac
case "$duration_seconds" in
  *[!0-9]*|'') echo "Duration must be a non-negative integer" >&2; exit 2 ;;
esac
case "$interval_seconds" in
  *[!0-9]*|'') echo "Interval must be a positive integer" >&2; exit 2 ;;
esac
[ "$interval_seconds" -gt 0 ] || { echo "Interval must be greater than zero" >&2; exit 2; }

command -v podman >/dev/null 2>&1 || { echo "podman is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
[ ! -e "$output_dir" ] || { echo "Output directory already exists: $output_dir" >&2; exit 1; }

running="$(podman inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)"
[ "$running" = "true" ] || { echo "Container is not running: $container" >&2; exit 1; }

mkdir -p "$output_dir/processes" "$output_dir/stats"
podman inspect "$container" > "$output_dir/container-inspect.json"

started_epoch="$(date +%s)"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
{
  echo "container=$container"
  echo "started_at=$started_at"
  echo "duration_seconds=$duration_seconds"
  echo "interval_seconds=$interval_seconds"
  jq -r '.[0] | "image_name=\(.ImageName // .Config.Image // "unknown")\nimage_id=\(.Image // "unknown")\nimage_digest=\(.ImageDigest // "unknown")\narchitecture=\(.Architecture // "unknown")\nos=\(.Os // "unknown")"' "$output_dir/container-inspect.json"
} > "$output_dir/metadata.txt"
printf 'sample\ttimestamp_utc\telapsed_seconds\tmemory_usage\tpids\tcpu\n' > "$output_dir/samples.tsv"

sample=0
while :; do
  now_epoch="$(date +%s)"
  elapsed=$((now_epoch - started_epoch))
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  stats_file="$output_dir/stats/$(printf '%05d' "$sample").json"
  process_file="$output_dir/processes/$(printf '%05d' "$sample").txt"

  podman stats --no-stream --format json "$container" > "$stats_file"
  values="$(jq -r 'if type == "array" then .[0] else . end | [(.mem_usage // .MemUsage // "unknown"), ((.pids // .PIDs // "unknown") | tostring), (.cpu_percent // .CPU // .cpu // "unknown")] | @tsv' "$stats_file")"
  printf '%s\t%s\t%s\t%s\n' "$sample" "$timestamp" "$elapsed" "$values" >> "$output_dir/samples.tsv"
  podman top "$container" pid ppid user rss args > "$process_file"

  [ "$elapsed" -ge "$duration_seconds" ] && break
  remaining=$((duration_seconds - elapsed))
  sleep_for="$interval_seconds"
  [ "$remaining" -lt "$sleep_for" ] && sleep_for="$remaining"
  sleep "$sleep_for"
  sample=$((sample + 1))
done

finished_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "finished_at=$finished_at" >> "$output_dir/metadata.txt"
echo "samples=$((sample + 1))" >> "$output_dir/metadata.txt"
echo "Podman resource soak evidence: $output_dir"
