import fs from 'fs'
import path from 'path'

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function materializeDashboardAgentList(config: any): any[] {
  if (!isRecord(config)) {
    throw new Error('OpenClaw config must be an object')
  }
  if (!isRecord(config.agents)) config.agents = {}
  if (Array.isArray(config.agents.list)) return config.agents.list

  const entries = isRecord(config.agents.entries) ? config.agents.entries : {}
  const list = Object.entries(entries).flatMap(([id, entry]) => {
    if (!isRecord(entry)) return []
    const { id: _retiredId, ...rest } = entry
    return [{ id, ...rest }]
  })
  config.agents.list = list
  return list
}

export function canonicalizeDashboardAgentRoster(config: any): boolean {
  if (!isRecord(config)) {
    throw new Error('OpenClaw config must be an object')
  }
  if (!isRecord(config.agents)) config.agents = {}
  const agents = config.agents
  if (!Array.isArray(agents.list)) return false

  const entries: Record<string, any> = Object.create(null)
  for (const item of agents.list) {
    if (!isRecord(item)) {
      throw new Error('OpenClaw agent roster entries must be objects')
    }
    const id = item.id
    if (typeof id !== 'string' || !id || id.trim() !== id) {
      throw new Error('OpenClaw agent roster entries require a non-empty, trimmed id')
    }
    const { id: _id, backupModel: _backupModel, ...entry } = item
    // OpenClaw 2 keys the roster by id, so legacy duplicates cannot survive.
    // Match the upstream migration's object-assignment behavior: the last
    // record wins, which favors the most recently appended workspace record.
    entries[id] = entry
  }

  delete agents.list
  agents.entries = entries
  return true
}

export function stampDashboardMetadata(config: any): any {
  config.meta = {
    ...(config.meta || {}),
    lastTouchedVersion: 'dashboard-0.1.0',
  }
  delete config.meta.lastTouchedAt
  return config
}

export function stripUnsupportedDashboardAgentKeys(config: any): boolean {
  if (!isRecord(config)) return false
  const agentList = materializeDashboardAgentList(config)

  let changed = false
  for (let index = 0; index < agentList.length; index++) {
    const entry = agentList[index]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    if (!Object.prototype.hasOwnProperty.call(entry, 'backupModel')) continue
    const nextEntry = { ...entry }
    delete nextEntry.backupModel
    agentList[index] = nextEntry
    changed = true
  }

  return changed
}

function safeReadJson(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function summarizeGatewayDiff(before: any, after: any): string[] {
  const changes: string[] = []
  const beforeAuth = before?.gateway?.auth?.token
  const afterAuth = after?.gateway?.auth?.token
  if (beforeAuth !== afterAuth) changes.push('gateway.auth.token')

  const beforeRemote = before?.gateway?.remote?.token
  const afterRemote = after?.gateway?.remote?.token
  if (beforeRemote !== afterRemote) changes.push('gateway.remote.token')

  const beforeTailscale = JSON.stringify(before?.gateway?.tailscale ?? null)
  const afterTailscale = JSON.stringify(after?.gateway?.tailscale ?? null)
  if (beforeTailscale !== afterTailscale) changes.push('gateway.tailscale')

  return changes
}

export function writeDashboardManagedOpenClawConfig(
  configPath: string,
  nextConfig: any,
  context: string
): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })

  const latestConfig = safeReadJson(configPath)
  if (latestConfig && typeof latestConfig === 'object' && 'gateway' in latestConfig) {
    const attemptedGatewayDiff = summarizeGatewayDiff(latestConfig, nextConfig)
    if (attemptedGatewayDiff.length > 0) {
      console.warn(`[OpenClaw Config] ${context} attempted to change protected gateway fields (${attemptedGatewayDiff.join(', ')}); preserving latest on-disk gateway config`)
    }
    nextConfig.gateway = latestConfig.gateway
  }

  stripUnsupportedDashboardAgentKeys(nextConfig)
  stampDashboardMetadata(nextConfig)
  canonicalizeDashboardAgentRoster(nextConfig)
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf-8')
}

export function healDashboardManagedOpenClawConfig(configPath: string, context: string): { ok: boolean; changed: boolean; error?: string } {
  try {
    const current = safeReadJson(configPath)
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return { ok: true, changed: false }
    }
    const before = JSON.stringify(current)
    stripUnsupportedDashboardAgentKeys(current)
    stampDashboardMetadata(current)
    canonicalizeDashboardAgentRoster(current)
    if (JSON.stringify(current) === before) {
      return { ok: true, changed: false }
    }
    writeDashboardManagedOpenClawConfig(configPath, current, context)
    return { ok: true, changed: true }
  } catch (err: any) {
    return { ok: false, changed: false, error: err?.message || String(err) }
  }
}
