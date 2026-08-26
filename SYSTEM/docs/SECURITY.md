# ClawMax Dashboard Security Architecture

## Overview

ClawMax Dashboard provides a web-based interface for managing OpenClaw agents. Security is paramount as the dashboard enables direct interaction with agent gateways that can execute commands and access sensitive data.

**Last Updated:** 2026-08-24
**Dashboard Version:** stable v1.9.9; 2.0 RC43 candidate on `main`
**OpenClaw Protocol:** Version 4

The completed 2.0 threat model, endpoint matrix, findings, scans, and source
sign-off are under [`security/`](security/SECURITY_REVIEW_2_0_RC38.md). This page
is the reusable architecture overview, not the release evidence record.

---

## Security Model

### 1. Authentication & Authorization

#### Dashboard And Gateway Authentication
- Dashboard API and SSE routes require a GitHub OAuth, Email OTP, or configured
  legacy dashboard-token session.
- Cloud deployments reject local bypass flags. Explicit local/on-prem bypass is
  a single-user operator mode and emits a visible startup warning.
- OpenClaw gateway credentials are read server-side and never exposed to the
  frontend. The CLI/gateway handles device identity, challenge-response, and
  agent routing.

**Location:** `server/lib/workspace.ts:getAgentGatewayConfig()`

#### Gateway Administrative Client
- **Client ID:** `openclaw-control-ui`
- **Mode:** `ui`
- **Scopes:** bounded administrative/read/write scopes required by the server-side gateway client
- **Rationale:** only authenticated dashboard routes can ask the server-side client to perform these operations

**Locations:**
- `server/routes/chat.ts:146-155`
- `server/routes/logs.ts:58-68, 219-228`

#### Scope-Based Permissions
OpenClaw Gateway implements scope-based access control:
- `operator.admin` - Full administrative access
- `operator.write` - Can send commands and modify state
- `operator.read` - Read-only access to status and logs

The primary chat path uses the OpenClaw CLI, which owns gateway authentication
and device identity. Direct gateway clients remain server-side.

### 2. Network Security

#### WebSocket Security
- **Protocol:** WS is restricted to local/container gateway networking; remote dashboard traffic terminates TLS at the ingress/reverse proxy
- **Origin Validation:** Gateway requires proper Origin headers
- **Binding:** Gateway binds to `127.0.0.1` only (localhost)
- **Port Assignment:** Dynamic port per agent (stored in gateway config)

Do not expose a local gateway port directly to an untrusted network. Remote
deployment support is through the authenticated dashboard behind TLS, not a
public gateway socket.

**Locations:**
- `server/routes/chat.ts:111-115`
- `server/routes/logs.ts:30-34, 188-192`

#### Challenge-Response Authentication
OpenClaw Gateway Protocol v4 implements challenge-response:
1. Client connects to WebSocket
2. Gateway sends `connect.challenge` event with nonce
3. Client responds with `connect` request including token and nonce
4. Gateway validates and returns success/failure

**Location:** `server/routes/chat.ts:172-180`

### 3. Server-Sent Events (SSE)

#### Chat Streaming
- **Protocol:** SSE over HTTP
- **Validation:** Messages validated and sanitized before relay
- **Completion Detection:** 2-second inactivity timeout to detect stream completion
- **Cleanup:** Proper resource cleanup on disconnect

**Security control:** the parent `/api/agents` router requires dashboard auth
before the SSE handler runs. The downstream CLI/gateway then performs its own
runtime authentication.

**Location:** `server/routes/chat.ts:87-105`

#### Log Streaming
- **Protocol:** authenticated SSE over HTTP
- **Volume:** bounded tail output
- **Audit:** access is recorded without storing raw bearer tokens

Logs can still contain sensitive content emitted by third-party runtimes or
skills. Treat access to System & Logs as operator-level and avoid logging
credentials or message bodies in integrations.

**Location:** `server/routes/logs.ts:153-331`

### 4. Data Protection

#### Session Management
- Dashboard authentication cookies are HTTP-only, `SameSite=Lax`, and secure
  when the request is HTTPS.
- Chat uses explicit OpenClaw session ids and persisted runtime history; a
  bounded fresh-session retry recovers embedded-session conflicts without
  replaying visible partial output.
- Logout clears dashboard session state.

**Location:** `client/src/components/AgentChatPanel.tsx:22, 194`

#### Message Validation
- **Agent ID Validation:** Regex: `/^[a-z][a-z0-9_-]*$/`
- **Input Sanitization:** Basic validation, no XSS protection needed (React handles escaping)
- **Body limits:** Express JSON parsing uses its bounded default; runtime and
  provider adapters apply operation-specific result and timeout bounds

**Locations:**
- `server/routes/chat.ts:72-74`
- `server/routes/logs.ts:157-159`

### 5. Frontend Security

#### XSS Prevention
- **Framework:** React automatically escapes all rendered content
- **User Input:** All chat messages rendered as text, not HTML
- **Markdown:** No markdown rendering that could enable XSS

#### Cross-Site Request Protection
- Credentialed CORS accepts only explicitly configured dashboard origins.
- Authentication cookies use `SameSite=Lax` and production secure attributes.
- APIs return `no-store`; the dashboard denies framing and suppresses referrers.
- There is no separate synchronizer CSRF token. Any future cross-site embedding
  or third-party cookie mode requires revisiting this decision.

#### Sensitive Data Exposure
- **Gateway Tokens:** Never sent to frontend
- **Port Numbers:** Exposed in status API (acceptable for localhost)
- **Logs:** Full logs streamed to frontend without redaction

