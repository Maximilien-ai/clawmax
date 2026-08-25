# ClawMax Known Issues And Limitations

**Last Updated**: August 25, 2026
**Stable Version**: v1.9.9
**Development Track**: 2.0.0 on `main`

## Active Issues

This document lists confirmed product limitations that remain relevant to the
active release tracks. Historical snapshots are kept under
[`archive/`](archive/).

## Runtime And Workflows

### Workflow communication can partially fail

A workflow can complete while an individual participant fails to post to its
required group or channel. Continue tightening communication-target resolution,
per-participant failure reporting, and the workflow success criteria.

### Shared live workflow context is limited

Participants in one workflow run do not always see peer replies during their
own execution window. Dashboard-backed thread posting works, but true live
shared-thread reasoning remains a runtime limitation.

### Local-model feedback is slow and coarse

Local models can have long silent periods before returning a complete response,
and instruction-following quality varies significantly by model. Progress UI
and local-model guidance need further work.

### Built-runtime gateway durability needs more validation

Cloud and on-prem startup is substantially more reliable, but durable gateway
supervision and reconnect behavior still require repeated real-environment
validation. Logs can remain noisy during reconnect windows.

### Long-running Podman instances can retain resources

RC40 soak evidence showed memory and PID growth that reset after restart. Track
the reproducible investigation in [issue #187](https://github.com/Maximilien-ai/clawmax/issues/187) and require a new external soak before 2.0 promotion; a healthy short smoke does not close this issue.

## Workspace And Data Surfaces

### Delete and reapply can leave conflicting residue

Deleting or archiving a generated company and applying another template in the
same workspace can still expose stale agent, workflow, group, or output state.
Conflict preflight and cleanup remain active hardening work.

### DocHub navigation still has ambiguous-path edge cases

Most file-open paths are normalized, but links that provide only a basename can
remain ambiguous when the same filename exists in multiple workspace folders.

### Local metering can under-report usage

Some fresh local workspaces can show successful calls while token and cost
totals remain zero. Opik-backed and local aggregation paths still need alignment.

### Browser-local secrets are not agent-runtime credentials

Values saved under browser-local Workspace or Global Keys cannot be referenced by
agent chat. Runtime use requires a compatible assigned skill plus an explicit,
scoped broker grant or a supported integration-managed credential flow. Normal
mailbox passwords must not be requested or forwarded into an agent environment.

### Imported skills and plugins remain a trust boundary

Skills and plugins can add executable behavior, network access, and credential
use. Continue improving permission review, readiness diagnostics, command-output
visibility, and risk classification before enabling third-party capabilities.

## 2.0 Plugin Platform

The 2.0 work on `main` is a development track, not a production release.
The current v2 contract is intentionally declarative and does not execute
arbitrary frontend bundles or unrestricted server code.

Before promotion, 2.0 still needs:

- a documented decision and test for the supported manifest-action boundary;
- final zero-plugin, synthetic external-plugin, Lifecycle, and Review gates;
- local, managed/cloud, and on-prem restart/persistence validation;
- final plugin page/data loading and responsive checks;
- an exported release review plus the final RC38 security image/runtime appendix.

The plugin manager and public/private multi-architecture packaging baseline are
implemented. RC34 passed public and authorized combined image smoke; the final
candidate must repeat those gates after the last release change.

The source security review and findings register are complete with no open
Critical/High finding. This does not replace final-candidate image, restart,
cloud/on-prem, and exact-digest evidence.

Private plugins remain external to this repository and are never enabled by
default in the public image. Lifecycle and Review are the current public product
plugins; similarly named `plugin-*` content is synthetic test coverage and
does not contain private product source.

## Tracking

- Active work: [BACKLOG.md](BACKLOG.md)
- Release state: [STATUS.md](STATUS.md)
- 2.0 architecture: [PLUGIN_SYSTEM_2_0.md](../../PLUGINS/PLUGIN_SYSTEM_2_0.md)
- Current launch plan: [RELEASE_2_0_0_LAUNCH_2026-08-24.md](planning/RELEASE_2_0_0_LAUNCH_2026-08-24.md)
- GitHub issues: [Maximilien-ai/clawmax/issues](https://github.com/Maximilien-ai/clawmax/issues)
