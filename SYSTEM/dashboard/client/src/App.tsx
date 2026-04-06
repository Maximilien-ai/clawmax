import React, { useState, useEffect } from 'react'
import Agents from './pages/Agents'
import DocHub from './pages/DocHub'
import Activity from './pages/Activity'
import Communication from './pages/Communication'
import Templates from './pages/Templates'
import Organizations from './pages/Organizations'
import Workflows from './pages/Workflows'
import Logs from './pages/Logs'
import { SkillsTest } from './pages/SkillsTest'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConnectionStatus } from './components/ConnectionStatus'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { WorkspaceDialog } from './components/WorkspaceDialog'
import { ByokWizard } from './components/ByokWizard'
import { NotificationCenter } from './components/NotificationCenter'
import { OnboardingWizard } from './components/OnboardingWizard'

type Page = 'agents' | 'activity' | 'communication' | 'docs' | 'templates' | 'organizations' | 'workflows' | 'skills' | 'logs'

interface SystemInfo {
  hostname: string
  agentCount: number
  activeAgentCount: number
  pausedAgentCount: number
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
  { id: 'workflows', label: 'Workflows', icon: 'workflows' },
  { id: 'communication', label: 'Communication', icon: 'comms' },
  { id: 'organizations', label: 'Organization', icon: 'org' },
  { id: 'docs', label: 'Documents', icon: 'docs' },
  // System tabs below - separated by divider
  { id: 'templates', label: 'Templates', icon: 'templates' },
  { id: 'skills', label: 'Skills', icon: 'skills' },
  { id: 'logs', label: 'System & Logs', icon: 'logs' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
]

// User tabs that can be rearranged (first 5)
const USER_TABS_COUNT = 5
const SYSTEM_TABS_ORDER: Page[] = ['templates', 'skills', 'activity', 'logs']

function normalizeNavOrder(saved: NavItem[] | null | undefined): NavItem[] {
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_NAV_ORDER

  const byId = new Map(DEFAULT_NAV_ORDER.map(item => [item.id, item]))
  const userTabs = saved.filter((item): item is NavItem => Boolean(item?.id && byId.has(item.id) && !SYSTEM_TABS_ORDER.includes(item.id)))
  const uniqueUserTabs: NavItem[] = []
  const seen = new Set<Page>()

  for (const item of userTabs) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    uniqueUserTabs.push(byId.get(item.id)!)
  }

  for (const item of DEFAULT_NAV_ORDER.slice(0, USER_TABS_COUNT)) {
    if (!seen.has(item.id)) uniqueUserTabs.push(item)
  }

  return [
    ...uniqueUserTabs.slice(0, USER_TABS_COUNT),
    ...SYSTEM_TABS_ORDER.map(id => byId.get(id)!).filter(Boolean),
  ]
}

