# syntax=docker/dockerfile:1

ARG CLAWMAX_VERSION=
ARG OPENCLAW_GIT_REF=v2026.5.26
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
RUN npm pack

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

COPY --from=builder /app/SYSTEM/dashboard/dist ./dist
COPY --from=builder /app/SYSTEM/dashboard/server/schemas ./server/schemas

WORKDIR /app

COPY TEMPLATES ./TEMPLATES
COPY PARTNERS ./PARTNERS
COPY SKILLS/README.md ./SKILLS/README.md
COPY SKILLS/custom/clawmax-resend ./SKILLS/custom/clawmax-resend
COPY SKILLS/custom/clawmax-workspace-ls ./SKILLS/custom/clawmax-workspace-ls
COPY SKILLS/custom/luma-event-insights ./SKILLS/custom/luma-event-insights
COPY SKILLS/custom/workspace-ls ./SKILLS/custom/workspace-ls
COPY SYSTEM/schemas ./SYSTEM/schemas
COPY SYSTEM/dashboard/.env.example ./SYSTEM/dashboard/.env.example
COPY SYSTEM/dashboard/docker-entrypoint.sh ./SYSTEM/dashboard/docker-entrypoint.sh

RUN mkdir -p /app/AGENTS \
  /app/.openclaw \
  /app/SYSTEM/dashboard/dist/server/logs \
  /app/WORKSPACES/default/AGENTS \
  /app/WORKSPACES/default/WORKFLOWS \
  /app/WORKSPACES/default/GROUPS \
  /app/WORKSPACES/default/COMMUNITIES \
  /app/WORKSPACES/default/ORG \
  && chmod +x /app/SYSTEM/dashboard/docker-entrypoint.sh

ENV NODE_ENV=production
ENV HOME=/app
ENV DASHBOARD_PORT=3001
ENV OPENCLAW_WORKSPACE=/app/WORKSPACES/default
ENV CLAWMAX_REPO_ROOT=/app
ENV CLAWMAX_VERSION=${CLAWMAX_VERSION}
ENV OPENCLAW_GIT_REF=${OPENCLAW_GIT_REF}
ENV CLAWMAX_GATEWAY_WATCHDOG=true
ENV CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC=30

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/api/health >/dev/null || exit 1

ENTRYPOINT ["/app/SYSTEM/dashboard/docker-entrypoint.sh"]
CMD ["node", "/app/SYSTEM/dashboard/dist/server/index.js"]
