import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getWorkspaceManager } from './workspace-manager'

export interface WorkspaceDashboardSections {
  overview: boolean
  costs: boolean
  agents: boolean
  notifications: boolean
  workflows: boolean
  kickoff: boolean
  results: boolean
  groupChats: boolean
  interactions: boolean
}

export type WorkspaceDashboardDisplayMode = 'standard' | 'compact' | 'detail'
export type WorkspaceDashboardSectionKey = keyof WorkspaceDashboardSections
export type WorkspaceDashboardCompactColumn = 'left' | 'right'
export const DEFAULT_SECTION_ORDER: WorkspaceDashboardSectionKey[] = [
  'overview',
  'costs',
  'agents',
  'notifications',
  'workflows',
  'kickoff',
  'results',
  'groupChats',
]
export const DEFAULT_COMPACT_COLUMNS: Record<WorkspaceDashboardSectionKey, WorkspaceDashboardCompactColumn> = {
  overview: 'left',
  costs: 'left',
  agents: 'right',
  notifications: 'right',
  workflows: 'left',
  kickoff: 'left',
  results: 'left',
  groupChats: 'right',
  interactions: 'right',
}

export interface WorkspaceDashboard {
  id: string
  workspaceId: string
  title: string
  description: string | null
  token: string
  slug: string
  refreshEnabled: boolean
  refreshIntervalSeconds: number
  companyFocusKind: 'workspace' | 'team' | 'prefix'
  companyFocusValue: string | null
  companyFocusLabel: string | null
  displayMode: WorkspaceDashboardDisplayMode
  sections: WorkspaceDashboardSections
  sectionOrder: WorkspaceDashboardSectionKey[]
  compactColumns: Record<WorkspaceDashboardSectionKey, WorkspaceDashboardCompactColumn>
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface WorkspaceDashboardStore {
  version: string
  dashboards: WorkspaceDashboard[]
}

const DEFAULT_SECTIONS: WorkspaceDashboardSections = {
  overview: true,
  costs: true,
  agents: true,
  notifications: true,
  workflows: true,
  kickoff: true,
  results: true,
  groupChats: true,
  interactions: false,
}

function getWorkspaceDashboardsPath(workspaceId: string): string {
  const workspacePath = getWorkspaceManager().resolveWorkspacePath(workspaceId)
  return path.join(workspacePath, 'SYSTEM', 'workspace-dashboards.json')
}

function loadStore(workspaceId: string): WorkspaceDashboardStore {
  const filePath = getWorkspaceDashboardsPath(workspaceId)
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return {
      version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
      dashboards: Array.isArray(parsed.dashboards) ? parsed.dashboards.map((dashboard: WorkspaceDashboard) => ({
        ...dashboard,
        slug: dashboard.slug || normalizeWorkspaceDashboardSlug(dashboard.title || dashboard.id),
        refreshEnabled: dashboard.refreshEnabled === true,
        refreshIntervalSeconds: Number.isFinite(dashboard.refreshIntervalSeconds) ? dashboard.refreshIntervalSeconds : 30,
        sections: { ...DEFAULT_SECTIONS, ...(dashboard.sections || {}) },
      })) : [],
    }
  } catch {
    return { version: '1.0.0', dashboards: [] }
  }
}

