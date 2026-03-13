# Security Issues Tracking

This document tracks security improvements identified in SECURITY.md that should be addressed.

---

## Issue #1: Remove allowInsecureAuth Workaround

**Priority:** High
**Status:** Open
**Assigned:** Unassigned

### Description
Currently using `allowInsecureAuth: true` in gateway config to bypass device identity validation for localhost access.

### Impact
- Bypasses device pairing security mechanism
- Only affects localhost connections
- Still requires token authentication

### Proposed Solution
1. Implement proper device pairing for Control UI client
2. Generate and register device identity for dashboard
3. Store device credentials securely
4. Remove `allowInsecureAuth` configuration

### Implementation Notes
- Check OpenClaw docs for device pairing protocol
- May need to add device registration UI
- Consider auto-pairing for localhost
- Update chat.ts and logs.ts connection logic

### References
- `~/.openclaw/openclaw.json` gateway.controlUi.allowInsecureAuth
- SECURITY.md High Priority Issue #1

---

## Issue #2: Implement TLS for WebSocket Connections

**Priority:** High
**Status:** Open
**Assigned:** Unassigned

### Description
WebSocket connections currently use WS protocol without encryption. Need to implement WSS (WebSocket Secure) for production use.

### Impact
- Unencrypted communication between dashboard and gateway
- Prevents secure remote access to dashboard
- Currently mitigated by localhost-only binding

### Proposed Solution
1. Configure OpenClaw Gateway to support WSS
2. Generate/obtain TLS certificates
3. Update dashboard WebSocket URLs to use wss://
4. Add certificate validation
5. Support both WS (localhost) and WSS (remote) modes

### Implementation Notes
- May require OpenClaw Gateway configuration changes
- Consider Let's Encrypt for certificates
- Add environment variable for WS vs WSS mode
- Update connection logic in chat.ts and logs.ts

### Blocked By
- May need OpenClaw Gateway SSL support
- Check OpenClaw roadmap for WSS support

### References
- `server/routes/chat.ts:111`
- `server/routes/logs.ts:30, 188`
- SECURITY.md High Priority Issue #2

---

## Issue #3: Implement Log PII Redaction

**Priority:** Medium
**Status:** Open
**Assigned:** Unassigned

### Description
Agent logs are streamed to frontend without any PII (Personally Identifiable Information) redaction. Logs may contain sensitive data like emails, API keys, file paths, etc.

### Impact
- Sensitive information exposed in dashboard UI
- Logs accessible to anyone with gateway access
- Privacy compliance concerns for production use

### Proposed Solution
1. Implement server-side log filtering/redaction
2. Create configurable redaction patterns (regex)
3. Redact common PII patterns:
   - Email addresses
   - API keys/tokens
   - File system paths (optional)
   - IP addresses (optional)
4. Add toggle to view redacted vs full logs (with auth)

### Implementation Notes
- Add redaction logic in logs.ts SSE stream
- Consider performance impact of regex matching
- Allow configuration of redaction patterns
- Balance security vs debugging needs

### References
- `server/routes/logs.ts:153-331`
- SECURITY.md Medium Priority Issue #3

---

## Issue #4: Add Rate Limiting

**Priority:** Medium
**Status:** Open
**Assigned:** Unassigned

### Description
No rate limiting on chat or API endpoints. Could enable DoS attacks via rapid requests.

### Impact
- Possible denial of service via request flooding
- Gateway resource exhaustion
- Currently mitigated by localhost-only access

### Proposed Solution
1. Implement rate limiting middleware
2. Limit requests per IP/session:
   - Chat messages: 10/minute
   - Status checks: 30/minute
   - Log streaming: 5 concurrent connections
3. Add rate limit headers
4. Return 429 Too Many Requests when exceeded

### Implementation Notes
- Use express-rate-limit or similar
- Consider per-agent rate limits
- Don't rate limit SSE keepalives
- Add configuration for rate limit values

### References
- `server/routes/chat.ts`
- `server/routes/logs.ts`
- SECURITY.md Medium Priority Issue #4

---

## Issue #5: Add CSRF Protection

**Priority:** Low
**Status:** Open
**Assigned:** Unassigned

### Description
No CSRF (Cross-Site Request Forgery) token validation on API endpoints.

### Impact
- Possible CSRF attacks from malicious websites
- Currently mitigated by localhost-only access
- Will be critical for remote access

### Proposed Solution
1. Implement CSRF token generation
2. Add token to frontend on initial page load
3. Include token in all POST requests
4. Validate token server-side
5. Use SameSite cookies as additional protection

### Implementation Notes
- Use csurf or similar middleware
- Add token to React context
- Include in Axios/fetch defaults
- Consider double-submit cookie pattern

### References
- SECURITY.md Low Priority Issue #5

---

## Issue #6: Stream Completion Detection Timing

**Priority:** Low
**Status:** Monitoring
**Assigned:** Unassigned

### Description
Chat stream completion is detected using a 2-second inactivity timeout. This could prematurely close slow responses or leave fast responses hanging briefly.

### Impact
- May close stream before agent finishes thinking
- 2-second delay before input re-enables after response
- Acceptable for current use; may need tuning

### Proposed Solution
Options:
1. Make timeout configurable per agent
2. Look for explicit completion signal from gateway
3. Use adaptive timeout based on response patterns
4. Add manual "stop generation" button

### Implementation Notes
- Current 2s timeout is in chat.ts:245
- Works well in practice; monitor for edge cases
- May need gateway protocol changes for explicit signals
- Consider user feedback on responsiveness

### Status
Currently working as implemented. Monitor user feedback and adjust if needed.

### References
- `server/routes/chat.ts:245`
- SECURITY.md Medium Priority Issue #5

---

## Future Security Enhancements

### Authentication Layer
Add user authentication for dashboard access:
- Multi-user support
- Username/password or OAuth
- Role-based access control
- Session management

### Audit Logging
Implement comprehensive security audit logging:
- Authentication attempts
- Chat sessions
- Gateway status checks
- Configuration changes
- Failed requests

### Content Security Policy
Add CSP headers to prevent XSS:
- Restrict script sources
- Disable inline scripts (if possible)
- Frame protection

### Secrets Management
Improve secrets handling:
- Encrypt gateway tokens at rest
- Rotate tokens periodically
- Secure token transmission
- Key derivation for encryption

---

## GitHub Issue Creation

When creating issues on GitHub, use this template:

```markdown
**Title:** [SECURITY] <Issue Name>

**Labels:** security, <priority: high/medium/low>

**Description:**
<Copy from issue description above>

**Acceptance Criteria:**
- [ ] <Implementation step 1>
- [ ] <Implementation step 2>
- [ ] Security review completed
- [ ] Documentation updated

**References:**
- SECURITY.md
- SECURITY_ISSUES.md Issue #<number>
```

---

## Security Review Process

Before closing security issues:
1. Code review by security-focused developer
2. Test all security scenarios
3. Update SECURITY.md documentation
4. Add security tests if applicable
5. Update this tracking document
6. Verify no new vulnerabilities introduced

NOTE: very important we keep this file up to date and linked to issues. For release on Friday we will have a section in blog and presentation to discuss. We also need to make sure that README.md has info on this limitations prominently shown at top. These and OpenClaw currency (which might change some of these) will be key for us to address in after inial release so in the follow up release by end of month. This is CRITICAL!

---

Last Updated: 2026-03-03
