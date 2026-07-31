import React, { useEffect, useState } from 'react'
import { MobileSafeDialog } from './MobileSafeDialog'
import type { PluginManifest } from '../lib/plugins'

export interface PluginSettingsEntry {
  id: string
  slug: string
  name: string
  description: string
  version: string
  visibility: 'private' | 'public'
  enabled: boolean
}

interface PluginManagerDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (plugins: PluginManifest[]) => void
}

export function PluginManagerDialog({ open, onClose, onSaved }: PluginManagerDialogProps) {
  const [entries, setEntries] = useState<PluginSettingsEntry[]>([])
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch('/api/plugins/settings')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((data) => {
        const plugins = Array.isArray(data.plugins) ? data.plugins as PluginSettingsEntry[] : []
        setEntries(plugins)
        setEnabled(new Set(plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.slug)))
      })
      .catch(() => setError('Available plugins could not be loaded.'))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/plugins/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledPluginIds: Array.from(enabled) }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      onSaved(Array.isArray(data.plugins) ? data.plugins : [])
      onClose()
    } catch {
      setError('Plugin changes could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MobileSafeDialog
      ariaLabelledBy="plugin-manager-title"
      onClose={saving ? undefined : onClose}
      panelClassName="max-w-2xl"
      header={(
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="plugin-manager-title" className="text-lg font-semibold text-gray-900 dark:text-white">Manage plugins</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose which available plugins appear in this instance.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-white" aria-label="Close plugin manager">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">Cancel</button>
          <button type="button" onClick={save} disabled={loading || saving} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      )}
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading plugins...</p>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No plugins are available in this runtime.</p>
      ) : (
        <div className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {entries.map((plugin) => (
            <label key={plugin.slug} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <input
                type="checkbox"
                checked={enabled.has(plugin.slug)}
                onChange={(event) => setEnabled((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(plugin.slug)
                  else next.delete(plugin.slug)
                  return next
                })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{plugin.name}</span>
                  <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500 dark:border-gray-600 dark:text-gray-400">{plugin.visibility}</span>
                  <span className="text-xs text-gray-400">v{plugin.version}</span>
                </span>
                <span className="mt-1 block text-sm leading-5 text-gray-500 dark:text-gray-400">{plugin.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
    </MobileSafeDialog>
  )
}
