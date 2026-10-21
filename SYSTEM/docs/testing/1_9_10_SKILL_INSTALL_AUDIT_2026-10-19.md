# 1.9.10 built-in skill install audit

**Source under test:** `fix/1.9.10-christen-followups` at `ea5bb176`  
**Target:** Debian 12 on Linux arm64, with amd64 parity  
**Scope:** 56 built-in skills discovered from the locally installed OpenClaw catalog. This is a metadata and command audit; it is not a live install pass for every skill.

## Confirmed repairs

- `1password`: the prior `apt-get install -y 1password-cli` assumed a repository that a fresh Debian runtime does not have. The dashboard installer now configures 1Password's signed, architecture-specific Debian repository for `amd64` or `arm64`, installs the package, and checks `op --version`. The script is packaged in the image. [1Password's Linux CLI instructions](https://www.1password.dev/cli/get-started) specify the repository and arm64 package. Account authentication remains a separate user setup step.
- `gh-issues`, `session-logs`, `tmux`, `trello`, `video-frames`, `weather`, and `openai-whisper-api` now offer Debian packages for their ordinary command requirements (`gh`, `jq`, `ripgrep`, `tmux`, `ffmpeg`, `curl`). Debian publishes these packages for bookworm, including arm64; examples: [ffmpeg](https://packages.debian.org/bookworm/ffmpeg), [curl](https://packages.debian.org/bookworm/curl), [tmux](https://packages.debian.org/bookworm/tmux).
- The catalog now honors a skill's declared `metadata.openclaw.os`, so macOS-only entries such as Peekaboo and Bear Notes are not advertised on Linux. Homebrew-only install choices are hidden on Linux when Homebrew is unavailable.
- The existing Himalaya Linux fallback uses its upstream install script rather than a missing default Debian package. It is unchanged in this candidate.

## Remaining work after Christen's test image

- Several upstream skills still have only a Homebrew install recipe, or no dashboard-installable Linux recipe. They should show a missing requirement without an unusable Install action. Validate their upstream Linux distribution and checksum or package source individually before adding automation; do not infer Linux support from a Homebrew formula.
- `sherpa-onnx-tts` declares a Linux x64 runtime download but no arm64 runtime download in the inspected metadata. Do not use the x64 artifact on arm64. Confirm an upstream arm64 release and checksum before offering an arm64 installer.
- `model-usage` documents Linux support but its published metadata provides only Homebrew. It can also consume exported JSON; a native Linux CLI installer needs separate validation.
- The dashboard's generic install command builder still executes multiple different install kinds when metadata mixes methods. Some skills need several packages, so choosing only one kind globally would break valid requirements. A later host-contract change should distinguish alternatives from cumulative requirements in metadata and tests.

## Evidence and limits

- `npm run typecheck` passed on the follow-up branch.
- `npx ts-node server/lib/skills.test.ts`: 60 passed, 0 failed, including Debian option, platform, and 1Password command assertions.
- `sh -n SYSTEM/install-1password-cli.sh` passed.
- Installation itself has not been run against a clean Debian arm64 image. The test image and a real `op --version` after installation are still required before reporting the path accepted.