function saveStore(workspaceId: string, store: WorkspaceDashboardStore): void {
  const filePath = getWorkspaceDashboardsPath(workspaceId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

export function normalizeWorkspaceDashboardSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function uniqueDashboardSlug(workspaceId: string, requested: string, excludeId?: string): string {
  const base = normalizeWorkspaceDashboardSlug(requested) || `dashboard-${workspaceId}`
  const used = new Set<string>()
  for (const workspace of getWorkspaceManager().listWorkspaces()) {
    for (const dashboard of loadStore(workspace.id).dashboards) {
      if (dashboard.id !== excludeId && dashboard.slug) used.add(normalizeWorkspaceDashboardSlug(dashboard.slug))
    }
  }
  if (!used.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`.slice(0, 80)
    if (!used.has(candidate)) return candidate
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`.slice(0, 80)
}

export function listWorkspaceDashboards(workspaceId: string): WorkspaceDashboard[] {
  return loadStore(workspaceId).dashboards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getWorkspaceDashboardByToken(token: string): WorkspaceDashboard | null {
  const workspaceManager = getWorkspaceManager()
  const workspaces = workspaceManager.listWorkspaces()
  for (const workspace of workspaces) {
    const store = loadStore(workspace.id)
    const normalized = normalizeWorkspaceDashboardSlug(token)
    const dashboard = store.dashboards.find((entry) => entry.token === token || (entry.slug && normalizeWorkspaceDashboardSlug(entry.slug) === normalized))
    if (dashboard) return dashboard
  }
  return null
}

export function createWorkspaceDashboard(
  workspaceId: string,
  input: {
    title: string
    slug?: string
    refreshEnabled?: boolean
    refreshIntervalSeconds?: number
    description?: string | null
    displayMode?: WorkspaceDashboardDisplayMode
    companyFocusKind?: 'workspace' | 'team' | 'prefix'
    companyFocusValue?: string | null
    companyFocusLabel?: string | null
    sections?: Partial<WorkspaceDashboardSections>
    sectionOrder?: WorkspaceDashboardSectionKey[]
    compactColumns?: Partial<Record<WorkspaceDashboardSectionKey, WorkspaceDashboardCompactColumn>>
    createdBy?: string | null
  }
): WorkspaceDashboard {
  const now = new Date().toISOString()
  const dashboard: WorkspaceDashboard = {
    id: crypto.randomUUID(),
    workspaceId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    token: generateToken(),
    slug: uniqueDashboardSlug(workspaceId, input.slug || input.title),
    refreshEnabled: input.refreshEnabled === true,
    refreshIntervalSeconds: Math.max(10, Math.min(3600, Number(input.refreshIntervalSeconds || 30))),
    companyFocusKind: input.companyFocusKind || 'workspace',
    companyFocusValue: input.companyFocusValue?.trim() || null,
    companyFocusLabel: input.companyFocusLabel?.trim() || null,
    displayMode: input.displayMode || 'standard',
    sections: { ...DEFAULT_SECTIONS, ...(input.sections || {}) },
    sectionOrder: Array.isArray(input.sectionOrder) && input.sectionOrder.length > 0 ? input.sectionOrder : [...DEFAULT_SECTION_ORDER],
    compactColumns: { ...DEFAULT_COMPACT_COLUMNS, ...(input.compactColumns || {}) },
    createdBy: input.createdBy || null,
    createdAt: now,
    updatedAt: now,
  }

  const store = loadStore(workspaceId)
  store.dashboards.push(dashboard)
  saveStore(workspaceId, store)
  return dashboard
}

export function deleteWorkspaceDashboard(workspaceId: string, dashboardId: string): boolean {
  const store = loadStore(workspaceId)
  const nextDashboards = store.dashboards.filter((entry) => entry.id !== dashboardId)
  if (nextDashboards.length === store.dashboards.length) return false
  store.dashboards = nextDashboards
  saveStore(workspaceId, store)
  return true
}

export function regenerateWorkspaceDashboardToken(workspaceId: string, dashboardId: string): WorkspaceDashboard | null {
  const store = loadStore(workspaceId)
  const dashboard = store.dashboards.find((entry) => entry.id === dashboardId)
  if (!dashboard) return null
  dashboard.token = generateToken()
  dashboard.updatedAt = new Date().toISOString()
  saveStore(workspaceId, store)
  return dashboard
}

export function updateWorkspaceDashboard(
  workspaceId: string,
  dashboardId: string,
  updates: {
    slug?: string
    refreshEnabled?: boolean
    refreshIntervalSeconds?: number
    title?: string
    description?: string | null
    displayMode?: WorkspaceDashboardDisplayMode
    companyFocusKind?: 'workspace' | 'team' | 'prefix'
    companyFocusValue?: string | null
    companyFocusLabel?: string | null
    sections?: Partial<WorkspaceDashboardSections>
    sectionOrder?: WorkspaceDashboardSectionKey[]
    compactColumns?: Partial<Record<WorkspaceDashboardSectionKey, WorkspaceDashboardCompactColumn>>
  }
): WorkspaceDashboard | null {
  const store = loadStore(workspaceId)
  const dashboard = store.dashboards.find((entry) => entry.id === dashboardId)
  if (!dashboard) return null

  if (typeof updates.slug === 'string' && updates.slug.trim()) {
    dashboard.slug = uniqueDashboardSlug(workspaceId, updates.slug, dashboard.id)
  }
  if (typeof updates.refreshEnabled === 'boolean') dashboard.refreshEnabled = updates.refreshEnabled
  if (typeof updates.refreshIntervalSeconds === 'number' && Number.isFinite(updates.refreshIntervalSeconds)) {
    dashboard.refreshIntervalSeconds = Math.max(10, Math.min(3600, Math.round(updates.refreshIntervalSeconds)))
  }

  if (typeof updates.title === 'string' && updates.title.trim()) {
    dashboard.title = updates.title.trim()
  }
  if (updates.description !== undefined) {
    dashboard.description = updates.description?.trim() || null
  }
  if (updates.displayMode) {
    dashboard.displayMode = updates.displayMode
  }
  if (updates.companyFocusKind) {
    dashboard.companyFocusKind = updates.companyFocusKind
  }
  if (updates.companyFocusValue !== undefined) {
    dashboard.companyFocusValue = updates.companyFocusValue?.trim() || null
  }
  if (updates.companyFocusLabel !== undefined) {
    dashboard.companyFocusLabel = updates.companyFocusLabel?.trim() || null
  }
  if (updates.sections) {
    dashboard.sections = { ...dashboard.sections, ...updates.sections }
  }
  if (Array.isArray(updates.sectionOrder) && updates.sectionOrder.length > 0) {
    dashboard.sectionOrder = updates.sectionOrder
  }
  if (updates.compactColumns) {
    dashboard.compactColumns = { ...dashboard.compactColumns, ...updates.compactColumns }
  }
  dashboard.updatedAt = new Date().toISOString()
  saveStore(workspaceId, store)
  return dashboard
}
