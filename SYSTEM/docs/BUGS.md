# Known Bugs

## Community/Group Highlight on Navigation Not Working

**Status**: Open
**Priority**: Medium
**Created**: 2025-02-23

### Description
When clicking a community or group from an agent card, the navigation to the Communication page works, but the channel card doesn't scroll into view or highlight.

### Root Cause
React doesn't render the channel cards when the Communication page div has the `hidden` class (when on Agents page). Even after switching pages and waiting, the DOM elements aren't available.

**Technical Details**:
- App.tsx uses `className={page === 'communication' ? '' : 'hidden'}` for page switching
- The `hidden` class prevents React from rendering child components
- By the time the useEffect runs, `document.querySelectorAll('[id^="channel-card-"]')` returns empty array
- Even with 1.3s total delay (300ms + 1000ms retry), elements never appear

### Attempted Fixes
1. ✗ Increased timeout delays (100ms → 300ms → 500ms)
2. ✗ Added retry mechanism with 1000ms delay
3. ✗ Used `requestAnimationFrame` to wait for paint
4. ✗ Added `isActive` prop to track page visibility
5. ✗ Added `!loading` check to wait for data

### Possible Solutions
1. **Remove hidden class approach** - Render all pages but use `display: none` or `visibility: hidden` instead
2. **Conditional rendering with keys** - Force remount when page changes
3. **Use React Router** - Proper page routing instead of hidden divs
4. **MutationObserver** - Watch for DOM changes and trigger scroll when element appears
5. **Store scroll intent** - Let Communication page handle scroll on its own mount/visibility change

### Files Affected
- `SYSTEM/dashboard/client/src/App.tsx` (line 164)
- `SYSTEM/dashboard/client/src/pages/Communication.tsx` (lines 87-106)

### Workaround
For now, users can:
1. Click the community/group from agent card (navigates to Communication page)
2. Manually find the channel in the list

The navigation works, just not the scroll/highlight feature.

---

## Gateway RPC Authentication Scope Issue

**Status**: Open
**Priority**: P1 (High - affects core Dashboard → OpenClaw integration)
**Created**: 2026-02-26

### Description
Dashboard's Gateway RPC client cannot perform admin operations (config.patch, skills updates, agent registration) because simple token authentication doesn't grant the required `operator.admin` scope.

### Root Cause
OpenClaw Gateway requires `operator.admin` scope for all config modification methods:
- `config.patch` - Update configuration
- `config.set` - Replace configuration
- `config.apply` - Apply and restart
- Agent management operations
- Skills configuration

The CLI uses device-based authentication which automatically grants:
```typescript
scopes: ["operator.admin", "operator.approvals", "operator.pairing"]
```

NOTE: is this related to the Token Usage issue? More reasons to change OpenClaw and fix this?

However, simple token auth (using `gateway.auth.token` from openclaw.json) does not grant any scopes by default, causing all admin RPC calls to fail with "missing scope: operator.admin" or connection closed errors.

### Current Workaround
Dashboard uses direct writes to `~/.openclaw/openclaw.json` with **metadata stamping** to ensure OpenClaw CLI compatibility:

```typescript
// Stamp metadata (critical for OpenClaw compatibility)
const now = new Date().toISOString()
config.meta = {
  ...config.meta,
  lastTouchedVersion: 'dashboard-0.1.0',
  lastTouchedAt: now
}
```

**Provides:**
- ✅ Metadata stamping (lastTouchedVersion, lastTouchedAt)
- ✅ Fast, reliable operation
- ✅ OpenClaw CLI can read configs without errors
- ❌ No Zod schema validation
- ❌ No environment variable preservation
- ❌ No merge patch conflict resolution
- ❌ No audit trail via Gateway

### Proper Solution
Implement device-based authentication for Dashboard → Gateway communication.

**Option A: Device Identity (Recommended)**
1. Use OpenClaw's `loadOrCreateDeviceIdentity()` function
2. Generate device keypair and sign auth payload
3. Request `operator.admin` scope during connection
4. Store device identity in Dashboard config

**Option B: Extended Token Auth**
- Modify Gateway to support scope-granting tokens
- Add scope configuration to `gateway.auth.token` in openclaw.json
- Requires upstream OpenClaw changes

### Files Affected
- `dashboard/server/lib/gateway-rpc.ts` - RPC client implementation
- `dashboard/server/lib/skills.ts` - Skills management (currently using direct writes)
- `dashboard/server/routes/agents.ts` - Agent registration (currently using direct writes)

### References
- Gateway auth code: `/Users/maximilien/github/maximilien/openclaw/src/gateway/auth.ts`
- Device identity: `/Users/maximilien/github/maximilien/openclaw/src/infra/device-identity.ts`
- CLI client example: `/Users/maximilien/github/maximilien/openclaw/src/gateway/call.ts:272`

### Testing
Once implemented, verify with:
```bash
./test.sh  # Section 15: Gateway RPC Compatibility
```

Expected: All tests pass, config.patch calls succeed, metadata stamped by Gateway.
