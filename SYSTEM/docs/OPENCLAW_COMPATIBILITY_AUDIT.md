# OpenClaw Config Compatibility Audit Report

**Date:** 2026-02-26
**Status:** CRITICAL ISSUES IDENTIFIED

## Executive Summary

This audit reveals **CRITICAL compatibility issues** between the OpenClaw CLI and the Dashboard that create data integrity risks. The Dashboard directly writes to `openclaw.json` using basic `fs.writeFileSync()` and `JSON.stringify()`, bypassing the CLI's sophisticated config validation, schema enforcement, and metadata management.

---

## 1. Config Read/Write Architecture Analysis

### 1.1 OpenClaw CLI Config Handling

**Primary Entry Points:**
- **Read:** `/Users/maximilien/github/maximilien/openclaw/src/config/io.ts`
  - `loadConfig()` - Line 1091 (cached, validated)
  - `readConfigFileSnapshot()` - Line 1115
  - `readConfigFileSnapshotForWrite()` - Line 1119

- **Write:** `/Users/maximilien/github/maximilien/openclaw/src/config/io.ts`
  - `writeConfigFile()` - Line 820-1044 (primary write with validation)

**Canonical Config Schema:**
- **Location:** `/Users/maximilien/github/maximilien/openclaw/src/config/zod-schema.ts`
- **Main Schema:** `OpenClawSchema` (Line 104-686)
- **Agent Schema:** `/Users/maximilien/github/maximilien/openclaw/src/config/zod-schema.agent-runtime.ts`
  - `AgentEntrySchema` (Line 584-619) - includes `skills: z.array(z.string()).optional()` at Line 592

**Skills Handling in CLI:**
- Skills are stored as `string[]` on agent entries
- Schema defined at Line 592 of `zod-schema.agent-runtime.ts`
- No special validation beyond being an array of strings
- Skills updated via Gateway RPC at `/Users/maximilien/github/maximilien/openclaw/src/gateway/server-methods/skills.ts` (Line 146-203)

### 1.2 Dashboard Config Handling

**Config Write Locations:**
1. **Skills Management** (`/Users/maximilien/.openclaw/workspace/SYSTEM/dashboard/server/lib/skills.ts`)
   - `setAgentSkills()` - Lines 150-172
   - `saveOpenClawConfig()` - Lines 225-243
   - **CRITICAL:** Direct `fs.writeFileSync()` with `JSON.stringify(config, null, 2)`

2. **Agent Registration** (`/Users/maximilien/.openclaw/workspace/SYSTEM/dashboard/server/routes/agents.ts`)
   - `registerAgentInConfig()` - Lines 43-89
   - **CRITICAL:** Direct `fs.writeFileSync()` with `JSON.stringify(config, null, 2)`

**Config Read Locations:**
- Skills: `loadOpenClawConfig()` - Lines 212-220
- Agents: Multiple locations reading config directly (Lines 55, 283, 505, etc.)

---

## 2. Compatibility Issues Identified

### CRITICAL Issues

#### 2.1 Missing Meta Timestamp Stamping
- **Severity:** CRITICAL
- **Location:** Dashboard `saveOpenClawConfig()` (skills.ts:225-243)
- **Issue:** Dashboard does NOT update `meta.lastTouchedVersion` or `meta.lastTouchedAt`
- **CLI Behavior:** ALWAYS stamps these fields via `stampConfigVersion()` (io.ts:416-426)
- **Impact:**
  - CLI detects config written by newer version and warns user
  - Audit logs flag missing metadata as suspicious (io.ts:368, 405)
  - Config rotation may fail to detect changes properly

**Evidence:**
```typescript
// CLI ALWAYS does this (io.ts:416-426):
function stampConfigVersion(cfg: OpenClawConfig): OpenClawConfig {
  const now = new Date().toISOString();
  return {
    ...cfg,
    meta: {
      ...cfg.meta,
      lastTouchedVersion: VERSION,
      lastTouchedAt: now,
    },
  };
}

// Dashboard NEVER does this:
fs.writeFileSync(
  OPENCLAW_CONFIG_PATH,
  JSON.stringify(config, null, 2),
  'utf-8'
)
```

