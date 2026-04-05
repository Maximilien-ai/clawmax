# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

WORKDIR /app/SYSTEM/dashboard

COPY SYSTEM/dashboard/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY SYSTEM/dashboard ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app/SYSTEM/dashboard

COPY SYSTEM/dashboard/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
RUN npm install -g openclaw

COPY --from=builder /app/SYSTEM/dashboard/dist ./dist
COPY --from=builder /app/SYSTEM/dashboard/server/schemas ./server/schemas

WORKDIR /app

COPY TEMPLATES ./TEMPLATES
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

EXPOSE 3001

ENTRYPOINT ["/app/SYSTEM/dashboard/docker-entrypoint.sh"]
CMD ["node", "/app/SYSTEM/dashboard/dist/server/index.js"]
