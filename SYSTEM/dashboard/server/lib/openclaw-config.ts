import fs from 'fs'
import path from 'path'

export function stampDashboardMetadata(config: any): any {
  const now = new Date().toISOString()
  config.meta = {
    ...(config.meta || {}),
    lastTouchedVersion: 'dashboard-0.1.0',
    lastTouchedAt: now,
  }
  return config
}

export function stripUnsupportedDashboardAgentKeys(config: any): boolean {
  const agentList = config?.agents?.list
  if (!Array.isArray(agentList)) return false

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
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf-8')
}

export function healDashboardManagedOpenClawConfig(configPath: string, context: string): { ok: boolean; changed: boolean; error?: string } {
  try {
    const current = safeReadJson(configPath)
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return { ok: true, changed: false }
    }
    if (!stripUnsupportedDashboardAgentKeys(current)) {
      return { ok: true, changed: false }
    }
    writeDashboardManagedOpenClawConfig(configPath, current, context)
    return { ok: true, changed: true }
  } catch (err: any) {
    return { ok: false, changed: false, error: err?.message || String(err) }
  }
}