---

## Known Security Issues & Limitations

The 2.0 review found no Critical issue and closed all eight High findings. Three
Medium deployment/supply-chain risks are accepted with September 30, 2026
follow-ups: root container execution, major-tag GitHub Actions, and disabled OCI
provenance. See the
[`2.0 findings register`](security/SECURITY_FINDINGS_2_0.md) for owners,
controls, and evidence.

Reusable limitations remain:

- third-party/runtime logs can contain sensitive content and are operator-only;
- direct local gateway WS must not be exposed outside trusted host/container
  networking;
- imported executable skills and plugins require explicit operator trust; and
- the dashboard does not use synchronizer CSRF tokens, so its strict origin and
  cookie assumptions must remain intact.


---

## OpenClaw Protocol Security

### Protocol Version 4
ClawMax Dashboard implements OpenClaw Gateway Protocol Version 4:
- Negotiates protocol version during connect (minProtocol: 4, maxProtocol: 4)
- Uses challenge-response authentication
- Supports scope-based authorization
- Event-driven message format

**Reference:** OpenClaw Gateway Protocol Specification v4

### Message Format
```typescript
// Request
{
  type: 'req',
  id: '<uuid>',
  method: 'chat.send' | 'logs.tail' | 'status',
  params: { ...}
}

// Response
{
  type: 'res',
  id: '<uuid>',
  ok: boolean,
  payload?: any,
  error?: { message: string }
}

// Event
{
  event: 'agent' | 'health' | 'log' | 'connect.challenge',
  payload?: any
}
```

### Supported Methods
- `connect` - Initial authentication
- `chat.send` - Send chat message to agent
- `logs.tail` - Tail agent logs
- `status` - Get gateway status

---

## Security Best Practices Implemented

### ✅ Principle of Least Privilege
- Scope-based access control
- Gateway tokens unique per agent
- Server-side token storage only

### ✅ Defense in Depth
- Gateway token auth
- Origin header validation
- Agent ID validation
- Localhost-only binding

### ✅ Secure by Default
- No remote access without TLS
- Tokens auto-generated during setup
- Minimal attack surface

### ✅ Resource Cleanup
- AbortController for canceling requests
- Proper WebSocket cleanup on disconnect
- SSE stream cleanup on client disconnect

### ✅ Input Validation
- Agent ID regex validation
- Message type validation
- Protocol version negotiation

---

## Upgrading OpenClaw for Security

### Current Status
- **Stable dashboard:** v1.9.9 with OpenClaw `v2026.6.11`
- **2.0 development candidate:** OpenClaw `v2026.6.34`
- **Gateway Protocol:** v4

### Upgrade Process
```bash
# 1. Check current OpenClaw version
openclaw --version

# 2. Update OpenClaw
brew update && brew upgrade openclaw  # or appropriate package manager

# 3. Restart agent gateways
openclaw gateway restart --all

# 4. Verify protocol compatibility
# Dashboard will show error if protocol version mismatch

# 5. Test critical features
# - Chat with agents
# - View Status & Logs
# - Agent list and details
```

### Monitoring for Security Updates
- Watch [OpenClaw GitHub Releases](https://github.com/OpenClaw/openclaw/releases)
- Subscribe to security advisories
- Check for gateway protocol version updates
- Review breaking changes in release notes

### Protocol Version Compatibility
Dashboard currently requires Protocol v4. If OpenClaw upgrades again:
1. Update `minProtocol` and `maxProtocol` in connect requests
2. Test backward compatibility or required migration behavior explicitly
3. Update message handlers for new event types
4. Document migration path in the OpenClaw upgrade runbook

**Locations to update:**
- `server/routes/chat.ts:143-156`
- `server/routes/logs.ts:54-69, 214-230`

---

## Security Checklist for Deployment

### Pre-Production
- [ ] Terminate dashboard HTTP/WebSocket traffic with TLS at the ingress
- [ ] Configure the exact dashboard origin allowlist
- [x] Enforce dashboard authentication and cloud bypass rejection
- [x] Enforce global and auth-specific rate limits
- [x] Record API audit metadata without raw bearer tokens
- [x] Apply response security and no-store API headers
- [ ] Review operator/runtime logs for deployment-specific sensitive output
- [ ] Confirm local gateway ports are not publicly exposed
- [ ] Security penetration testing

### Production Monitoring
- [ ] Monitor for failed authentication attempts
- [ ] Track unusual chat patterns
- [ ] Alert on gateway connection failures
- [ ] Log all security-relevant events
- [ ] Regular security audits
- [ ] Keep OpenClaw updated

---

## Reporting Security Issues

**DO NOT** create public GitHub issues for security vulnerabilities.

For security issues in ClawMax Dashboard:
- Email: security@maximilien.ai (if applicable)
- Create private security advisory on GitHub

For security issues in OpenClaw Gateway:
- Follow OpenClaw's security reporting process
- Check OpenClaw repository for SECURITY.md

---

## References

- [OpenClaw Gateway Protocol Specification](https://docs.openclaw.com/protocol)
- [OpenClaw Security Documentation](https://docs.openclaw.com/security)
- [ClawMax Documentation Index](README.md)
- [React Security Best Practices](https://react.dev/learn/security)

---

## Changelog

### 2026-03-03 - v0.8.8
- Initial security documentation
- Documented Control UI client mode implementation
- Identified `allowInsecureAuth` workaround
- Added stream completion detection (2s timeout)
- Documented scope-based authorization model
- Created GitHub issue tracking list
