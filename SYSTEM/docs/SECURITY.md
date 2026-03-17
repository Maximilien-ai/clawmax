# ClawMax Dashboard Security Architecture

## Overview

ClawMax Dashboard provides a web-based interface for managing OpenClaw agents. Security is paramount as the dashboard enables direct interaction with agent gateways that can execute commands and access sensitive data.

**Last Updated:** 2026-03-03
**Dashboard Version:** v1.1.0
**OpenClaw Protocol:** Version 3

NOTE: avoid duplication with other docs unless on purpose for adding context of keeping track of work done.
NOTE: very important document since security is the issue that will be asked for the most by users and eventually clients of ClawMax.ai

---

## Security Model

### 1. Authentication & Authorization

#### Gateway Token Authentication
- **Implementation:** Each agent gateway requires a token stored in `~/.openclaw/agents/<agent-id>/gateway.token`
- **Token Format:** Random UUIDs generated during gateway setup
- **Transmission:** Tokens are sent via WebSocket auth frames during the challenge-response handshake
- **Storage:** Tokens are read server-side only; never exposed to the frontend

**Location:** `server/lib/workspace.ts:getAgentGatewayConfig()`

#### Control UI Client Mode
- **Client ID:** `openclaw-control-ui` (special privileged client)
- **Mode:** `ui` (distinguishes from CLI clients)
- **Scopes:** `['operator.admin', 'operator.write', 'operator.read']`
- **Rationale:** Control UI clients receive full operator scopes for dashboard operations

**Locations:**
- `server/routes/chat.ts:146-155`
- `server/routes/logs.ts:58-68, 219-228`

#### Scope-Based Permissions
OpenClaw Gateway implements scope-based access control:
- `operator.admin` - Full administrative access
- `operator.write` - Can send commands and modify state
- `operator.read` - Read-only access to status and logs

**Known Issue:** Gateway clears scopes when no device identity is provided. We currently use the `allowInsecureAuth` workaround for localhost development.

### 2. Network Security

#### WebSocket Security
- **Protocol:** WSS not yet implemented - currently using WS over localhost
- **Origin Validation:** Gateway requires proper Origin headers
- **Binding:** Gateway binds to `127.0.0.1` only (localhost)
- **Port Assignment:** Dynamic port per agent (stored in gateway config)

**Security Gap:** No TLS encryption on WebSocket connections. Acceptable for localhost-only binding, but prevents remote access.

**Locations:**
- `server/routes/chat.ts:111-115`
- `server/routes/logs.ts:30-34, 188-192`

#### Challenge-Response Authentication
OpenClaw Gateway Protocol v3 implements challenge-response:
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

**Security Consideration:** SSE responses are not authenticated independently. Authentication happens at the WebSocket level.

**Location:** `server/routes/chat.ts:87-105`

#### Log Streaming
- **Protocol:** SSE over HTTP
- **Filtering:** No server-side log filtering currently implemented
- **Volume:** Limited to last 100 lines by default

**Security Gap:** Logs may contain sensitive information. No PII redaction currently implemented.

**Location:** `server/routes/logs.ts:153-331`

### 4. Data Protection

#### Session Management
- **Session IDs:** Generated client-side: `dashboard-${agentId}-${Date.now()}`
- **Idempotency:** Each chat request includes unique idempotency key
- **Storage:** No persistent session storage; sessions exist only during active connections

**Location:** `client/src/components/AgentChatPanel.tsx:22, 194`

#### Message Validation
- **Agent ID Validation:** Regex: `/^[a-z][a-z0-9_-]*$/`
- **Input Sanitization:** Basic validation, no XSS protection needed (React handles escaping)
- **Length Limits:** No explicit length limits on messages

**Locations:**
- `server/routes/chat.ts:72-74`
- `server/routes/logs.ts:157-159`

### 5. Frontend Security

#### XSS Prevention
- **Framework:** React automatically escapes all rendered content
- **User Input:** All chat messages rendered as text, not HTML
- **Markdown:** No markdown rendering that could enable XSS

#### CSRF Protection
- **Not Implemented:** No CSRF tokens currently
- **Risk:** Low - API only accessible from localhost
- **Mitigation:** Origin header validation at gateway level

#### Sensitive Data Exposure
- **Gateway Tokens:** Never sent to frontend
- **Port Numbers:** Exposed in status API (acceptable for localhost)
- **Logs:** Full logs streamed to frontend without redaction

---

