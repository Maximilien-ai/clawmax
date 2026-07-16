# ClawMax Known Issues And Limitations

**Last Updated**: July 15, 2026

**Stable Version**: v1.9.7

**Development Tracks**: 1.9.8 / 1.9.9 and 2.0.0

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

## 2.0 Plugin Platform

The `release-2.0.0` branch is a development track, not a production release.
The current v2 contract is intentionally declarative and does not execute
arbitrary frontend bundles or unrestricted server code.

Before promotion, 2.0 still needs:

- host-mediated actions and permission enforcement
- external plugin packaging validation across local, cloud, and on-prem
- actionable diagnostics for missing, disabled, incompatible, or unhealthy plugins
- removal of remaining product-specific MVP0 adapters
- a full zero-plugin and synthetic external-plugin release gate

Private plugins remain external to this repository and are never enabled by
default in the public image.

## Tracking

- Active work: [BACKLOG.md](BACKLOG.md)
- Release state: [STATUS.md](STATUS.md)
- 2.0 architecture: [PLUGIN_SYSTEM_2_0.md](../../PLUGINS/PLUGIN_SYSTEM_2_0.md)
- GitHub issues: [Maximilien-ai/clawmax/issues](https://github.com/Maximilien-ai/clawmax/issues)
