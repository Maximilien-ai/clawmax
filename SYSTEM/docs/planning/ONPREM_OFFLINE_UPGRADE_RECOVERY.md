# On-prem offline upgrade recovery (RC86 planning)

Status: design contract; **not yet an implemented or approved recovery command**.
Owner: Dashboard for backup/restore/verify; local app and agent for writer shutdown,
volume selection, free-space checks, promotion, and rollback.

## Goal and safety boundary

An older Dashboard and Gateway do not need to start. The new image runs an
offline command against a stopped source volume, writes a private backup, and
restores into a distinct, empty candidate volume. The source volume is never
the restore target and is not mounted in the candidate container. The local
agent promotes the candidate only after offline migration, integrity checks,
Dashboard health, and populated-data checks pass. On failure, it keeps the
original volume unchanged and reports the phase and actionable reason.

The initial supported layout is the on-prem single data mount:
`CLAWMAX_DATA_ROOT=/app/DATA`, `HOME=/app/DATA/.home`, and OpenClaw state at
`/app/DATA/.home/.openclaw`. A legacy installation with separate
`/app/WORKSPACES` or `/app/.openclaw` mounts must be inventoried and handled
explicitly; silently omitting either mount is not a successful backup.
Configured OpenClaw `$include`, `agentDir`, or workspace paths outside the
selected persisted roots must be reported as `external_path_unmapped` until
the local agent supplies an explicit mount mapping. The image's packaged
templates, skills, plugins, and dashboard code are not user-data sources.

## Versioned offline contract (proposed `clawmax.offline-backup/v1`)

The new image should expose `backup`, `verify`, and `restore` through a
standalone executable that bypasses the normal entrypoint, so neither the
Dashboard server nor Gateway starts. Each operation emits exactly one JSON
result on stdout and exits nonzero for a blocked/failed result. Diagnostics
go to stderr without credential values, raw paths outside the mounted roots,
session text, or config contents.

- `backup`: requires stopped writers and a private output directory outside
  all source mounts. It creates an immutable, versioned bundle through a
  private temporary directory and publishes it only after verification.
  Existing output is never overwritten. The manifest records bundle/schema
  version, source Dashboard/OpenClaw versions, source layout, required mounts,
  logical assets, byte lengths, SHA-256 digests, and creation time. It never
  contains resolved credentials or transcript text.
- `verify`: independently validates the manifest, exact asset inventory,
  digests, OpenClaw archive, and supported schema version without changing the
  bundle or source. A manifest alone is not proof of SQLite consistency.
- `restore`: verifies before writing, refuses a nonempty candidate, and never
  writes into the source. It restores Dashboard-owned files and the OpenClaw
  archive into the canonical paths of the isolated candidate mount, runs the
  required OpenClaw offline migration there, then verifies the migrated state.
  A durable receipt records the source bundle ID, target version, migration
  version, integrity outcome, and counts—not secrets. A failed/interrupted
  candidate is not reused; retry starts with another empty candidate.

Example successful response (fields are stable; the final fixture must be
confirmed with the CLI team before implementation):

```json
{
  "apiVersion": "clawmax.offline-backup/v1",
  "operation": "verify",
  "status": "verified",
  "bundleId": "uuid",
  "dashboardVersion": "2.0.0-test-rc85",
  "openclawVersion": "2026.9.5",
  "assets": { "files": 0, "bytes": 0, "workspaces": 0, "agents": 0 },
  "checks": { "manifest": "passed", "hashes": "passed", "openclaw": "passed" }
}
```

Failure responses use `status: "blocked"` and a stable `code`, e.g.
`writers_active`, `sqlite_busy`, `insufficient_space`, `external_path_unmapped`,
`unsupported_bundle_version`, `integrity_failed`, `candidate_not_empty`,
`migration_failed`, or `verification_failed`. They identify a safe next action
without including credentials, transcript data, or raw config content.

## OpenClaw-owned state

Use the pinned OpenClaw image's native `openclaw backup create --verify --json`
and `openclaw backup verify --json` for its config, `$include` dependencies,
credentials, sessions, SQLite snapshots, and configured workspaces. Do not
copy live `.sqlite`, `-wal`, or `-shm` files as the portable recovery artifact.
Native restore extracts to a fresh staging location; its manifest supplies
asset ownership and source paths. Map those assets into the isolated candidate
only after checking every path against the declared mounts. OpenClaw's
`doctor --fix` runs with the candidate mounted at its canonical paths and no
source mount, while the Gateway remains stopped. Its exit status and subsequent
SQLite/session checks gate promotion. The Dashboard bundle additionally
captures Dashboard-owned files outside OpenClaw's archive, including custom
templates and other data below `CLAWMAX_DATA_ROOT`.

OpenClaw archive verification can be complete without proving Dashboard data
completeness. Conversely, a Dashboard file hash cannot prove OpenClaw SQLite
consistency. Both checks are mandatory.

## Local agent sequence

1. Inventory mounts and versions; stop Dashboard, Gateway, local agent state
   writers, and remaining child processes; confirm they stay stopped.
2. Check free space for a raw safety snapshot, a verified backup bundle, a
   candidate restore, and migration overhead. Take the independent raw safety
   snapshot for rollback; do not treat it as the portable backup.
3. Run offline `backup` and `verify` from the new image with source data mounted
   read-only and bundle output in a private local path.
4. Create a new empty candidate volume. Run offline `restore` with the bundle
   mounted read-only and **without** mounting the source volume.
5. Start the new Dashboard/Gateway only against the candidate. Check the
   authenticated readiness result, `/api/system` version, workspace/agent/
   workflow counts, and representative session/auth continuity. Promote the
   candidate only after these checks pass; otherwise stop it and keep the
   original selected. Never auto-restart the original on a new image that
   would migrate it in place.

All bundles contain credentials and private sessions. Keep them owner-only on
the Mac, encrypted at rest where available, and out of support bundles,
telemetry, CI artifacts, cloud storage, and routine logs. Retention/rotation
can follow after the first recovery contract; it must not delete the last
known-good checkpoint automatically.

## Release gate and missing fixture

The first acceptance fixture is the failed M4 installation's RC57 data
restored into an RC85-equivalent candidate, without exposing credentials or
session content to this repository. The CLI team should provide a redacted
mount/version inventory and execute the private fixture locally. Test:

- stopped-writer enforcement; a busy/locked SQLite database; source changes
  during backup; and an interrupted backup with no published partial bundle;
- insufficient space; corrupt/missing assets; traversal, external path, and
  symlink rejection; unsupported manifest versions; and exact retry behavior;
- empty-candidate enforcement; interrupted restore; preserved Dashboard
  workspaces/templates and OpenClaw sessions/auth; offline schema migration;
  candidate-only startup; failed health/data verification; and rollback to the
  untouched original.

Do not advertise these operations to the CLI or label RC86 upgrade-safe until
the executable, fixtures, on-prem image packaging, and this release gate pass.
