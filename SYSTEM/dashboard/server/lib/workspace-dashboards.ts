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
}

export type WorkspaceDashboardDisplayMode = 'standard' | 'compact' | 'detail'
export type WorkspaceDashboardSectionKey = keyof WorkspaceDashboardSections
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

export interface WorkspaceDashboard {
  id: string
  workspaceId: string
  title: string
  description: string | null
  token: string
  displayMode: WorkspaceDashboardDisplayMode
  sections: WorkspaceDashboardSections
  sectionOrder: WorkspaceDashboardSectionKey[]
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
      dashboards: Array.isArray(parsed.dashboards) ? parsed.dashboards : [],
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

export function listWorkspaceDashboards(workspaceId: string): WorkspaceDashboard[] {
  return loadStore(workspaceId).dashboards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getWorkspaceDashboardByToken(token: string): WorkspaceDashboard | null {
  const workspaceManager = getWorkspaceManager()
  const workspaces = workspaceManager.listWorkspaces()
  for (const workspace of workspaces) {
    const store = loadStore(workspace.id)
    const dashboard = store.dashboards.find((entry) => entry.token === token)
    if (dashboard) return dashboard
  }
  return null
}

export function createWorkspaceDashboard(
  workspaceId: string,
  input: {
    title: string
    description?: string | null
    displayMode?: WorkspaceDashboardDisplayMode
    sections?: Partial<WorkspaceDashboardSections>
    sectionOrder?: WorkspaceDashboardSectionKey[]
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
    displayMode: input.displayMode || 'standard',
    sections: { ...DEFAULT_SECTIONS, ...(input.sections || {}) },
    sectionOrder: Array.isArray(input.sectionOrder) && input.sectionOrder.length > 0 ? input.sectionOrder : [...DEFAULT_SECTION_ORDER],
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
    title?: string
    description?: string | null
    displayMode?: WorkspaceDashboardDisplayMode
    sections?: Partial<WorkspaceDashboardSections>
    sectionOrder?: WorkspaceDashboardSectionKey[]
  }
): WorkspaceDashboard | null {
  const store = loadStore(workspaceId)
  const dashboard = store.dashboards.find((entry) => entry.id === dashboardId)
  if (!dashboard) return null

  if (typeof updates.title === 'string' && updates.title.trim()) {
    dashboard.title = updates.title.trim()
  }
  if (updates.description !== undefined) {
    dashboard.description = updates.description?.trim() || null
  }
  if (updates.displayMode) {
    dashboard.displayMode = updates.displayMode
  }
  if (updates.sections) {
    dashboard.sections = { ...dashboard.sections, ...updates.sections }
  }
  if (Array.isArray(updates.sectionOrder) && updates.sectionOrder.length > 0) {
    dashboard.sectionOrder = updates.sectionOrder
  }
  dashboard.updatedAt = new Date().toISOString()
  saveStore(workspaceId, store)
  return dashboard
}
