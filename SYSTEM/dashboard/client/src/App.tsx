import React, { useState, useEffect } from 'react'
import Agents from './pages/Agents'
import DocHub from './pages/DocHub'
import Activity from './pages/Activity'
import Communication from './pages/Communication'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConnectionStatus } from './components/ConnectionStatus'

type Page = 'agents' | 'activity' | 'communication' | 'docs'

interface SystemInfo {
  hostname: string
  agentCount: number
  onlineCount: number
  version: string
  orgName: string | null
}

interface NavItem {
  id: Page
  label: string
  icon: string
}

const DEFAULT_NAV_ORDER: NavItem[] = [
  { id: 'agents', label: 'Agents', icon: 'robot' },
  { id: 'docs', label: 'Documents', icon: 'docs' },
  { id: 'communication', label: 'Communication', icon: 'comms' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
]

export default function App() {
  const [page, setPage] = useState<Page>('agents')
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [docFile, setDocFile] = useState<string | undefined>(undefined)
  const [initialAgentId, setInitialAgentId] = useState<string | undefined>(undefined)
  const [initialGroupName, setInitialGroupName] = useState<string | undefined>(undefined)
  const [navOrder, setNavOrder] = useState<NavItem[]>(() => {
    const saved = localStorage.getItem('nav-order')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return DEFAULT_NAV_ORDER
      }
    }
    return DEFAULT_NAV_ORDER
  })
  const [draggedNavIndex, setDraggedNavIndex] = useState<number | null>(null)

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

  const handleNavDragStart = (index: number) => {
    setDraggedNavIndex(index)
  }

  const handleNavDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedNavIndex === null || draggedNavIndex === index) return

    const newOrder = [...navOrder]
    const [removed] = newOrder.splice(draggedNavIndex, 1)
    newOrder.splice(index, 0, removed)
    setNavOrder(newOrder)
    setDraggedNavIndex(index)
  }

  const handleNavDragEnd = () => {
    setDraggedNavIndex(null)
    localStorage.setItem('nav-order', JSON.stringify(navOrder))
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConnectionStatus />
        <div className="flex h-screen bg-gray-50 text-gray-900">
          {/* Mobile nav overlay backdrop */}
          {mobileNavOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside className={`bg-gray-900 text-gray-100 flex flex-col shrink-0 transition-all duration-200 ${
            navCollapsed ? 'w-14' : 'w-56'
          } ${
            mobileNavOpen ? 'fixed inset-y-0 left-0 z-50 md:relative' : 'hidden md:flex'
          }`}>
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
              {navOrder.map((item, index) => (
                <NavItemDraggable
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  active={page === item.id}
                  onClick={() => {
                    setPage(item.id)
                    setMobileNavOpen(false)
                  }}
                  collapsed={navCollapsed}
                  onDragStart={() => handleNavDragStart(index)}
                  onDragOver={(e) => handleNavDragOver(e, index)}
                  onDragEnd={handleNavDragEnd}
                />
              ))}
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
            <TopBar system={system} onMobileMenuToggle={() => setMobileNavOpen(true)} />
            <div className={`flex-1 overflow-auto ${page === 'agents' ? '' : 'hidden'}`}>
              <Agents
                onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                onNavigateToGroup={(groupName) => { setInitialGroupName(groupName); setPage('communication'); }}
                initialAgentId={initialAgentId}
              />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'communication' ? '' : 'hidden'}`}>
              <Communication
                onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents'); }}
                initialGroupName={initialGroupName}
                onClearInitialGroupName={() => setInitialGroupName(undefined)}
                isActive={page === 'communication'}
              />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'activity' ? '' : 'hidden'}`}>
              <Activity onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }} />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'docs' ? '' : 'hidden'}`}>
              <DocHub initialFile={docFile} />
            </div>
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  )
}

function TopBar({ system, onMobileMenuToggle }: { system: SystemInfo | null; onMobileMenuToggle?: () => void }) {
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
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden text-gray-600 hover:text-gray-900 transition-colors p-1"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
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

function NavItemDraggable({ label, icon, active, onClick, collapsed, onDragStart, onDragOver, onDragEnd }: {
  label: string
  icon: string
  active: boolean
  onClick: () => void
  collapsed: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const icons: Record<string, string> = {
    robot: '🤖',
    comms: '💬',
    activity: '📊',
    docs: '📄',
  }

  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-move ${
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
