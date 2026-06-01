#!/bin/sh

# Source of truth for the OpenClaw version/ref used by this branch.
# Keep Docker, CI, and local upgrade notes aligned to this value.

export CLAWMAX_OPENCLAW_TARGET="${CLAWMAX_OPENCLAW_TARGET:-v2026.5.26}"
