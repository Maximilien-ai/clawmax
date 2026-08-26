ARG CLAWMAX_VERSION=
ARG CLAWMAX_ENABLED_PLUGINS=
ARG OPENCLAW_GIT_REF=v2026.6.34
ARG BUILDPLATFORM
ARG TARGETPLATFORM

FROM --platform=$BUILDPLATFORM node:22.19.0-bookworm-slim AS openclaw-builder
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG OPENCLAW_GIT_REF

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/openclaw-src

RUN git clone https://github.com/openclaw/openclaw.git . \
  && git checkout "${OPENCLAW_GIT_REF}"
COPY SYSTEM/patch-openclaw-fs-safe.mjs /tmp/patch-openclaw-fs-safe.mjs

RUN npm install -g pnpm
# Some pinned OpenClaw transitive git-hosted dependencies currently fail in
# their own `prepare` hooks during clean-room container builds (for example
# @tloncorp/api via Tessl-related dependency chains). We only need a resolved
# dependency tree plus built OpenClaw dist here, so skip dependency lifecycle
# scripts in the builder stage and let the explicit top-level build produce the
# artifact we package into the runtime image.
RUN retry() { \
      local attempts="$1"; shift; \
      local delay="$1"; shift; \
      local n=1; \
      until "$@"; do \
        if [ "$n" -ge "$attempts" ]; then \
          return 1; \
        fi; \
        echo "Retry $n/$attempts failed for: $*"; \
        n=$((n + 1)); \
        sleep "$delay"; \
      done; \
    }; \
    if [ -f pnpm-lock.yaml ]; then \
      retry 3 5 pnpm install --frozen-lockfile --ignore-scripts; \
    elif [ -f package-lock.json ]; then \
      retry 3 5 npm ci --legacy-peer-deps --ignore-scripts; \
    else \
      retry 3 5 npm install --legacy-peer-deps --ignore-scripts; \
    fi
RUN npm run build:docker
RUN node /tmp/patch-openclaw-fs-safe.mjs /opt/openclaw-src
# Match the local/CI preparation path: install the bundled plugin payloads
# before packing so the runtime image receives a complete OpenClaw artifact.
RUN node scripts/postinstall-bundled-plugins.mjs \
  && grep -q '"qqbot"' dist/cli-startup-metadata.json
RUN npm pack --ignore-scripts

FROM --platform=$BUILDPLATFORM node:22.19.0-bookworm-slim AS builder
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG CLAWMAX_VERSION

WORKDIR /app/SYSTEM/dashboard

COPY SYSTEM/dashboard/package*.json ./
RUN retry() { \
      local attempts="$1"; shift; \
      local delay="$1"; shift; \
      local n=1; \
      until "$@"; do \
        if [ "$n" -ge "$attempts" ]; then \
          return 1; \
        fi; \
        echo "Retry $n/$attempts failed for: $*"; \
        n=$((n + 1)); \
        sleep "$delay"; \
      done; \
    }; \
    if [ -f package-lock.json ]; then \
      retry 3 5 npm ci --legacy-peer-deps; \
    else \
      retry 3 5 npm install --legacy-peer-deps; \
    fi

COPY SYSTEM/dashboard ./
RUN npm run build

FROM --platform=$TARGETPLATFORM node:22.19.0-bookworm-slim AS runtime
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

WORKDIR /app/SYSTEM/dashboard

ARG CLAWMAX_VERSION
ARG OPENCLAW_GIT_REF
ARG CLAWMAX_ENABLED_PLUGINS
ARG TARGETARCH
ARG QBO_VERSION=0.6.1
ARG QBO_LINUX_AMD64_SHA256=ce7774c7c641b1c6fe356e2e522465fbf16d80bce0a87fd2c8027774e2a46f31
ARG QBO_LINUX_ARM64_SHA256=150cdb50c2dacc8c990c3594b358dcd84f2336de31cad73de266bbdf32b3d4e0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gh \
    git \
    jq \
    python3 \
    ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
      amd64) qbo_sha256="${QBO_LINUX_AMD64_SHA256}" ;; \
      arm64) qbo_sha256="${QBO_LINUX_ARM64_SHA256}" ;; \
      *) echo "Unsupported QBO target architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
  && qbo_archive="qbo-cli_${QBO_VERSION}_linux_${TARGETARCH}.tar.gz" \
  && curl -fsSL --retry 3 --retry-delay 5 \
    -o "/tmp/${qbo_archive}" \
    "https://github.com/voska/qbo-cli/releases/download/v${QBO_VERSION}/${qbo_archive}" \
  && echo "${qbo_sha256}  /tmp/${qbo_archive}" | sha256sum -c - \
  && mkdir -p /tmp/qbo-cli /usr/share/doc/qbo-cli \
  && tar -xzf "/tmp/${qbo_archive}" -C /tmp/qbo-cli \
  && install -m 0755 /tmp/qbo-cli/qbo /usr/local/bin/qbo \
  && install -m 0644 /tmp/qbo-cli/LICENSE /usr/share/doc/qbo-cli/LICENSE \
  && qbo --json schema \
    | jq -e --arg expected "${QBO_VERSION}" \
      '.name == "qbo" and .version == $expected' >/dev/null \
  && rm -rf "/tmp/${qbo_archive}" /tmp/qbo-cli