/** Sidebar user badge with avatar and logout */
function UserBadge({ collapsed }: { collapsed: boolean }) {
  const { user, logout, config } = useAuth()
  if (!user || config?.authDisabled) return null

  if (collapsed) {
    return (
      <div className="border-t border-gray-700 px-2 py-2 flex justify-center">
        {user.avatar ? (
          <img src={user.avatar} alt={user.login} className="w-6 h-6 rounded-full" title={`${user.login} — click to logout`} onClick={logout} style={{ cursor: 'pointer' }} />
        ) : (
          <button onClick={logout} className="w-6 h-6 rounded-full bg-sky-500/20 text-[10px] font-semibold text-sky-200" title={`${user.login} — click to logout`}>
            {user.login.slice(0, 2).toUpperCase()}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="border-t border-gray-700 px-4 py-2 flex items-center gap-2">
      {user.avatar ? (
        <img src={user.avatar} alt={user.login} className="w-6 h-6 rounded-full" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-sky-500/20 text-[10px] font-semibold text-sky-200 flex items-center justify-center">
          {user.login.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="text-xs text-gray-300 truncate flex-1">{user.name || user.login}</span>
      <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-300" title="Sign out">
        Logout
      </button>
    </div>
  )
}

/** Gate that shows login page when auth is required and user is not logged in */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, config } = useAuth()

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Checking session...</div>
      </div>
    )
  }

  // If auth is disabled, skip login
  if (config?.authDisabled) {
    return <>{children}</>
  }

  // If auth is required and user isn't logged in, always block here.
  // Login.tsx handles both the GitHub OAuth path and the "OAuth not configured" setup message.
  if (!user) {
    return <Login />
  }

  return <>{children}</>
}

export default function App() {
  const [page, setPage] = useState<Page>('agents')
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [docFile, setDocFile] = useState<string | undefined>(undefined)
  const [initialAgentId, setInitialAgentId] = useState<string | undefined>(undefined)
  const [initialAgentAction, setInitialAgentAction] = useState<'create' | 'import' | undefined>(undefined)
  const [initialGroupName, setInitialGroupName] = useState<string | undefined>(undefined)
  const [initialSkillsAgent, setInitialSkillsAgent] = useState<string | undefined>(undefined)
  const [initialWorkflowId, setInitialWorkflowId] = useState<string | undefined>(undefined)
  const [initialCommunityName, setInitialCommunityName] = useState<string | undefined>(undefined)
  const [initialOrgGroupName, setInitialOrgGroupName] = useState<string | undefined>(undefined)
  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false)
  const [navOrder, setNavOrder] = useState<NavItem[]>(() => {
    const saved = localStorage.getItem('nav-order')
    if (saved) {
      try {
        return normalizeNavOrder(JSON.parse(saved))
      } catch {
        return DEFAULT_NAV_ORDER
      }
    }
    return DEFAULT_NAV_ORDER
  })
  const [draggedNavIndex, setDraggedNavIndex] = useState<number | null>(null)
  const [runningWorkflowsCount, setRunningWorkflowsCount] = useState(0)
  const [totalUnread, setTotalUnread] = useState(0)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // Check localStorage first
    const saved = localStorage.getItem('dark-mode')
    if (saved !== null) {
      return saved === 'true'
    }
    // Fall back to browser preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('dark-mode', String(darkMode))
  }, [darkMode])

  useEffect(() => {
    const load = () =>
      fetch('/api/system')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then(d => setSystem(d))
        .catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  // Poll for running workflows count
  useEffect(() => {
    const checkRunningWorkflows = async () => {
      try {
        const res = await fetch('/api/workflows')
        if (!res.ok) return
        const data = await res.json()
        const workflows = data.workflows || []

        const checks = await Promise.all(
          workflows.map(async (w: any) => {
            const execRes = await fetch(`/api/workflows/${w.id}/executions?limit=1`)
            const execData = await execRes.json()
            const latest = execData.executions?.[0]
            return latest?.status === 'running'
          })
        )

        const count = checks.filter(Boolean).length
        setRunningWorkflowsCount(count)
      } catch (err) {
        console.error('Error checking running workflows:', err)
      }
    }

    checkRunningWorkflows()
    const interval = setInterval(checkRunningWorkflows, 5000)
    return () => clearInterval(interval)
  }, [])

  // Poll for unread message counts (scoped to current workspace channels)
  useEffect(() => {
    const checkUnread = () => {
      Promise.all([
        fetch('/api/message-counts').then(r => r.ok ? r.json() : {}),
        fetch('/api/channels/groups').then(r => r.ok ? r.json() : { groups: [] }),
        fetch('/api/channels/communities').then(r => r.ok ? r.json() : { communities: [] }),
      ]).then(([d, g, c]) => {
        const counts = d.counts || {}
        const lastSeen = JSON.parse(localStorage.getItem('clawmax-last-seen-counts') || '{}')
        // Only count channels that exist in the current workspace
        const validKeys = new Set([
          ...(g.groups || []).map((gr: any) => `group:${gr.name}`),
          ...(c.communities || []).map((co: any) => `community:${co.name}`),
        ])
        let total = 0
        for (const [key, count] of Object.entries(counts)) {
          if (!validKeys.has(key)) continue
          const seen = lastSeen[key] || 0
          if ((count as number) > seen) total += (count as number) - seen
        }
        setTotalUnread(total)
      }).catch(() => {})
    }
    checkUnread()
    const interval = setInterval(checkUnread, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleNavDragStart = (index: number) => {
    setDraggedNavIndex(index)
  }

  const handleNavDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedNavIndex === null || draggedNavIndex === index) return

    // Prevent dragging across the separator
    if (draggedNavIndex < USER_TABS_COUNT && index >= USER_TABS_COUNT) return
    if (draggedNavIndex >= USER_TABS_COUNT && index < USER_TABS_COUNT) return

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

  useEffect(() => {
    const normalized = normalizeNavOrder(navOrder)
    if (JSON.stringify(normalized) !== JSON.stringify(navOrder)) {
      setNavOrder(normalized)
      localStorage.setItem('nav-order', JSON.stringify(normalized))
    }
  }, [navOrder])

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate>
        <ToastProvider>
        <WorkspaceProvider>
          <ConnectionStatus />
          <WorkspaceDialog
            isOpen={showWorkspaceDialog}
            onClose={() => setShowWorkspaceDialog(false)}
          />
          <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 dark:bg-gray-900">
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
                <React.Fragment key={item.id}>
                  <NavItemDraggable
                    label={item.label}
                    icon={item.icon}
                    active={page === item.id}
                    badge={item.id === 'communication' && totalUnread > 0 ? totalUnread : undefined}
                    onClick={() => {
                      setPage(item.id)
                      setMobileNavOpen(false)
                    }}
                    collapsed={navCollapsed}
                    onDragStart={index < USER_TABS_COUNT ? () => handleNavDragStart(index) : undefined}
                    onDragOver={index < USER_TABS_COUNT ? (e) => handleNavDragOver(e, index) : undefined}
                    onDragEnd={index < USER_TABS_COUNT ? handleNavDragEnd : undefined}
                  />
                  {/* Dividers between major sidebar sections */}
                  {(index === USER_TABS_COUNT - 1 || item.id === 'skills') && (
                    <div className="my-2 mx-3 border-t border-gray-700"></div>
                  )}
                </React.Fragment>
              ))}
            </nav>

            {/* User info */}
            <UserBadge collapsed={navCollapsed} />

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
            <TopBar
              system={system}
              onMobileMenuToggle={() => setMobileNavOpen(true)}
              onOpenWorkspaceDialog={() => setShowWorkspaceDialog(true)}
              runningWorkflowsCount={runningWorkflowsCount}
              onClickRunningWorkflows={() => setPage('workflows')}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode(d => !d)}
              onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents') }}
              onNavigateToWorkflow={(workflowId) => { setInitialWorkflowId(workflowId); setPage('workflows') }}
              onNavigateToPage={(p) => setPage(p as any)}
              onNavigateToDoc={(file) => { setDocFile(file); setPage('docs') }}
              onOpenAgentCreate={() => { setInitialAgentAction('create'); setPage('agents') }}
              onOpenAgentImport={() => { setInitialAgentAction('import'); setPage('agents') }}
              onOpenByok={() => window.dispatchEvent(new CustomEvent('open-byok-wizard'))}
            />
            <div className={`flex-1 overflow-auto ${page === 'agents' ? '' : 'hidden'}`}>
              <Agents
                onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                onNavigateToGroup={(groupName) => { setInitialGroupName(groupName); setPage('communication'); }}
                onNavigateToSkills={(agentId) => { setInitialSkillsAgent(agentId); setPage('skills'); }}
                onNavigateToWorkflows={() => { setPage('workflows'); }}
                onNavigateToTemplates={() => { setPage('templates'); }}
                initialAgentId={initialAgentId}
                initialAction={initialAgentAction}
                onInitialActionHandled={() => setInitialAgentAction(undefined)}
                isActive={page === 'agents'}
              />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'templates' ? '' : 'hidden'}`}>
              <Templates />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'organizations' ? '' : 'hidden'}`}>
              <Organizations
                onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents'); }}
                onNavigateToWorkflow={(workflowId) => { setInitialWorkflowId(workflowId); setPage('workflows'); }}
                onNavigateToGroup={(groupName) => { setInitialGroupName(groupName); setPage('communication'); }}
                initialCommunityName={initialCommunityName}
                initialGroupName={initialOrgGroupName}
              />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'workflows' ? '' : 'hidden'}`}>
              <Workflows
                onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents'); }}
                onNavigateToGroup={(groupName) => { setInitialGroupName(groupName); setPage('communication'); }}
                onNavigateToCommunity={(communityName) => { setInitialCommunityName(communityName); setPage('organizations'); }}
                onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                initialWorkflowId={initialWorkflowId}
              />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'skills' ? '' : 'hidden'}`}>
              <SkillsTest initialAgentId={initialSkillsAgent} />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'communication' ? '' : 'hidden'}`}>
              <Communication
                onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents'); }}
                onNavigateToWorkflow={(workflowId) => { setInitialWorkflowId(workflowId); setPage('workflows'); }}
                onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                initialGroupName={initialGroupName}
                onClearInitialGroupName={() => setInitialGroupName(undefined)}
                isActive={page === 'communication'}
              />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'activity' ? '' : 'hidden'}`}>
              <Activity onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }} />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'logs' ? '' : 'hidden'}`}>
              <Logs />
            </div>
            <div className={`flex-1 overflow-auto ${page === 'docs' ? '' : 'hidden'}`}>
              <DocHub initialFile={docFile} />
            </div>
          </main>
          </div>
        </WorkspaceProvider>
      </ToastProvider>
        </AuthGate>
      </AuthProvider>
    </ErrorBoundary>
  )
}

function TopBar({ system, onMobileMenuToggle, onOpenWorkspaceDialog, runningWorkflowsCount, onClickRunningWorkflows, darkMode, onToggleDarkMode, onNavigateToAgent, onNavigateToWorkflow, onNavigateToPage, onNavigateToDoc, onOpenAgentCreate, onOpenAgentImport, onOpenByok }: {
  system: SystemInfo | null
  onMobileMenuToggle?: () => void
  onOpenWorkspaceDialog?: () => void
  runningWorkflowsCount?: number
  onClickRunningWorkflows?: () => void
  darkMode?: boolean
  onToggleDarkMode?: () => void
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onNavigateToPage?: (page: string) => void
  onNavigateToDoc?: (path: string) => void
  onOpenAgentCreate?: () => void
  onOpenAgentImport?: () => void
  onOpenByok?: () => void
}) {
  const { user, logout, config } = useAuth()

  const effectiveActiveAgentCount = system
    ? (typeof system.activeAgentCount === 'number'
        ? system.activeAgentCount
        : Math.max(0, (system.agentCount ?? 0) - (system.pausedAgentCount ?? 0)))
    : 0
  const allOnline = !!system && system.onlineCount === effectiveActiveAgentCount && effectiveActiveAgentCount > 0

  // Split orgName at last "." to style the tld separately (e.g. "Maximilien" + ".ai")
  let orgBase = system?.orgName ?? null
  let orgTld: string | null = null
  if (system?.orgName) {
    const dot = system.orgName.lastIndexOf('.')
    if (dot > 0) {
      orgBase = system.orgName.slice(0, dot)
      orgTld = system.orgName.slice(dot) // includes the dot
    }
  }

  return (
    <div className="h-9 flex items-center justify-between px-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 dark:border-gray-700">
      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-1 dark:text-gray-100"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Workspace switcher */}
        {onOpenWorkspaceDialog && (
          <WorkspaceSwitcher onCreateNew={onOpenWorkspaceDialog} />
        )}

        {orgBase && (
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200 tracking-tight dark:text-gray-200">
            {orgBase}{orgTld && <span className="text-sky-500 dark:text-sky-400">{orgTld}</span>}
          </span>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-mono text-gray-400 dark:text-gray-500 hidden sm:inline">{system?.hostname}</span>
          <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">·</span>
          <span className="hidden sm:inline">{system?.agentCount ?? 0} agent{(system?.agentCount ?? 0) !== 1 ? 's' : ''}</span>
          <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">·</span>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${allOnline ? 'bg-green-400' : (system?.onlineCount ?? 0) > 0 ? 'bg-yellow-400' : 'bg-gray-300'}`} />
            <span className="hidden sm:inline">{system?.onlineCount ?? 0} online</span>
          </span>
          {runningWorkflowsCount !== undefined && runningWorkflowsCount > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <button
                onClick={onClickRunningWorkflows}
                className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors dark:text-gray-300"
                title="View running workflows"
              >
                <span className="animate-pulse">⚙️</span>
                <span>{runningWorkflowsCount} running</span>
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationCenter
          onNavigateToAgent={onNavigateToAgent}
          onNavigateToWorkflow={onNavigateToWorkflow}
          onNavigateToPage={onNavigateToPage}
          onNavigateToDoc={onNavigateToDoc}
          onAgentRestarted={() => window.dispatchEvent(new CustomEvent('agents-updated'))}
        />
        <OnboardingWizard
          visible={(system?.agentCount || 0) === 0}
          onOpenByok={() => onOpenByok?.()}
          onImportAgents={() => onOpenAgentImport?.()}
          onCreateAgent={() => onOpenAgentCreate?.()}
          onOpenTemplates={() => onNavigateToPage?.('templates')}
        />
        <ByokWizard />
        {user && !config?.authDisabled && (
          <div className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2.5 py-1">
            {user.avatar ? (
              <img src={user.avatar} alt={user.login} className="w-5 h-5 rounded-full shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-sky-500/20 text-[9px] font-semibold text-sky-300 flex items-center justify-center shrink-0">
                {user.login.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="hidden sm:inline text-xs text-gray-600 dark:text-gray-300 max-w-[140px] truncate">
              {user.name || user.login}
            </span>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              title="Sign out"
            >
              Logout
            </button>
          </div>
        )}
        {/* Dark mode toggle */}
        {onToggleDarkMode && (
          <button
            onClick={onToggleDarkMode}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1 dark:text-gray-300"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        )}
        <span className="text-xs text-gray-300 dark:text-gray-600 font-mono">{system?.version}</span>
      </div>
    </div>
  )
}

function NavItemDraggable({ label, icon, active, badge, onClick, collapsed, onDragStart, onDragOver, onDragEnd }: {
  label: string
  icon: string
  active: boolean
  badge?: number
  onClick: () => void
  collapsed: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const icons: Record<string, string> = {
    robot: '🤖',
    org: '🏢',
    templates: '📑',
    workflows: '⚙️',
    skills: '🛠️',
    comms: '💬',
    activity: '📊',
    docs: '📄',
    logs: '📜',
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
      <span className="relative">
        {icons[icon]}
        {badge != null && badge > 0 && collapsed && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
            {badge > 99 ? '!' : badge}
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="flex-1 flex items-center justify-between">
          {label}
          {badge != null && badge > 0 && (
            <span className="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
