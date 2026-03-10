# Token Usage Monitoring - Implementation Notes

**Status**: ⚠️ Blocked by OpenClaw Gateway Scope Limitations
**Date**: March 9, 2026
**Priority**: Medium (Nice-to-have feature)

---

## Issue Summary

Token usage monitoring feature is **implemented in ClawMax** but **blocked by OpenClaw Gateway RPC permissions**. The dashboard cannot access the `sessions.usage` API endpoint due to missing scope authorization.

NOTE: is this a change we need to make to OpenClaw to allow usage in dashboard?

---

## Error Details

**Error Message**:
```json
{
  "agentUsage": {},
  "days": 30,
  "error": "Gateway unavailable or no usage data",
  "details": "Gateway RPC error: missing scope: operator.admin"
}
```

**Root Cause**:
- ClawMax Dashboard connects to OpenClaw Gateway with `role: 'operator'` and `scopes: ['operator.admin']`
- Gateway RPC rejects `sessions.usage` method calls with "missing scope: operator.admin"
- This suggests the `sessions.usage` endpoint requires a different scope or is not exposed to external clients

NOTE: can we check what scope exactly seems like operator.admin should include all data, no?

---

## Implementation Status

### ✅ Completed (Ready to use when OpenClaw supports it)

**Backend** (`server/routes/agents.ts:486-524`):
```typescript
// GET /api/agents/usage — get token usage for all agents
router.get('/usage', async (req, res) => {
  const days = parseInt(req.query.days as string) || 30

  try {
    const gateway = getGatewayClient()
    const result = await gateway.call('sessions.usage', { days })

    // Extract agent usage from aggregates
    const agentUsage: Record<string, any> = {}
    if (result.aggregates?.byAgent) {
      for (const entry of result.aggregates.byAgent) {
        agentUsage[entry.agentId] = {
          totalTokens: entry.totals.totalTokens || 0,
          inputTokens: entry.totals.input || 0,
          outputTokens: entry.totals.output || 0,
          cacheReadTokens: entry.totals.cacheRead || 0,
          cacheWriteTokens: entry.totals.cacheWrite || 0,
          totalCost: entry.totals.totalCost || 0,
        }
      }
    }

    res.json({ agentUsage, days })
  } catch (err: any) {
    // Graceful fallback - returns empty data instead of error
    res.json({
      agentUsage: {},
      days,
      error: 'Gateway unavailable or no usage data',
      details: err.message
    })
  }
})
```

**Frontend** (`client/src/pages/Agents.tsx:188-205`):
```typescript
// Fetch agent usage data
useEffect(() => {
  const fetchUsage = async () => {
    try {
      const response = await fetch(`/api/agents/usage?days=${usageDays}`)
      const data = await response.json()
      if (data.agentUsage) {
        setAgentUsage(data.agentUsage)
      }
    } catch (err) {
      console.error('Failed to fetch agent usage:', err)
    }
  }
  fetchUsage()
  // Refresh usage every 5 minutes
  const interval = setInterval(fetchUsage, 300000)
  return () => clearInterval(interval)
}, [usageDays])
```

**Agent Card Display** (`client/src/pages/Agents.tsx:2193-2197`):
```typescript
{usage && usage.totalTokens > 0 && (
  <div className="text-xs text-indigo-600 shrink-0 font-medium"
       title={`${usage.totalTokens.toLocaleString()} tokens (${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out)${usage.totalCost > 0 ? ` • $${usage.totalCost.toFixed(4)}` : ''}`}>
    {formatTokens(usage.totalTokens)} 🪙
  </div>
)}
```

### ⏳ Pending OpenClaw Changes

**Required from OpenClaw**:
1. **Expose `sessions.usage` to external clients** via Gateway RPC
2. **Add appropriate scope** (e.g., `operator.usage` or relax `operator.admin`)
3. **Document scope requirements** for third-party integrations

**Alternative**: OpenClaw could provide a separate HTTP API endpoint for usage data that doesn't require Gateway WebSocket connection.

---

## Workaround Options

### Option 1: Direct File System Access (Not Recommended)
Read session files directly from `~/.openclaw/agents/*/sessions/*.jsonl`:
- ❌ Bypasses OpenClaw's API layer
- ❌ Requires parsing JSONL session transcripts
- ❌ No aggregation logic (would need to reimplement)
- ❌ Breaks if OpenClaw changes file format

### Option 2: OpenClaw CLI Wrapper
Call `openclaw status --json` or similar:
- ⚠️ No dedicated usage API in CLI
- ⚠️ Would need to add CLI command to OpenClaw
- ✅ Stays within official API surface

### Option 3: Wait for OpenClaw Support (Recommended)
- ✅ Clean integration
- ✅ No maintenance burden
- ✅ Follows OpenClaw's architecture
- ❌ Blocks feature until upstream fix

---

## Testing Without Gateway Access

To test the UI without backend data:

```typescript
// Mock data for development
const mockUsage = {
  'agent-1': { totalTokens: 1250000, inputTokens: 850000, outputTokens: 400000, totalCost: 0.15 },
  'agent-2': { totalTokens: 500000, inputTokens: 300000, outputTokens: 200000, totalCost: 0.06 }
}
setAgentUsage(mockUsage)
```

---

## User Impact

**Current Behavior**:
- Token counts **do not appear** on agent cards
- No error messages shown to users (graceful degradation)
- Dashboard functions normally without this data

**Future Behavior** (when OpenClaw supports it):
- Token counts appear with 🪙 icon on each agent card
- Formatted display: "1.2K 🪙", "500M 🪙"
- Hover tooltip shows full breakdown
- Auto-refreshes every 5 minutes

---

## Next Steps

1. **File OpenClaw issue** requesting `sessions.usage` scope for external clients
2. **Update ClawMax README** to note this feature requires OpenClaw v2.9.0+ (or specific version)
3. **Monitor OpenClaw releases** for usage API availability
4. **Update blog post** to clarify this is a planned feature pending OpenClaw support

---

## Related Files

**Backend**:
- `server/routes/agents.ts` (line 486-524) - Usage endpoint
- `server/lib/gateway-rpc.ts` (line 96-210) - Gateway RPC client

**Frontend**:
- `client/src/pages/Agents.tsx` (line 188-205) - Fetch logic
- `client/src/pages/Agents.tsx` (line 2110-2115) - Format function
- `client/src/pages/Agents.tsx` (line 2193-2197) - Display component

**Documentation**:
- `docs/BLOG_POST_DRAFT.md` - Public-facing feature documentation
- `docs/CLAWMAX_FEATURES.md` - Technical feature list

---

## Contact

For questions about this limitation, contact:
- **OpenClaw Team**: GitHub issues at anthropics/openclaw
- **ClawMax Team**: max@maximilien.ai

---

**Last Updated**: March 9, 2026
**Tracking Issue**: [To be created]
