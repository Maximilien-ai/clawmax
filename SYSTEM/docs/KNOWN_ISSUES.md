# ClawMax Known Issues & Limitations

**Last Updated**: 2026-03-22
**Current Version**: v1.1.8

This document tracks current known issues, limitations, and the intended next move.

---

## Critical / Near-Term

### 1. GitHub Actions clean-room stability
**Severity**: High
**Status**: In progress

**Description**:
CI now runs on `main`, but the clean-room path is still being normalized so it does not assume seeded demo agents, activity, or docs.

**Current direction**:
- isolate filesystem-sensitive unit tests
- keep `SYSTEM/test.sh` strict on contracts, but not on optional seeded content
- confirm a full green `main` run before treating GitHub CI as release-trustworthy

---

### 2. OAuth clean-room verification
**Severity**: Medium
**Status**: Pending final verification

**Description**:
GitHub OAuth is working locally, but still needs one full clean-room setup pass on a fresh machine/environment.

**Notes**:
- callback stays on dashboard server origin
- app redirect should return to dashboard app origin
- logout/login loop stability needs one final explicit clean-room check

---

## Product / UX Gaps

### 3. Workflow table view for scale
**Severity**: Medium
**Status**: Planned

**Description**:
Agents, templates, and communication now have stronger large-scale list/table handling. Workflows still need the same treatment for sorting, selection, and bulk management at higher counts.

---

### 4. Secure per-user BYOK storage
**Severity**: Medium
**Status**: Deferred by design

**Description**:
Current BYOK is a preview/dev flow. It proves execution policy and UI, but it is not final secure multi-user secret storage.

**Current behavior**:
- browser preview storage for testing
- `USER_*` env defaults supported
- `SYSTEM_*` env vars reserved for dashboard/system-owned actions

**Next step**:
- define durable secret storage model before calling BYOK production-ready

---

### 5. Workflow cron reliability
**Severity**: Medium
**Status**: Open

**Description**:
Workflow cron exists, but consolidation and long-term reliability are still unresolved. Current backlog item remains to decide whether to keep the current path or migrate more fully to OpenClaw-native scheduling.

---

## Stale Issue Tracker Warning

Several GitHub issues remain open even though code has already landed locally and on `main`. Before triaging new work, verify issue state against:

- `CHANGELOG.md`
- `SYSTEM/docs/BACKLOG.md`
- latest `main`

Likely stale/fixed issues to close soon:
- `#38`
- `#31`
- `#30`
- `#28`
