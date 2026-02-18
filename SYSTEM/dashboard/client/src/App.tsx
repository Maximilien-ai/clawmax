import React, { useState, useEffect } from 'react'
import Agents from './pages/Agents'
import DocHub from './pages/DocHub'
import Activity from './pages/Activity'
import Communication from './pages/Communication'

type Page = 'agents' | 'activity' | 'communication' | 'docs'

interface SystemInfo {
  hostname: string
  agentCount: number
  onlineCount: number
  version: string
  orgName: string | null
}

export default function App() {
  const [page, setPage] = useState<Page>('agents')
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)

  useEffect(() => {
    const load = () =>
      fetch('/api/system')
        .then(r => r.json())
        .then(d => setSystem(d))
        .catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside className={`bg-gray-900 text-gray-100 flex flex-col shrink-0 transition-all duration-200 ${navCollapsed ? 'w-14' : 'w-56'}`}>
        {/* Logo */}
        {!navCollapsed && (
          <div className="px-4 py-5 border-b border-gray-700">
            <span className="text-lg font-bold tracking-tight text-white">ClawMax</span>
            <span className="text-sky-400 font-bold text-lg">.ai</span>
            <p className="text-xs text-gray-400 mt-0.5">Owner Dashboard</p>
          </div>
        )}
        {navCollapsed && (
          <div className="py-5 border-b border-gray-700 flex justify-center">
            <span className="text-white font-bold text-xs tracking-tight">C<span className="text-sky-400">M</span></span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          <NavItem label="Agents" icon="robot" active={page === 'agents'} onClick={() => setPage('agents')} collapsed={navCollapsed} />
          <NavItem label="Communication" icon="comms" active={page === 'communication'} onClick={() => setPage('communication')} collapsed={navCollapsed} />
          <NavItem label="Activity" icon="activity" active={page === 'activity'} onClick={() => setPage('activity')} collapsed={navCollapsed} />
          <NavItem label="Documents" icon="docs" active={page === 'docs'} onClick={() => setPage('docs')} collapsed={navCollapsed} />
        </nav>

        {/* Footer / collapse toggle */}
        <div className={`border-t border-gray-700 ${navCollapsed ? 'px-2 py-3 flex justify-center' : 'px-4 py-3 flex items-center justify-between'}`}>
          {!navCollapsed && (
            <span className="text-xs text-gray-500 font-mono">{system?.version ?? '…'} · {system?.hostname ?? '…'}</span>
          )}
          <button
            onClick={() => setNavCollapsed(c => !c)}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs leading-none p-1 rounded hover:bg-gray-800"
            title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {navCollapsed ? '▶' : '◀'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Top bar */}
        <TopBar system={system} />
        {page === 'agents' && <Agents />}
        {page === 'communication' && <Communication />}
        {page === 'activity' && <Activity />}
        {page === 'docs' && <DocHub />}
      </main>
    </div>
  )
}

function TopBar({ system }: { system: SystemInfo | null }) {
  if (!system) return <div className="h-9 border-b border-gray-200 bg-white shrink-0" />
  const allOnline = system.onlineCount === system.agentCount && system.agentCount > 0

  // Split orgName at last "." to style the tld separately (e.g. "Maximilien" + ".ai")
  let orgBase = system.orgName ?? null
  let orgTld: string | null = null
  if (system.orgName) {
    const dot = system.orgName.lastIndexOf('.')
    if (dot > 0) {
      orgBase = system.orgName.slice(0, dot)
      orgTld = system.orgName.slice(dot) // includes the dot
    }
  }

  return (
    <div className="h-9 flex items-center justify-between px-5 border-b border-gray-200 bg-white shrink-0">
      <div className="flex items-center gap-4">
        {orgBase && (
          <span className="text-sm font-bold text-gray-800 tracking-tight">
            {orgBase}{orgTld && <span className="text-sky-500">{orgTld}</span>}
          </span>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono text-gray-400">{system.hostname}</span>
          <span className="text-gray-300">·</span>
          <span>{system.agentCount} agent{system.agentCount !== 1 ? 's' : ''}</span>
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${allOnline ? 'bg-green-400' : system.onlineCount > 0 ? 'bg-yellow-400' : 'bg-gray-300'}`} />
            {system.onlineCount} online
          </span>
        </div>
      </div>
      <span className="text-xs text-gray-300 font-mono">{system.version}</span>
    </div>
  )
}

function NavItem({ label, icon, active, onClick, collapsed }: {
  label: string
  icon: string
  active: boolean
  onClick: () => void
  collapsed: boolean
}) {
  const icons: Record<string, string> = {
    robot: '🤖',
    comms: '💬',
    activity: '📊',
    docs: '📄',
  }

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        collapsed ? 'justify-center' : ''
      } ${
        active
          ? 'bg-sky-600 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <span>{icons[icon]}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  )
}
