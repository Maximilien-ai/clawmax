# Canonical Dashboard Container Contract

This repository's root `Dockerfile` is the canonical supported ClawMax
dashboard container contract. CLI-generated `Containerfile.clawmax` files
should target this contract instead of reimplementing it.

## Build

Build from the repository root. The build context is intentionally not
`SYSTEM/dashboard` because the image packages workspace templates, skills,
partners, plugins, schemas, and the OpenClaw patch alongside the dashboard.

```sh
docker build -f Dockerfile \
  --build-arg CLAWMAX_VERSION=2.0.0-test-rcN \
  --build-arg OPENCLAW_GIT_REF=v2026.8.2 \
  --build-arg CLAWMAX_ENABLED_PLUGINS= \
  -t clawmax-dashboard:local .
```

CI uses the same `context: .` and `file: ./Dockerfile` contract for amd64 and
arm64 builds. `OPENCLAW_GIT_REF` must remain pinned to the tested OpenClaw
revision; do not install a floating registry version in a downstream image.

## Runtime contract

The image starts with:

```text
ENTRYPOINT ["/app/SYSTEM/dashboard/docker-entrypoint.sh"]
CMD ["node", "/app/SYSTEM/dashboard/dist/server/index.js"]
```

The entrypoint creates and preserves these runtime locations:

- `HOME=/app`
- `OPENCLAW_WORKSPACE=/app/WORKSPACES/default` (overrideable)
- OpenClaw state: `/app/.openclaw`
- dashboard: `/app/SYSTEM/dashboard`
- repository payloads: `/app/TEMPLATES`, `/app/PLUGINS`, `/app/PARTNERS`,
  `/app/SKILLS`, and `/app/SYSTEM/schemas`

Persist `/app/WORKSPACES` and `/app/.openclaw` in a deployment. Replacing or
mounting over `/app/SYSTEM/dashboard` with files from another release can
trigger the entrypoint's version-mismatch diagnostic and is unsupported.

Custom agent and organization templates are user data. When
`CLAWMAX_DATA_ROOT` is configured, Dashboard stores them by workspace ID below
`$CLAWMAX_DATA_ROOT/templates`; the CLI container layout therefore uses
`/app/DATA/templates`. On first access, Dashboard copies templates from the
legacy active-workspace `TEMPLATES/agents` and `TEMPLATES/organizations`
directories without deleting or overwriting them. Source and legacy
deployments without `CLAWMAX_DATA_ROOT` continue using the active workspace.
The release-image lifecycle smoke test replaces its container with the data
volume retained and verifies both custom template types remain readable.

The dashboard listens on `DASHBOARD_PORT=3001`. The OpenClaw gateway is
started and watched by the entrypoint using the persisted gateway config. The
container healthcheck is:

```text
GET http://127.0.0.1:3001/api/health
```

The image also requires `openclaw` to be available on `PATH`; the Dockerfile
installs the pinned packed artifact produced in the builder stage.

## Build-time inputs

| Input | Purpose |
| --- | --- |
| `CLAWMAX_VERSION` | Dashboard/image version reported by `/api/system` and startup diagnostics |
| `OPENCLAW_GIT_REF` | Exact OpenClaw source tag or commit to build and package |
| `CLAWMAX_ENABLED_PLUGINS` | Optional comma-separated plugin enablement override |

Runtime deployments may additionally set `OPENCLAW_WORKSPACE`,
`CLAWMAX_SECRET_MASTER_KEY`, gateway settings, and provider credentials. Do
not bake credentials into an image or pass them as build arguments.

## Public and separately distributed images

The public image contains the public plugin infrastructure and public plugins.
Non-public plugins are supplied through a separately built combined image and
must not be copied into this public repository or image.
Both images must preserve the same filesystem paths, entrypoint, healthcheck,
and environment contract above.

## CLI handoff

The CLI can validate compatibility by building or inspecting an image created
from the root `Dockerfile`, then checking:

1. `/api/health` returns HTTP 200 and `/api/system` reports the requested
   version.
2. `openclaw --version` reports the pinned OpenClaw baseline.
3. `/app/WORKSPACES` and `/app/.openclaw` survive a restart.
4. Custom agent and organization templates survive runtime-image replacement.
5. An agent can be created, removed with state, and recreated immediately with
   the same exact ID and ordered tags.
6. The entrypoint starts the dashboard and gateway without a generated
   replacement entrypoint.
7. The expected plugin payload is discoverable under `/app/PLUGINS`.
