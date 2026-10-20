export type PluginStatusFilter = 'all' | 'enabled' | 'disabled'

export function matchesPluginFilter(text: string, enabled: boolean, search: string, status: PluginStatusFilter) {
  return text.toLowerCase().includes(search.trim().toLowerCase()) &&
    (status === 'all' || enabled === (status === 'enabled'))
}
