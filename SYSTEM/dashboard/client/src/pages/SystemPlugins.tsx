import React, { useEffect, useState } from 'react'
import OpenClawPlugins from '../components/OpenClawPlugins'
import { PluginManagerDialog } from '../components/PluginManagerDialog'
import type { PluginManifest } from '../lib/plugins'

export default function SystemPlugins({ onSaved }: { onSaved: (plugins: PluginManifest[]) => void }) {
  const readTab = () => window.location.hash === '#clawmax' ? 'clawmax' : 'openclaw'
  const [tab, setTab] = useState(readTab)
  const [visited, setVisited] = useState(() => new Set([readTab()]))
  useEffect(() => { setVisited(current => new Set([...current, tab])) }, [tab])
  useEffect(() => {
    const sync = () => setTab(readTab())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])
  return <div className="min-w-0">
    <header className="px-4 pt-4 sm:px-6">
      <h1 className="text-xl font-bold">Plugins</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">OpenClaw plugins extend the OpenClaw agent runtime. ClawMax plugins extend the ClawMax dashboard. These are separate plugin systems, managed independently.</p>
      <nav aria-label="Plugin type" className="mt-4 flex flex-wrap gap-2 border-b pb-3 dark:border-gray-700">
        {(['openclaw', 'clawmax'] as const).map(id => <a key={id} href={`#${id}`} aria-current={tab === id ? 'page' : undefined}
          className={`rounded px-4 py-2 text-sm ${tab === id ? 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100' : 'text-gray-600 dark:text-gray-300'}`}>
          {id === 'openclaw' ? 'OpenClaw Plugins' : 'ClawMax Plugins and Extensions'}
        </a>)}
      </nav>
    </header>
    {visited.has('openclaw') && <div hidden={tab !== 'openclaw'}><OpenClawPlugins /></div>}
    {visited.has('clawmax') && <div hidden={tab !== 'clawmax'}><PluginManagerDialog open embedded onClose={() => {}} onSaved={onSaved} /></div>}
  </div>
}
