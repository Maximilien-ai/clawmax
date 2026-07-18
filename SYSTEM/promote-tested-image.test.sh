#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
WORKFLOW="$ROOT_DIR/.github/workflows/promote-tested-image.yml"

require_text() {
  pattern="$1"
  message="$2"
  if ! grep -Fq -- "$pattern" "$WORKFLOW"; then
    echo "$message" >&2
    exit 1
  fi
}

require_text 'FROM ${SOURCE_IMAGE}' 'promotion must inherit from the tested per-architecture image'
require_text 'ENV CLAWMAX_VERSION=${RELEASE_VERSION}' 'promotion must stamp the official runtime version'
require_text '--build-arg "SOURCE_IMAGE=${image}:${semver}-test-${test_tag}-${arch}"' 'promotion must use the selected RC image as its source'
require_text '--provenance=false' 'per-architecture promotion tags must remain runnable image manifests'
require_text '"${image}:${semver}-amd64"' 'stable manifest must use the promoted amd64 image'
require_text '"${image}:${semver}-arm64"' 'stable manifest must use the promoted arm64 image'

echo "promote tested image tests passed"