## Known Security Issues & Limitations

### Critical Issues
None currently identified.

### High Priority

#### 1. allowInsecureAuth Workaround
- **Issue:** Required `allowInsecureAuth: true` in gateway config for localhost without device pairing
- **Impact:** Bypasses device identity validation
- **Mitigation:** Only enabled for localhost; gateway still requires token auth
- **Status:** Acceptable for local development; should be addressed for production
- **Tracking:** [Issue #1](https://github.com/OpenClaw/clawmax-dashboard/issues/1) (to be created)

#### 2. No TLS on WebSocket Connections
- **Issue:** WebSocket connections use WS not WSS
- **Impact:** Unencrypted communication
- **Mitigation:** Localhost-only binding prevents remote eavesdropping
- **Status:** Blocks remote dashboard access
- **Tracking:** [Issue #2](https://github.com/OpenClaw/clawmax-dashboard/issues/2) (to be created)

### Medium Priority

#### 3. Log PII Exposure
- **Issue:** Logs streamed without PII redaction
- **Impact:** Sensitive data may be exposed in logs
- **Mitigation:** Logs only accessible via authenticated gateway connection
- **Status:** Should implement redaction for production use
- **Tracking:** [Issue #3](https://github.com/OpenClaw/clawmax-dashboard/issues/3) (to be created)

#### 4. No Rate Limiting
- **Issue:** No rate limiting on chat or API endpoints
- **Impact:** Possible DoS via rapid requests
- **Mitigation:** Localhost-only access limits attack surface
- **Status:** Low priority for local development
- **Tracking:** [Issue #4](https://github.com/OpenClaw/clawmax-dashboard/issues/4) (to be created)

#### 5. Stream Completion Detection
- **Issue:** Using 2-second timeout to detect stream completion
- **Impact:** May prematurely close slow responses or leave fast responses hanging
- **Mitigation:** 2s is reasonable for typical chat responses
- **Status:** Works in practice; should monitor for edge cases
- **Tracking:** See chat.ts:245

### Low Priority

#### 6. No CSRF Tokens
- **Issue:** No CSRF protection on API endpoints
- **Impact:** Potential CSRF attacks
- **Mitigation:** API only accessible from localhost; low risk
- **Status:** Consider for future remote access
- **Tracking:** [Issue #5](https://github.com/OpenClaw/clawmax-dashboard/issues/5) (to be created)


NOTE: make sure to update this if / when we update SECURITY_ISSUES.md

---

## OpenClaw Protocol Security

### Protocol Version 3
ClawMax Dashboard implements OpenClaw Gateway Protocol Version 3:
- Negotiates protocol version during connect (minProtocol: 3, maxProtocol: 3)
- Uses challenge-response authentication
- Supports scope-based authorization
- Event-driven message format

**Reference:** OpenClaw Gateway Protocol Specification v3

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

NOTE: love this can we include a sentence summarizing this in blog in the security section since we will include limitations but we want to make sure reader knows that we want to and are practicing good security higiene.

---

## Upgrading OpenClaw for Security

### Current Status
- **Dashboard:** v0.8.8
- **OpenClaw:** Using system installation
- **Gateway Protocol:** v3

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
Dashboard currently requires Protocol v3. If OpenClaw upgrades to v4:
1. Update `minProtocol` and `maxProtocol` in connect requests
2. Test backward compatibility with v3
3. Update message handlers for new event types
4. Document migration path

**Locations to update:**
- `server/routes/chat.ts:143-156`
- `server/routes/logs.ts:54-69, 214-230`

---

## Security Checklist for Deployment

### Pre-Production
- [ ] Implement TLS for WebSocket connections (WSS)
- [ ] Add CSRF token validation
- [ ] Implement rate limiting
- [ ] Add PII redaction in log streaming
- [ ] Remove `allowInsecureAuth` workaround
- [ ] Add authentication layer for dashboard access
- [ ] Implement proper device pairing
- [ ] Add audit logging for security events
- [ ] Security penetration testing

### Production Monitoring
- [ ] Monitor for failed authentication attempts
- [ ] Track unusual chat patterns
- [ ] Alert on gateway connection failures
- [ ] Log all security-relevant events
- [ ] Regular security audits
- [ ] Keep OpenClaw updated

NOTE: is this part of our plan to address. Should we have a FAQ.md to include these and other FAQ?

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
- [ClawMax Dashboard Architecture](./docs/ARCHITECTURE.md)
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