COPY SYSTEM/dashboard/package*.json ./
RUN retry() { \
      local attempts="$1"; shift; \
      local delay="$1"; shift; \
      local n=1; \
      until "$@"; do \
        if [ "$n" -ge "$attempts" ]; then \
          return 1; \
        fi; \
        echo "Retry $n/$attempts failed for: $*"; \
        n=$((n + 1)); \
        sleep "$delay"; \
      done; \
    }; \
    if [ -f package-lock.json ]; then \
      retry 3 5 npm ci --omit=dev --legacy-peer-deps; \
    else \
      retry 3 5 npm install --omit=dev --legacy-peer-deps; \
    fi
# Pin the tested OpenClaw runtime explicitly so downstream cloud builders do
# not drift to fixtures or an unvalidated upstream revision. Install from a
# packed artifact so dist output and production dependencies land exactly as
# they would in a real package install.
COPY --from=openclaw-builder /opt/openclaw-src/openclaw-*.tgz /tmp/openclaw.tgz
RUN npm install -g /tmp/openclaw.tgz \
  && rm -f /tmp/openclaw.tgz

# Claude Code CLI (optional agent runtime: claude). Agents can be pinned to
# this runtime instead of OpenClaw; ANTHROPIC_API_KEY must be set for it to
# authenticate. Pinned via ARG so image builds stay reproducible.
ARG CLAUDE_CODE_VERSION=2.1.205
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Factory Droid CLI (optional agent runtime: droid). Factory does not publish
# droid to npm. Its published installer (https://app.factory.ai/cli) is a
# curl-piped shell script that is NOT genuinely pinnable: it hardcodes an
# internal `VER=` literal with no environment-variable override, so `curl
# https://app.factory.ai/cli | sh` always installs whatever the remote script
# bakes in that day — mutable and unreproducible at image build time. That
# installer script does, however, resolve to a versioned, checksummed
# artifact under the hood:
#   https://downloads.factory.ai/factory-cli/releases/<version>/<platform>/<arch>/droid
#   https://downloads.factory.ai/factory-cli/releases/<version>/<platform>/<arch>/droid.sha256
# (the installer's own "Checksum verification passed" message comes from
# comparing a sha256sum of the downloaded binary against that `.sha256`
# sidecar). We bypass the mutable wrapper script and perform that exact
# download-then-checksum step ourselves against FACTORY_DROID_VERSION, so the
# ARG genuinely pins the artifact instead of being informational. The
# `--version | grep` at the end fails the build if the checksum-verified
# binary reports a different version than the one we asked for, so a
# checksum-valid-but-wrong-version artifact still can't slip through.
# HOME is not set to /app until later in this stage, so it's exported here
# explicitly to match the runtime HOME (see `ENV HOME=/app` below) and keep
# resolveRuntimeCliPath's `~/.local/bin/droid` fallback consistent between
# build time and container run time.
ARG FACTORY_DROID_VERSION=0.158.0
RUN export HOME=/app \
  && droid_arch="$(uname -m)" \
  && case "$droid_arch" in \
       x86_64|amd64) droid_arch="x64" ;; \
       arm64|aarch64) droid_arch="arm64" ;; \
       *) echo "Unsupported architecture for droid: $droid_arch" >&2; exit 1 ;; \
     esac \
  && droid_suffix="" \
  && if [ "$droid_arch" = "x64" ] && ! grep -qi avx2 /proc/cpuinfo 2>/dev/null; then \
       droid_suffix="-baseline"; \
     fi \
  && droid_url="https://downloads.factory.ai/factory-cli/releases/${FACTORY_DROID_VERSION}/linux/${droid_arch}${droid_suffix}/droid" \
  && command -v sha256sum >/dev/null 2>&1 \
    || { echo "sha256sum is required to verify the droid download" >&2; exit 1; } \
  && curl -fsSL -o /tmp/droid "$droid_url" \
  && curl -fsSL -o /tmp/droid.sha256 "${droid_url}.sha256" \
  && actual_sha="$(sha256sum /tmp/droid | awk '{print $1}')" \
  && expected_sha="$(cat /tmp/droid.sha256)" \
  && [ -n "$expected_sha" ] && [ "$actual_sha" = "$expected_sha" ] \
    || { echo "droid checksum mismatch: expected '$expected_sha', got '$actual_sha'" >&2; exit 1; } \
  && mkdir -p "$HOME/.local/bin" \
  && install -m 0755 /tmp/droid "$HOME/.local/bin/droid" \
  && rm -f /tmp/droid /tmp/droid.sha256 \
  && "$HOME/.local/bin/droid" --version | grep -F "${FACTORY_DROID_VERSION}" \
    || { echo "droid --version did not report pinned version ${FACTORY_DROID_VERSION}" >&2; exit 1; } \
  && install -m 0755 "$HOME/.local/bin/droid" /usr/local/bin/droid
