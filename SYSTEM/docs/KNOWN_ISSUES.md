# ClawMax Known Issues & Limitations

**Last Updated**: 2026-05-17
**Current Version**: v1.4.9

---

## Active Issues

### 1. Gateway process management
**Severity**: High
**Status**: Documented, needs CLI team fix

`SYSTEM/stop.sh` kills the shared gateway (port 18789), leaving agents unable to communicate. Agents show offline even though config is fine. Workaround: `openclaw gateway restart` after stop/start.

**Fix needed**: Process supervisor (pm2/systemd), stop.sh should not kill gateway, start.sh should verify gateway.

---

### 2. Agent chat requires ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION
**Severity**: Low
**Status**: By design

Agent execution (chat, workflows) requires either BYOK keys, `USER_*` defaults, or `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true` in `.env`. Without this, agents fail with "No execution API keys configured".

---

### 3. Ollama UI visibility and runtime env can be confused
**Severity**: Medium
**Status**: Known limitation / operator gotcha

The dashboard uses `DASHBOARD_ENABLE_OLLAMA` only to control whether Ollama appears in the UI. Actual execution paths read `OLLAMA_BASE_URL`. Browser-local BYOK / Workspaces Integrations settings can make Ollama appear configured in the UI, but operator-managed local runtimes should still set `OLLAMA_BASE_URL` in `SYSTEM/dashboard/.env` for a stable server/runtime path after restart. `DASHBOARD_OLLAMA_BASE_URL` is not a recognized runtime env var.

---

### 4. DAG connector lines overlap nodes on complex layouts
**Severity**: Low (cosmetic)
**Status**: Known limitation

SVG bezier curves can pass through nodes when the layout has many parallel workflows at different vertical positions. Planned fix: route lines around node bounding boxes.

---

### 5. `SYSTEM/test.sh integration --with-validation` can fail creating the system-test workspace
**Severity**: Medium
**Status**: Known issue, defer to Friday hardening

The integration suite can still report:

- `Failed to create system test workspace`

while continuing to activate/apply into `clawmax-system-test`. The rest of the suite may pass, but the run still ends `149/150` because setup is not deterministic enough.

Observed path:

- `DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test.sh integration --with-validation`

Likely cause:

- stale on-disk `clawmax-system-test` workspace residue
- incomplete cleanup/reset between repeated integration runs

Workaround:

- use the current run as informational if this is the only failure
- clean the system-test workspace directory/state before rerunning when strict green is required

Planned fix:

- tighten system-test workspace setup/cleanup during Friday hardening so repeated runs are deterministic

---

### 6. Integration system-test artifacts can bleed into the personal workspace
**Severity**: High
**Status**: Known issue, needs workspace-isolation + cleanup hardening

After running:

- `DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test.sh integration --with-validation`

the `clawmax-system-test` organization/community/group artifacts can appear in the personal workspace UI, even though the test suite is supposed to isolate and clean up its own workspace.

Observed symptoms:

- system-test organization/groups/communities show up while viewing the personal workspace
- the test workspace does not fully clean up its org/community artifacts after the run
- manual deletion is sometimes required before real user testing can continue cleanly

Likely cause:

- workspace isolation is incomplete for ORG/COMMUNITIES/GROUPS reads
- and/or the integration suite does not fully remove system-test channel/org artifacts on teardown

Workaround:

- manually delete the leaked system-test communities/groups before continuing personal-workspace testing
- prefer a clean manual workspace baseline after the integration suite if template/apply testing is next

Planned fix:

- harden system-test teardown so communities/groups/org artifacts are removed deterministically
- verify all organization/channel reads are scoped strictly to the active workspace

---

### 7. OTP email delivery can fail transiently at the provider layer
**Severity**: Medium
**Status**: Known operational limitation

In `email_otp` mode, the login request can reach the dashboard successfully but the provider can still reject the outbound email send with a transient server-side error.

Observed symptom:

- dashboard logs `Resend rejected OTP email`
- login returns a server-side OTP send failure even though OTP env looks correct

What this usually means:

- provider-side transient failure
- sender/domain state problem
- or instance-specific secret/account mismatch

Workaround:

- retry once to rule out a transient provider incident
- compare the logged OTP provider key fingerprint between working and failing instances
- verify `OTP_FROM_EMAIL` / `SIGNUP_FROM_EMAIL` sender-domain state for the account behind the current API key
- use `OTP_DEV_MODE=log` for local/dev validation when you need to separate UI flow testing from live email delivery

---

### 8. Tessl registry support is exploratory and some tiles still require manual security review
**Severity**: Medium
**Status**: Experimental feature, improving

The Skills page now supports searching and importing Tessl registry tiles for OpenClaw workspaces, but this path is still exploratory. Some Tessl tiles:

- require Tessl-side security approval before install
- produce tile layouts we have not fully validated yet
- may need reinstall/override cleanup if an earlier exploratory import left stale workspace state behind

Observed symptom:

- install reports a Tessl security-review blocker
- or the imported tile requires another pass before it appears cleanly under `User Skills`

Current behavior:

- qualified tile resolution is handled automatically where possible
- duplicate Tessl result shapes are deduped
- security-review blockers now surface more clearly instead of failing with a generic import error

Workaround:

- prefer known-safe tested Tessl tiles first
- if Tessl blocks install for security review, complete that review in Tessl before retrying
- if a previous exploratory import left stale workspace state, delete the user skill and reinstall

---

## Resolved Recently (v1.4.0 line)

- **Compact dashboard upward reorder** — compact layout editor now supports reliable same-column upward reordering without falling through to the column-level append target
- **.toFixed() crashes** — guarded all undefined access across Activity, Agents, Workflows pages
- **OAuth button when not configured** — shows setup instructions instead of broken button
- **System.* null access in TopBar** — all system fields use optional chaining
- **Agent import without files** — generates IDENTITY.md from template data
- **Workflow creation for managed mode** — auto-assigns owner
- **Dismissed notifications reappearing** — dedup now includes dismissed
- **Agent status offline for shared gateway** — probes port 18789 as fallback
- **AI generator with Anthropic-only keys** — auto-detects provider, maps models

## Source of Truth

- Active backlog: [BACKLOG.md](./BACKLOG.md)
- Current state: [STATUS.md](./STATUS.md)
- Testing: [TESTING_GUIDE.md](./TESTING_GUIDE.md)
