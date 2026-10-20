import React, { useEffect, useState } from 'react'
import { PluginListControls, PluginInstallUnavailable, matchesPluginFilter, type PluginStatusFilter } from './PluginListControls'
type Plugin = { id: string; name: string; enabled: boolean; status: string; version: string; origin: string }
type Change = { id: string; pluginId: string; enabled: boolean; at: string; status: string }

export default function OpenClawPlugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [history, setHistory] = useState<Change[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Plugin | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PluginStatusFilter>('all')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const visible = plugins.filter(plugin => matchesPluginFilter(`${plugin.name} ${plugin.id}`, plugin.enabled, search, status))
  async function refresh() {
    setLoading(true); setError(''); setCanManage(false); setSelected(null)
    try {
      const res = await fetch('/api/system/openclaw-plugins')
      const data = await res.json()
      if (!res.ok || !Array.isArray(data.plugins)) throw new Error(data.error || 'Inventory unavailable')
      setPlugins(data.plugins); setHistory(data.history || []); setCanManage(data.canManage === true)
      setUpdatedAt(new Date())
    } catch { setError('Could not load OpenClaw plugins. Check runtime status and refresh.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  async function change() {
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/system/openclaw-plugins/${encodeURIComponent(selected.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !selected.enabled, confirmRestartImpact: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Plugin change failed')
      setSelected(null)
      await refresh()
      setNotice(data.changed ? 'Configuration saved. A gateway restart may be required; refresh to verify runtime status before running agents.' : 'The plugin already has that configuration.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Plugin change failed. Refresh before retrying.') }
    finally { setBusy(false) }
  }
  return <section className="flex-1 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">OpenClaw Plugins</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Installed runtime plugins, shared by every workspace on this instance. These are not ClawMax dashboard plugins.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={busy || loading} className="rounded border px-3 py-2 text-sm dark:text-gray-100 disabled:opacity-50">Refresh</button>
    </div>
    <p className="my-3 text-sm text-amber-800 dark:text-amber-200">Changing plugins may interrupt chats and workflows. No plugins can be installed here.</p>
    <PluginInstallUnavailable />
    {updatedAt && <p className="text-xs text-gray-500 dark:text-gray-400">Inventory checked {updatedAt.toLocaleTimeString()}. Kept in memory while this dashboard is open; use Refresh to check for external changes.{error ? ' The displayed inventory may be stale; changes are disabled until refresh succeeds.' : ''}</p>}
    {error && <p role="alert" className="my-3 rounded bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}
    {notice && <p role="status" className="my-3 rounded bg-sky-50 p-3 text-sky-900 dark:bg-sky-950 dark:text-sky-100">{notice}</p>}
    {loading && <p role="status" className="dark:text-gray-200">Loading installed plugins…</p>}
    {!canManage && !loading && !error && <p className="text-sm text-gray-600 dark:text-gray-300">Read-only: instance administrator access is required to change plugins.</p>}
    <PluginListControls search={search} onSearch={setSearch} status={status} onStatus={setStatus} total={plugins.length} enabled={plugins.filter(plugin => plugin.enabled).length} visible={visible.length} />
    {!loading && !error && plugins.length === 0 && <p className="dark:text-gray-200">No installed plugins reported by OpenClaw.</p>}
    {!loading && plugins.length > 0 && visible.length === 0 && <p>No plugins match your search and status filter.</p>}
    <div className="space-y-3">{visible.map(plugin => <article key={plugin.id} className="rounded-lg border p-3 dark:border-gray-700 dark:text-gray-100">
      <div className="flex items-start gap-3"><input type="checkbox" checked={plugin.enabled} disabled={!canManage || loading || busy} onChange={() => setSelected(plugin)} className="mt-1 h-4 w-4 shrink-0 rounded" aria-label={`Enable ${plugin.name}`} /><div className="min-w-0 flex-1 break-words"><h2 className="font-semibold">{plugin.name}</h2><p className="text-xs text-gray-500 dark:text-gray-400">{plugin.id} · {plugin.version || 'Version not reported'} · {plugin.origin || 'Origin not reported'}</p>
        <p className="mt-1 text-sm">Installed · Configured: {plugin.enabled ? 'enabled' : 'disabled'} · Runtime: {plugin.status}</p></div>
        </div>
      {selected?.id === plugin.id && <div role="group" aria-label="Confirm plugin change" className="mt-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
        <p>{plugin.enabled ? 'Disable' : 'Enable'} {plugin.name} for all workspaces? This may restart the gateway and interrupt active work. Enabling does not bypass OpenClaw capability or policy checks.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void change()} disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50">{busy ? 'Saving…' : 'Confirm change'}</button><button type="button" onClick={() => setSelected(null)} disabled={busy} className="rounded border px-3 py-2">Cancel</button></div>
      </div>}
    </article>)}</div>
    <h2 className="mb-2 mt-6 font-semibold dark:text-gray-100">Recent changes</h2>
    {!history.length && <p className="text-sm text-gray-500 dark:text-gray-400">No changes recorded.</p>}
    <ul className="space-y-2 text-sm dark:text-gray-200">{history.slice().reverse().map(item => <li key={item.id} className="break-words">{item.at} · {item.pluginId} · {item.enabled ? 'enable' : 'disable'} · {item.status === 'saved' ? 'configuration saved; verify runtime status' : item.status}</li>)}</ul>
  </section>
}