#### 2.2 No Schema Validation
- **Severity:** CRITICAL
- **Location:** Dashboard `saveOpenClawConfig()` and `registerAgentInConfig()`
- **Issue:** No Zod schema validation before writing
- **CLI Behavior:** ALWAYS validates via `validateConfigObjectWithPlugins()` (io.ts:846-857)
- **Impact:** Dashboard can write invalid configs that crash CLI on next load

#### 2.3 No Environment Variable Preservation
- **Severity:** HIGH
- **Location:** Dashboard writes (skills.ts:225-243, agents.ts:83)
- **Issue:** Dashboard overwrites `${ENV_VAR}` references with resolved values
- **CLI Behavior:** Preserves env var references via `restoreEnvVarRefs()` (io.ts:868-887)
- **Impact:** Secrets and API keys get written to disk in plaintext instead of staying as `${ANTHROPIC_API_KEY}`

#### 2.4 No Merge Patch Logic
- **Severity:** HIGH
- **Location:** Dashboard `setAgentSkills()` (skills.ts:150-172)
- **Issue:** Dashboard does full-object replacement without merge patch
- **CLI Behavior:** Uses `createMergePatch()` and `applyMergePatch()` (io.ts:182-215, 827-828)
- **Impact:**
  - Concurrent writes from CLI and Dashboard can conflict
  - Dashboard overwrites fields it doesn't know about
  - No change tracking or audit trail

#### 2.5 No Config Backup/Rotation
- **Severity:** MEDIUM
- **Location:** Dashboard `saveOpenClawConfig()` (skills.ts:228)
- **Issue:** Creates `.bak` file but no versioned rotation
- **CLI Behavior:** Full backup rotation via `rotateConfigBackups()` (io.ts:1008)
- **Impact:** Only 1 backup, no history for disaster recovery

#### 2.6 No Atomic Writes
- **Severity:** MEDIUM
- **Location:** Dashboard writes directly to `openclaw.json`
- **Issue:** No temp file + rename pattern
- **CLI Behavior:** Write to temp → rename → atomic (io.ts:996-1039)
- **Impact:** Risk of corrupted config if write interrupted

### MEDIUM Issues

#### 2.7 Inconsistent File Permissions
- **Severity:** MEDIUM
- **Location:** Dashboard writes don't set mode
- **CLI Behavior:** Always sets mode `0o600` for security (io.ts:1004, 1022)
- **Impact:** Config file may have overly permissive permissions

#### 2.8 No Duplicate Agent Detection
- **Severity:** MEDIUM
- **Location:** Dashboard `registerAgentInConfig()` (agents.ts:58-59)
- **Issue:** Only checks if agent exists, doesn't validate workspace dirs
- **CLI Behavior:** `findDuplicateAgentDirs()` before write (io.ts:554-560)
- **Impact:** Can create agents with duplicate agentDir causing conflicts

---

## 3. Recommended Solution

**Dashboard should NEVER directly write to `openclaw.json`.** Instead, ALL config modifications should go through the OpenClaw Gateway RPC API (`config.patch` method), which provides:

- ✅ Full Zod schema validation
- ✅ Automatic metadata stamping
- ✅ Environment variable preservation
- ✅ Merge patch conflict resolution
- ✅ Audit logging
- ✅ Atomic writes with backups

### Implementation Approach

Replace direct config writes with Gateway RPC calls:

```typescript
// Instead of saveOpenClawConfig(config)
await executeOpenClawCommand([
  'gateway', 'call', 'config.patch',
  '--params', JSON.stringify({ agents: { list: [...] } })
])
```

---

## 4. File Paths Reference

### OpenClaw CLI (Production Repo)
- Config I/O: `src/config/io.ts`
- Schema: `src/config/zod-schema.ts`
- Agent Schema: `src/config/zod-schema.agent-runtime.ts`
- Skills Gateway: `src/gateway/server-methods/skills.ts`
- Config Gateway: `src/gateway/server-methods/config.ts`

### Dashboard
- Skills Library: `server/lib/skills.ts`
- Skills Routes: `server/routes/skills.ts`
- Agent Routes: `server/routes/agents.ts`

### Shared Config
- Live Config: `~/.openclaw/openclaw.json`

---

## 5. Next Steps

1. Implement Gateway RPC client in dashboard
2. Replace all direct config writes with RPC calls
3. Add integration tests for config compatibility
4. Update documentation

---

**Status:** Ready for implementation
