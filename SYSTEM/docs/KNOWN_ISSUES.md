# ClawMax Known Issues & Limitations

**Last Updated**: 2026-05-12
**Current Version**: v1.4.7

---

## Active Issues

### 1. On-prem embedded gateway health can false-negative
**Severity**: Medium
**Status**: Under investigation

Some on-prem runtimes still report the embedded gateway as degraded even when the dashboard is healthy and agent interactions continue to work. This appears to be a health/probe-contract problem rather than a full runtime outage.

---

### 2. On-prem metering/runtime identity needs explicit per-instance separation
**Severity**: Medium
**Status**: Coordinating with CLI/runtime line

On-prem instances should be keyed by `instance_key` and/or `machine_id`, not a shared generic runtime hostname, so metering and identity do not drift across Macs.

---

### 3. On-prem Ollama visibility depends on full runtime contract
**Severity**: Medium
**Status**: In progress

On-prem surfaces should only show Ollama as configured when the runtime both enables Ollama and exposes a reachable default Ollama base URL into the dashboard/runtime.

---

### 4. New shared clusters require automated DNS/TLS provisioning
**Severity**: High
**Status**: Operational gap identified

When new shared clusters such as `lon1-2` appear, public DNS wildcard and TLS issuance must be provisioned automatically. Without that automation, runtime health can be good in-cluster while public health checks fail.

## Resolved Recently (v1.4.5–v1.4.7)

- **Template delete confirmation** — dashboard now confirms destructive template deletes.
- **Template onboarding wizard** — multi-step apply flow landed for template onboarding.
- **Workflow markdown import** — markdown-native workflow import landed.
- **Integrations validation surfacing** — dashboard now surfaces validation/runtime follow-through state more clearly.

## Source of Truth

- Active backlog: [BACKLOG.md](./BACKLOG.md)
- Current state: [STATUS.md](./STATUS.md)
- Testing: [TESTING_GUIDE.md](./TESTING_GUIDE.md)