# Also install droid onto PATH, not only under ~/.local/bin. The `~` fallback in
# resolveRuntimeCliPath only finds it when the container's HOME matches the /app
# used at build time, and deployments legitimately override HOME (the ClawMax host
# agent runs the dashboard with HOME=/app/DATA/.home so the OpenClaw profile lives
# on the mounted data volume). In that case droid was silently reported as not
# installed while the binary sat in the image. /usr/local/bin is where `npm i -g`
# puts the claude CLI, which is why claude resolved correctly and droid did not.

COPY --from=builder /app/SYSTEM/dashboard/dist ./dist
COPY --from=builder /app/SYSTEM/dashboard/server/schemas ./server/schemas

WORKDIR /app

COPY TEMPLATES ./TEMPLATES
COPY PLUGINS ./PLUGINS
COPY PARTNERS ./PARTNERS
COPY SKILLS/README.md ./SKILLS/README.md
COPY SKILLS/custom/clawmax-resend ./SKILLS/custom/clawmax-resend
COPY SKILLS/custom/clawmax-workspace-ls ./SKILLS/custom/clawmax-workspace-ls
COPY SKILLS/custom/luma-event-insights ./SKILLS/custom/luma-event-insights
COPY SKILLS/custom/workspace-ls ./SKILLS/custom/workspace-ls
COPY SKILLS/custom/clawmax-secret-test ./SKILLS/custom/clawmax-secret-test
COPY SKILLS/custom/clawmax-mail ./SKILLS/custom/clawmax-mail
COPY SYSTEM/schemas ./SYSTEM/schemas
COPY SYSTEM/dashboard/.env.example ./SYSTEM/dashboard/.env.example
COPY SYSTEM/dashboard/docker-entrypoint.sh ./SYSTEM/dashboard/docker-entrypoint.sh
COPY SYSTEM/dashboard/openclaw-auth-store.mjs ./SYSTEM/dashboard/openclaw-auth-store.mjs
COPY SYSTEM/dashboard/clawmax-resend-send /usr/local/bin/clawmax-resend-send
COPY SYSTEM/dashboard/clawmax-skill-run /usr/local/bin/clawmax-skill-run
COPY SYSTEM/dashboard/clawmax-mail-run /usr/local/bin/clawmax-mail-run

RUN mkdir -p /app/AGENTS \
  /app/.openclaw \
  /app/SYSTEM/dashboard/dist/server/logs \
  /app/WORKSPACES/default/AGENTS \
  /app/WORKSPACES/default/WORKFLOWS \
  /app/WORKSPACES/default/GROUPS \
  /app/WORKSPACES/default/COMMUNITIES \
  /app/WORKSPACES/default/ORG \
  && chmod +x /app/SYSTEM/dashboard/docker-entrypoint.sh /usr/local/bin/clawmax-resend-send /usr/local/bin/clawmax-skill-run /usr/local/bin/clawmax-mail-run

ENV NODE_ENV=production
ENV HOME=/app
ENV DASHBOARD_PORT=3001
ENV OPENCLAW_WORKSPACE=/app/WORKSPACES/default
ENV CLAWMAX_REPO_ROOT=/app
ENV CLAWMAX_VERSION=${CLAWMAX_VERSION}
ENV CLAWMAX_ENABLED_PLUGINS=${CLAWMAX_ENABLED_PLUGINS}
ENV OPENCLAW_GIT_REF=${OPENCLAW_GIT_REF}
ENV CLAWMAX_GATEWAY_WATCHDOG=true
ENV CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC=30

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/api/health >/dev/null || exit 1

ENTRYPOINT ["/app/SYSTEM/dashboard/docker-entrypoint.sh"]
CMD ["node", "/app/SYSTEM/dashboard/dist/server/index.js"]
