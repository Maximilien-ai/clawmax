import { channelLabel } from './channelLabel'

export interface AgentGroup {
  name: string
  displayName?: string
  description?: string | null
}

function readGroups(value: unknown): AgentGroup[] {
  if (!Array.isArray(value) || value.some(group => !group || typeof group.name !== 'string' || !group.name.trim())) {
    throw new Error('The server returned an invalid group list. Refresh and try again.')
  }
  return value.map(group => ({
    name: group.name,
    ...(typeof group.displayName === 'string' ? { displayName: group.displayName } : {}),
    ...(typeof group.description === 'string' ? { description: group.description } : {}),
  }))
}

async function responseBody(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `Group request failed (HTTP ${response.status})`)
  return body
}

export async function loadAgentGroupOptions(fetchImpl: typeof fetch = fetch): Promise<AgentGroup[]> {
  const body = await responseBody(await fetchImpl('/api/groups', { cache: 'no-store' }))
  return readGroups(body?.groups)
}

export function availableAgentGroups(options: AgentGroup[], memberships: AgentGroup[], query: string): AgentGroup[] {
  const selected = new Set(memberships.map(group => group.name))
  const search = query.trim().toLocaleLowerCase()
  return options.filter(group => !selected.has(group.name) && (!search || `${channelLabel(group)} ${group.name} ${group.description || ''}`.toLocaleLowerCase().includes(search)))
    .sort((a, b) => channelLabel(a).localeCompare(channelLabel(b)))
}

/** Read fresh memberships, change only groups, then verify the persisted result. */
export async function changeAgentGroupMembership(agentId: string, groupName: string, member: boolean, fetchImpl: typeof fetch = fetch): Promise<AgentGroup[]> {
  const agentPath = `/api/agents/${encodeURIComponent(agentId)}`
  const current = await responseBody(await fetchImpl(agentPath, { cache: 'no-store' }))
  const names = new Set(readGroups(current?.groups).map(group => group.name))
  if (member) names.add(groupName)
  else names.delete(groupName)
  const result = await responseBody(await fetchImpl(`${agentPath}/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups: [...names] }),
  }))
  if (result?.ok !== true) throw new Error('Group membership could not be saved. Refresh and try again.')
  const saved = await responseBody(await fetchImpl(agentPath, { cache: 'no-store' }))
  const groups = readGroups(saved?.groups)
  if (groups.some(group => group.name === groupName) !== member) throw new Error('Group membership did not persist. Refresh and try again.')
  return groups
}
