# Release Distribution

This document captures the public install/distribution contract for ClawMax releases.

## Goal

Allow users to install a pinned or latest public ClawMax release without needing:

- `gh`
- a GitHub login
- a pre-existing local git clone

The install path should remain simple, verifiable, and versioned.

## Public Flows

### Latest release

```bash
curl -fsSL https://github.com/Maximilien-ai/clawmax/releases/latest/download/install.sh | bash
```

### Pinned release

```bash
curl -fsSL https://github.com/Maximilien-ai/clawmax/releases/latest/download/install.sh | bash -s -- v1.6.3
```

## Release Assets

Each tagged release publishes:

- `clawmax-vX.Y.Z.tar.gz`
- `clawmax-vX.Y.Z.sha256`
- `install.sh`

Suggested download pattern:

- `https://github.com/Maximilien-ai/clawmax/releases/download/vX.Y.Z/clawmax-vX.Y.Z.tar.gz`
- `https://github.com/Maximilien-ai/clawmax/releases/download/vX.Y.Z/clawmax-vX.Y.Z.sha256`

## Bootstrap Behavior

The bootstrap installer:

1. resolve the requested version, or discover the latest tagged release
2. download the matching `.tar.gz`
3. download the matching `.sha256`
4. verify the checksum before extraction
5. extract into a temporary working directory
6. enter the extracted release bundle
7. continue into the normal repo `setup.sh`

This keeps one real setup engine while allowing a lightweight public bootstrap path.

## Relationship to `setup.sh`

- `setup.sh` remains the primary in-repo installer/configurator
- `install.sh` is the public bootstrap/downloader/verifier
- `setup.sh vX.Y.Z` or `setup.sh latest` delegates to `install.sh`

This keeps one real setup engine while still supporting a simple one-line public installer.

## Why tar.gz

`tar.gz` is a better fit for release bundles because it is:

- simple to generate from tagged source
- straightforward to checksum
- portable across macOS and Linux
- easier to treat as a canonical source bundle than ad hoc zip packaging

## Verification Requirements

Validate regularly:

1. pinned release install from a clean machine
2. latest release install from a clean machine
3. checksum mismatch behavior
4. interrupted download retry behavior
5. re-running install over an existing install
6. clean handoff into `setup.sh`
7. successful local startup after bootstrap

## Notes

- “latest” resolves through the GitHub Releases redirect rather than requiring `gh`
- the bootstrap path avoids a Git clone and avoids GitHub authentication for public releases
- release bundles currently package the tagged source tree as the canonical install payload
