# ClawMax Known Issues & Limitations

**Last Updated**: June 10, 2026
**Current Version**: v1.7.9

---

## Active Issues For 1.8.x

### 1. System-test workspace isolation needs hardening

**Severity**: High
**Status**: Active `1.8.0` hardening item

Repeated integration runs should be deterministic and should not leak `clawmax-system-test` organizations, groups, communities, workflows, or agents into the personal/default workspace.

Current target:

- make system-test setup and teardown idempotent
- add visible regression coverage for cleanup/isolation
- replace manual post-run inspection with API-level assertions where practical

---

### 2. Gateway recovery is still too operator-driven

**Severity**: High
**Status**: Active `1.8.0` hardening item

When gateway is configured but unhealthy, users still need to know how to recover with `openclaw gateway restart`. The dashboard should make this recoverable from Doctor/System UI and avoid noisy probe logs during normal operation.

Current target:

- add an in-product Doctor restart action
- add route/helper tests for command execution and sanitized output
- reduce benign dashboard probe warnings

---

### 3. Runtime partner secret paths need continued regression coverage

**Severity**: High
**Status**: Active regression-safety item

`v1.7.9` fixed the most recent cloud/on-prem Resend chat/tool mismatch by forwarding runtime-managed `RESEND_API_KEY` into child tool execution and routing partner-secret chat through local execution. This path should stay explicitly covered because it is easy to regress when changing chat, workflow, or safe-env code.

Current target:

- keep Resend dashboard test-email and agent-chat email behavior aligned
- keep runtime-injected partner secrets covered for chat and workflow execution
- keep Cognee plugin runtime warnings filtered without hiding real errors

---

### 4. Cloud/on-prem logs and probe noise can still obscure diagnosis

**Severity**: Medium
**Status**: Active `1.8.x` follow-through

Logs are useful only if normal dashboard probes do not dominate them. Cloud/on-prem logs pane reconnect behavior and benign gateway/probe warnings still need review after the `1.7.x` runtime work.

Current target:

- reduce repeated benign warnings
- improve logs pane reconnect behavior
- keep real runtime/tool failures visible

---

### 5. Workflow and communication success can be misleading

**Severity**: Medium
**Status**: Planned `1.8.0`/`1.8.1` follow-through

Some workflow runs can appear green even when a participant failed to post to the intended group/channel, or when a template references a display label rather than a real communication id.

Current target:

- audit channel target resolution
- add regression coverage for display-name vs id lookup
- make workflow success criteria account for required communication failures
- surface upstream model/quota/auth failures before downstream noise

---

### 6. Client surfaces need simplification without feature loss

**Severity**: Medium
**Status**: Active simplification item

The old simplification branch shipped useful improvements, but real use after `1.7.x` exposed remaining density and discoverability issues in Agents, Notifications, mobile dropdowns, Activity/Budget, DocHub, Logs/System, Builder, and template apply.

Current target:

- prioritize Agents, Notifications, and mobile dropdowns for `1.8.0`
- add helper tests for deterministic UI logic where possible
- keep manual visual checks minimal and focused on layout fit

---

### 7. Skill/plugin safety needs stronger user-facing guardrails

**Severity**: Medium
**Status**: Planned `1.8.1` follow-through

Partner plugins and imported/AI-created skills can add binaries, network access, secrets handling, and machine-level commands. Current warnings are better than before but need a clearer risk taxonomy and stronger readiness states.

Current target:

- classify risky skills/plugins before install/import
- make command output visible for allowlisted partner plugin actions
- improve secret readiness before template apply or workflow run
- warn clearly when `OTP_DEV_MODE=log` is enabled outside dev/test

---

## Operational Notes

- Current open GitHub issue at sprint start: `#111` for demo video/docs refresh.
- Active sprint source of truth: [HARDENING_SIMPLIFICATION_1_8_X.md](planning/HARDENING_SIMPLIFICATION_1_8_X.md)
- Completed release work should move to [CHANGELOG.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/CHANGELOG.md), not remain active here.
