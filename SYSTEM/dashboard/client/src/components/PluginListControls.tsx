import React from 'react'

import type { PluginStatusFilter } from '../lib/pluginListFilters'
export { matchesPluginFilter, type PluginStatusFilter } from '../lib/pluginListFilters'

export function PluginListControls({ search, onSearch, status, onStatus, total, enabled, visible }: {
  search: string; onSearch: (value: string) => void
  status: PluginStatusFilter; onStatus: (value: PluginStatusFilter) => void
  total: number; enabled: number; visible: number
}) {
  return <div className="my-4 space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm dark:text-gray-200">Search plugins
        <input type="search" aria-label="Search plugins" value={search} onChange={event => onSearch(event.target.value)}
          className="mt-1 block w-full rounded border p-2 dark:border-gray-600 dark:bg-gray-900" />
      </label>
      <label className="text-sm dark:text-gray-200">Status
        <select aria-label="Status" value={status} onChange={event => onStatus(event.target.value as PluginStatusFilter)}
          className="mt-1 block rounded border p-2 dark:border-gray-600 dark:bg-gray-900">
          <option value="all">All ({total})</option>
          <option value="enabled">Enabled ({enabled})</option>
          <option value="disabled">Disabled ({total - enabled})</option>
        </select>
      </label>
    </div>
    <p className="text-xs text-gray-500 dark:text-gray-400">Showing {visible} of {total} plugins. Enabled means configured on; runtime status is shown separately where available.</p>
  </div>
}

export function PluginInstallUnavailable() {
  return <div className="my-3 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
    <button type="button" disabled className="rounded border px-3 py-2 opacity-50">Install plugin</button>
    <span>Installation is not available yet. No installations are queued.</span>
  </div>
}
