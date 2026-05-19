import fs from 'fs'
import path from 'path'
import { getWorkspacePath, listAgents } from './workspace'

export interface Team {
  id: string
  name: string
  purpose?: string
  leaderAgentId?: string
  memberAgentIds: string[]
  parentTeamId?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface TeamStore {
  version: string
  teams: Team[]
}

export interface TeamInput {
  id?: string
  name: string
  purpose?: string
  leaderAgentId?: string
  memberAgentIds?: string[]
  parentTeamId?: string
  tags?: string[]
}

function getTeamsPath(workspacePath = getWorkspacePath()): string {
  return path.join(workspacePath, 'SYSTEM', 'teams.json')
}

function loadStore(workspacePath = getWorkspacePath()): TeamStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(getTeamsPath(workspacePath), 'utf-8'))
    return {
      version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
    }
  } catch {
    return { version: '1.0.0', teams: [] }
  }
}

function saveStore(store: TeamStore, workspacePath = getWorkspacePath()): void {
  const filePath = getTeamsPath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

function normalizeList(values: string[] | undefined): string[] {
  return Array.from(
    new Set((values || []).map((value) => `${value || ''}`.trim()).filter(Boolean))
  )
}

function slugifyTeamId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'team'
}

function ensureUniqueTeamId(baseId: string, existing: Team[]): string {
  const existingIds = new Set(existing.map((team) => team.id))
  if (!existingIds.has(baseId)) return baseId
  let suffix = 2
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1
  return `${baseId}-${suffix}`
}

function normalizeTeamInput(input: TeamInput, options?: { existing?: Team[]; preserveId?: string }): Team {
  const now = new Date().toISOString()
  const normalizedName = `${input.name || ''}`.trim()
  if (!normalizedName) {
    throw new Error('Team name is required')
  }

  const tags = normalizeList(input.tags)
  const memberAgentIds = normalizeList(input.memberAgentIds)
  const purpose = input.purpose?.trim() || undefined
  const leaderAgentId = input.leaderAgentId?.trim() || undefined
  const parentTeamId = input.parentTeamId?.trim() || undefined
  const requestedId = input.id?.trim() || options?.preserveId
  const nextId = options?.preserveId
    || ensureUniqueTeamId(slugifyTeamId(requestedId || normalizedName), options?.existing || [])

  const filteredMembers = memberAgentIds.filter((memberId) => memberId !== leaderAgentId)

  return {
    id: nextId,
    name: normalizedName,
    purpose,
    leaderAgentId,
    memberAgentIds: filteredMembers,
    parentTeamId,
    tags,
    createdAt: now,
    updatedAt: now,
  }
}

function validateTeamReferences(team: Team, existingTeams: Team[], currentTeamId?: string): void {
  const knownAgentIds = new Set(listAgents().map((agent) => agent.id))
  if (team.leaderAgentId && !knownAgentIds.has(team.leaderAgentId)) {
    throw new Error(`Unknown leader agent: ${team.leaderAgentId}`)
  }
  for (const memberId of team.memberAgentIds) {
    if (!knownAgentIds.has(memberId)) {
      throw new Error(`Unknown team member agent: ${memberId}`)
    }
  }
  if (team.parentTeamId) {
    if (team.parentTeamId === currentTeamId || team.parentTeamId === team.id) {
      throw new Error('Team cannot be its own parent')
    }
    if (!existingTeams.some((entry) => entry.id === team.parentTeamId)) {
      throw new Error(`Unknown parent team: ${team.parentTeamId}`)
    }
  }
}

export function listTeams(workspacePath = getWorkspacePath()): Team[] {
  return loadStore(workspacePath).teams.sort((a, b) => a.name.localeCompare(b.name))
}

export function getTeam(teamId: string, workspacePath = getWorkspacePath()): Team | null {
  return listTeams(workspacePath).find((team) => team.id === teamId) || null
}

export function createTeam(input: TeamInput, workspacePath = getWorkspacePath()): Team {
  const store = loadStore(workspacePath)
  const team = normalizeTeamInput(input, { existing: store.teams })
  validateTeamReferences(team, store.teams)
  store.teams.push(team)
  saveStore(store, workspacePath)
  return team
}

export function updateTeam(teamId: string, updates: Partial<TeamInput>, workspacePath = getWorkspacePath()): Team | null {
  const store = loadStore(workspacePath)
  const existing = store.teams.find((entry) => entry.id === teamId)
  if (!existing) return null

  const normalized = normalizeTeamInput({
    id: existing.id,
    name: updates.name ?? existing.name,
    purpose: updates.purpose ?? existing.purpose,
    leaderAgentId: updates.leaderAgentId ?? existing.leaderAgentId,
    memberAgentIds: updates.memberAgentIds ?? existing.memberAgentIds,
    parentTeamId: updates.parentTeamId ?? existing.parentTeamId,
    tags: updates.tags ?? existing.tags,
  }, { existing: store.teams.filter((entry) => entry.id !== teamId), preserveId: existing.id })

  validateTeamReferences(normalized, store.teams.filter((entry) => entry.id !== teamId), teamId)
  normalized.createdAt = existing.createdAt
  normalized.updatedAt = new Date().toISOString()

  const index = store.teams.findIndex((entry) => entry.id === teamId)
  store.teams[index] = normalized
  saveStore(store, workspacePath)
  return normalized
}

export function deleteTeam(teamId: string, workspacePath = getWorkspacePath()): boolean {
  const store = loadStore(workspacePath)
  const nextTeams = store.teams.filter((entry) => entry.id !== teamId)
  if (nextTeams.length === store.teams.length) return false
  store.teams = nextTeams.map((entry) => (
    entry.parentTeamId === teamId
      ? { ...entry, parentTeamId: undefined, updatedAt: new Date().toISOString() }
      : entry
  ))
  saveStore(store, workspacePath)
  return true
}

export function deleteTeams(teamIds: string[], workspacePath = getWorkspacePath()): string[] {
  const idsToDelete = new Set(
    (teamIds || [])
      .map((teamId) => `${teamId || ''}`.trim())
      .filter(Boolean)
  )
  if (idsToDelete.size === 0) return []

  const store = loadStore(workspacePath)
  const deletedIds = store.teams
    .filter((entry) => idsToDelete.has(entry.id))
    .map((entry) => entry.id)
  if (deletedIds.length === 0) return []

  const deletedIdSet = new Set(deletedIds)
  store.teams = store.teams
    .filter((entry) => !deletedIdSet.has(entry.id))
    .map((entry) => (
      entry.parentTeamId && deletedIdSet.has(entry.parentTeamId)
        ? { ...entry, parentTeamId: undefined, updatedAt: new Date().toISOString() }
        : entry
    ))

  saveStore(store, workspacePath)
  return deletedIds
}
