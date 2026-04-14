/**
 * Workspace cost budget management.
 * Stores budget config in WORKSPACE/SYSTEM/budget.json.
 * Checks current spend against budget before allowing agent interactions.
 */

import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'
import { getWorkspaceMetering, type MeteringViewer } from './metering'
import { getWorkspaceManager } from './workspace-manager'
import { isOpikEnabled } from './opik'

export interface BudgetConfig {
  /** Maximum budget in USD (e.g., 10.00) */
  limitUsd: number
  /** Warning threshold as percentage (default 80) */
  warningPct: number
  /** Whether to block agent interactions when budget exceeded */
  enforced: boolean
  /** Whether agents are currently paused due to budget */
  paused: boolean
}

export interface BudgetStatus {
  config: BudgetConfig
  currentSpendUsd: number
  remainingUsd: number
  usedPct: number
  level: 'ok' | 'warning' | 'exceeded'
}

const DEFAULT_CONFIG: BudgetConfig = {
  limitUsd: 10.00,
  warningPct: 80,
  enforced: true,
  paused: false,
}

function getBudgetPath(workspaceId?: string): string {
  const workspacePath = workspaceId
    ? getWorkspaceManager().resolveWorkspacePath(workspaceId)
    : getWorkspacePath()
  return path.join(workspacePath, 'SYSTEM', 'budget.json')
}

export function loadBudgetConfig(workspaceId?: string): BudgetConfig {
  try {
    const raw = fs.readFileSync(getBudgetPath(workspaceId), 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveBudgetConfig(config: BudgetConfig, workspaceId?: string): void {
  const filePath = getBudgetPath(workspaceId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
}

export async function getBudgetStatus(workspaceId?: string, viewer?: MeteringViewer): Promise<BudgetStatus> {
  const config = loadBudgetConfig(workspaceId)
  const metering = await getWorkspaceMetering(workspaceId, viewer)
  const currentSpend = metering.estimatedCostUsd

  const usedPct = config.limitUsd > 0
    ? Math.round((currentSpend / config.limitUsd) * 10000) / 100
    : 0

  let level: BudgetStatus['level'] = 'ok'
  if (usedPct >= 100) {
    level = 'exceeded'
  } else if (usedPct >= config.warningPct) {
    level = 'warning'
  }

  // Auto-pause if enforced and exceeded
  if (config.enforced && level === 'exceeded' && !config.paused) {
    config.paused = true
    saveBudgetConfig(config, workspaceId)
    console.log(`[Budget] Workspace budget exceeded ($${currentSpend.toFixed(4)} / $${config.limitUsd.toFixed(2)}) — agents paused`)
  }

  // Auto-unpause if spend drops below limit (e.g., after budget increase)
  if (config.paused && level !== 'exceeded') {
    config.paused = false
    saveBudgetConfig(config, workspaceId)
    console.log(`[Budget] Budget no longer exceeded — agents unpaused`)
  }

  return {
    config,
    currentSpendUsd: Math.round(currentSpend * 10000) / 10000,
    remainingUsd: Math.max(0, Math.round((config.limitUsd - currentSpend) * 10000) / 10000),
    usedPct,
    level,
  }
}

/**
 * Check if agent interactions should be blocked due to budget.
 * Returns null if OK, or an error message if blocked.
 */
export function checkBudgetBlock(options?: { workspaceId?: string; operation?: 'agent' | 'workflow' }): string | null {
  if (!isOpikEnabled()) return null
  const config = loadBudgetConfig(options?.workspaceId)
  if (!config.enforced) return null
  if (!config.paused) return null
  if (options?.operation === 'workflow') {
    return `Workflow blocked: workspace budget exceeded ($${config.limitUsd.toFixed(2)} limit). Increase budget or disable enforcement to continue.`
  }
  return `Agent interaction blocked: workspace budget exceeded ($${config.limitUsd.toFixed(2)} limit). Increase budget or disable enforcement to continue.`
}

export function validateAgentCostLimit(limitUsd: number | null, workspaceId?: string): string | null {
  if (limitUsd === null || limitUsd <= 0) return null
  const budget = loadBudgetConfig(workspaceId)
  if (budget.limitUsd > 0 && limitUsd > budget.limitUsd) {
    return `Agent limit cannot exceed workspace budget ($${budget.limitUsd.toFixed(2)}).`
  }
  return null
}
