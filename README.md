# maxclaw
A common repo for all max<n> OpenClaw instances.

## Convention
Each agent instance lives in its own subdirectory named `maxX` (e.g., `max0`, `max1`).

### Example layout
- `max0/` – primary assistant workspace (current session)
- `max1/` – reserved for additional assistant instance
- Additional instances follow the same pattern (`max2/`, `max3/`, ...)

Shared resources (like LICENSE/README) stay at the repo root. Each `maxX/` folder should contain its own `AGENTS.md`, `SOUL.md`, `TODOs.md`, etc., so instances stay isolated.

When bringing a new instance online:
1. Create the `maxX/` directory.
2. Copy or bootstrap the required files inside it.
3. Commit the new directory so it’s tracked alongside existing instances.
