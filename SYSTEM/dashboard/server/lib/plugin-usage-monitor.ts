import { getWorkspaceMetering, type WorkspaceMetering } from './metering'
import {
  listConfiguredPlugins,
  listPluginRecords,
  upsertPluginRecord,
  type GenericPluginRecord,
  type PluginManifest,
  type PluginUsageMonitoringContract,
} from './plugin-system'

const DEFAULT_SCAN_INTERVAL_MS = 60_000
let timer: ReturnType<typeof setInterval> | null = null
let initialTimer: ReturnType<typeof setTimeout> | null = null
let running = false

function scanIntervalMs(): number {
  const configured = Number.parseInt(process.env.CLAWMAX_PLUGIN_MONITOR_INTERVAL_MS || '', 10)
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_SCAN_INTERVAL_MS
}

function numeric(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function selectedUsage(scope: string, targetIds: string[], metering: WorkspaceMetering): { tokens: number; cost: number; sources: number } {
  if (scope === 'workspace') {
    return { tokens: metering.totalTokens, cost: metering.estimatedCostUsd, sources: metering.totalTraces }
  }
  if (scope === 'agent') {
    const selected = metering.byAgent.filter((entry) => targetIds.includes(entry.agentId))
    return {
      tokens: selected.reduce((total, entry) => total + entry.totalTokens, 0),
      cost: selected.reduce((total, entry) => total + entry.estimatedCostUsd, 0),
      sources: selected.reduce((total, entry) => total + entry.totalCalls, 0),
    }
  }
  const selected = metering.byWorkflow.filter((entry) => targetIds.includes(entry.workflowId))
  return {
    tokens: selected.reduce((total, entry) => total + entry.totalTokens, 0),
    cost: selected.reduce((total, entry) => total + entry.estimatedCostUsd, 0),
    sources: selected.reduce((total, entry) => total + entry.totalRuns, 0),
  }
}

export function assessPluginUsageRecord(
  contract: PluginUsageMonitoringContract,
  record: GenericPluginRecord,
  metering: WorkspaceMetering,
  now = new Date(),
): GenericPluginRecord['fields'] {
  const binding = contract.fields
  const scope = String(record.fields[binding.scope] || 'workspace')
  const rawTargetIds = record.fields[binding.targetIds]
  const targetIds = Array.isArray(rawTargetIds) ? rawTargetIds.map(String) : []
  const tokenBudget = numeric(record.fields[binding.tokenBudget])
  const costBudget = numeric(record.fields[binding.costBudget])
  const nextAssessment = new Date(now.getTime() + contract.intervalMinutes * 60_000)

  if (scope !== 'workspace' && targetIds.length === 0) {
    return {
      ...record.fields,
      [binding.state]: 'needs-target',
      [binding.summary]: 'Choose at least one target to begin continuous usage assessment.',
      [binding.lastAssessedAt]: now.toISOString(),
      [binding.nextAssessmentAt]: nextAssessment.toISOString(),
    }
  }

  const usage = selectedUsage(scope, targetIds, metering)
  const tokenRatio = tokenBudget > 0 ? usage.tokens / tokenBudget : 0
  const costRatio = costBudget > 0 ? usage.cost / costBudget : 0
  const maximumRatio = Math.max(tokenRatio, costRatio)
  const state = usage.sources === 0 ? 'no-data' : maximumRatio >= 1 ? 'over-budget' : maximumRatio >= 0.8 ? 'approaching-budget' : 'on-track'
  const summary = usage.sources === 0
    ? 'No metered activity has been observed for the selected scope this calendar month.'
    : `Calendar-month usage: ${Math.round(usage.tokens).toLocaleString('en-US')} tokens and $${usage.cost.toFixed(4)} across ${usage.sources} metered event${usage.sources === 1 ? '' : 's'}.`
  return {
    ...record.fields,
    [binding.currentTokens]: Math.round(usage.tokens),
    [binding.currentCost]: Math.round(usage.cost * 10_000) / 10_000,
    [binding.state]: state,
    [binding.summary]: summary,
    [binding.lastAssessedAt]: now.toISOString(),
    [binding.nextAssessmentAt]: nextAssessment.toISOString(),
  }
}

function assessmentDue(contract: PluginUsageMonitoringContract, record: GenericPluginRecord, now: Date): boolean {
  const last = String(record.fields[contract.fields.lastAssessedAt] || '')
  const timestamp = Date.parse(last)
  return !Number.isFinite(timestamp) || now.getTime() - timestamp >= contract.intervalMinutes * 60_000
}

export async function runPluginUsageMonitorOnce(
  loadMetering: () => Promise<WorkspaceMetering> = () => getWorkspaceMetering(undefined, undefined, 'month'),
  now = new Date(),
): Promise<{ plugins: number; assessed: number }> {
  if (running) return { plugins: 0, assessed: 0 }
  running = true
  try {
    const plugins = listConfiguredPlugins().filter((plugin) => plugin.usageMonitoring && plugin.capabilities?.metering === true)
    const due = plugins.flatMap((plugin) => listPluginRecords(plugin)
      .filter((record): record is GenericPluginRecord => 'fields' in record && record.enabled && !record.archived)
      .filter((record) => assessmentDue(plugin.usageMonitoring!, record, now))
      .map((record) => ({ plugin, record })))
    if (due.length === 0) return { plugins: plugins.length, assessed: 0 }
    const metering = await loadMetering()
    for (const { plugin, record } of due) {
      upsertPluginRecord(plugin, { ...record, fields: assessPluginUsageRecord(plugin.usageMonitoring!, record, metering, now) })
    }
    return { plugins: plugins.length, assessed: due.length }
  } finally {
    running = false
  }
}

function scan(log: (message: string) => void): void {
  void runPluginUsageMonitorOnce()
    .then((result) => {
      if (result.assessed > 0) log(`[Plugin Monitor] assessed ${result.assessed} record(s) across ${result.plugins} plugin(s)`)
    })
    .catch((error: any) => log(`[Plugin Monitor] scan failed: ${error?.message || String(error)}`))
}

export function startPluginUsageMonitor(log: (message: string) => void = console.log): void {
  if (timer) return
  log(`[Plugin Monitor] starting usage monitor (scan interval=${scanIntervalMs()}ms)`)
  initialTimer = setTimeout(() => scan(log), 2_000)
  initialTimer.unref?.()
  timer = setInterval(() => scan(log), scanIntervalMs())
  timer.unref?.()
}

export function stopPluginUsageMonitor(): void {
  if (initialTimer) clearTimeout(initialTimer)
  if (timer) clearInterval(timer)
  initialTimer = null
  timer = null
}
