export type PluginRelationship = {
  pluginId: string
  itemId: string
  name: string
}

export type PluginRelationships = {
  agents: Record<string, PluginRelationship[]>
  workflows: Record<string, PluginRelationship[]>
}

export const emptyPluginRelationships = (): PluginRelationships => ({
  agents: {},
  workflows: {},
})

export async function fetchPluginRelationships(): Promise<PluginRelationships> {
  const response = await fetch('/api/plugins/relationships')
  if (!response.ok) return emptyPluginRelationships()
  const data = await response.json()
  return {
    agents: data?.agents && typeof data.agents === 'object' ? data.agents : {},
    workflows: data?.workflows && typeof data.workflows === 'object' ? data.workflows : {},
  }
}
