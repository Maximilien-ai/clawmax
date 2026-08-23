export type PluginRelationship = {
  pluginId: string
  pluginName: string
  objectKind: string
  itemId: string
  name: string
  status: string
  summary?: string
}

export type PluginRelationshipGroup = {
  pluginId: string
  pluginName: string
  objectKind: string
  count: number
}

export type PluginRelationships = {
  agents: Record<string, PluginRelationship[]>
  workflows: Record<string, PluginRelationship[]>
}

export const emptyPluginRelationships = (): PluginRelationships => ({
  agents: {},
  workflows: {},
})

function normalizeRelationship(value: unknown): PluginRelationship | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (
    typeof entry.pluginId !== 'string' ||
    typeof entry.pluginName !== 'string' ||
    typeof entry.objectKind !== 'string' ||
    typeof entry.itemId !== 'string' ||
    typeof entry.name !== 'string' ||
    typeof entry.status !== 'string'
  ) return null
  return {
    pluginId: entry.pluginId,
    pluginName: entry.pluginName,
    objectKind: entry.objectKind,
    itemId: entry.itemId,
    name: entry.name,
    status: entry.status,
    ...(typeof entry.summary === 'string' && entry.summary ? { summary: entry.summary } : {}),
  }
}

function normalizeCollection(value: unknown): Record<string, PluginRelationship[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([targetId, relationships]) => {
    if (!Array.isArray(relationships)) return []
    const normalized = relationships.map(normalizeRelationship).filter((entry): entry is PluginRelationship => !!entry)
    return normalized.length > 0 ? [[targetId, normalized]] : []
  }))
}

export function groupPluginRelationships(relationships: PluginRelationship[]): PluginRelationshipGroup[] {
  const groups = new Map<string, PluginRelationshipGroup>()
  for (const relationship of relationships) {
    const current = groups.get(relationship.pluginId)
    if (current) current.count += 1
    else groups.set(relationship.pluginId, {
      pluginId: relationship.pluginId,
      pluginName: relationship.pluginName,
      objectKind: relationship.objectKind,
      count: 1,
    })
  }
  return [...groups.values()].sort((left, right) => left.pluginName.localeCompare(right.pluginName))
}

export function summarizePluginRelationships(relationships: PluginRelationship[], maxVisible = 2) {
  const groups = groupPluginRelationships(relationships)
  const visible = groups.slice(0, Math.max(0, maxVisible))
  const visibleIds = new Set(visible.map((group) => group.pluginId))
  const overflowCount = relationships.filter((relationship) => !visibleIds.has(relationship.pluginId)).length
  return {
    visible,
    overflowCount,
    title: relationships.map((relationship) => `${relationship.pluginName}: ${relationship.name}`).join('\n'),
  }
}

export async function fetchPluginRelationships(): Promise<PluginRelationships> {
  const response = await fetch('/api/plugins/relationships')
  if (!response.ok) return emptyPluginRelationships()
  const data = await response.json()
  return {
    agents: normalizeCollection(data?.agents),
    workflows: normalizeCollection(data?.workflows),
  }
}
