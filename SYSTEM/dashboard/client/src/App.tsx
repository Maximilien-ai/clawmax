import React, { useState, useEffect, useRef } from 'react'
import Builder from './pages/Builder'
import Agents from './pages/Agents'
import DocHub from './pages/DocHub'
import { subscribeSystemRefresh } from './lib/systemRefresh'
import Activity from './pages/Activity'
import Communication from './pages/Communication'
import Templates from './pages/Templates'
import Organizations from './pages/Organizations'
import Workflows from './pages/Workflows'
import Logs from './pages/Logs'
import { SkillsTest } from './pages/SkillsTest'
import KeysSecrets from './pages/KeysSecrets'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConnectionStatus } from './components/ConnectionStatus'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { WorkspaceDialog } from './components/WorkspaceDialog'
import { ByokWizard } from './components/ByokWizard'
import { HostAgentStatusBanner } from './components/HostAgentStatusBanner'
import { MaintenanceBanner } from './components/MaintenanceBanner'
import { NotificationCenter } from './components/NotificationCenter'
import { OnboardingWizard } from './components/OnboardingWizard'
import { TermsOfServiceModal } from './components/TermsOfServiceModal'
import { WorkspaceFirstRunTour } from './components/WorkspaceFirstRunTour'
import { useWorkspace } from './contexts/WorkspaceContext'
import { CHANNEL_API_ENDPOINTS } from './lib/channelApi'
import { getVisibleMaintenanceBanner } from './lib/maintenanceBannerView'
import { type DashboardPage, pageToPath, pathToPage } from './lib/navigation'
import { readGlobalWorkspaceTourDisabled, readWorkspaceTourState, resetWorkspaceTourState, shouldShowWorkspaceTour, writeWorkspaceTourState } from './lib/onboardingTour'

type Page = DashboardPage

interface SystemInfo {
  hostname: string
  instanceKey?: string | null
  machineId?: string | null
  machineName?: string | null
  instanceLabel?: string | null
  agentCount: number
  activeAgentCount: number
  pausedAgentCount: number
  onlineCount: number
  version: string
  orgName: string | null
  maintenanceBanner?: {
    enabled: boolean
    text: string
    level: 'info' | 'warning' | 'critical'
    startAt?: string
    endAt?: string
    link?: string
    dismissible: boolean
  } | null
  hostAgentStatus?: {
    state: 'unauthorized' | 'unreachable' | 'warning'
    title: string
    detail: string
    hint: string
  } | null
}

interface NavItem {
  id: Page
  label: string
  icon: React.ComponentType<{ className?: string }>
}

function iconClassName(className?: string) {
  return `h-4 w-4 shrink-0${className ? ` ${className}` : ''}`
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M12 8V4" />
      <path d="M8 4h8" />
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M9 13h.01" />
      <path d="M15 13h.01" />
      <path d="M9 17h6" />
    </svg>
  )
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
      <path d="M5 18.5 6 21l1-2.5L9.5 17 7 16l-1-2.5L5 16l-2.5 1L5 18.5Z" />
      <path d="M19 16.5 19.7 18l1.8.7-1.8.7L19 21l-.7-1.6-1.8-.7 1.8-.7L19 16.5Z" />
    </svg>
  )
}

function WorkflowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 6h8" />
      <path d="M6 8v8" />
      <path d="M18 8v8" />
      <path d="M8 18h8" />
    </svg>
  )
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M7 10h10" />
      <path d="M7 14h6" />
      <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
    </svg>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
      <path d="M9 13h.01" />
      <path d="M15 13h.01" />
      <path d="M10 21v-4h4v4" />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  )
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-3-3Z" />
    </svg>
  )
}

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10" />
      <path d="M7 12h4" />
      <path d="M13 12h4" />
      <path d="M7 16h10" />
    </svg>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M11 15.5h10" />
      <path d="M18 12.5v6" />
      <path d="M14 13.5v4" />
    </svg>
  )
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M3 3v18h18" />
      <path d="m7 14 3-3 3 2 4-5" />
    </svg>
  )
}

function LogIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ChevronRightSmallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

const DEFAULT_NAV_ORDER: NavItem[] = [
  { id: 'builder', label: 'Builder', icon: SparkIcon },
  { id: 'organizations', label: 'Organization', icon: BuildingIcon },
  { id: 'agents', label: 'Agents', icon: BotIcon },
  { id: 'workflows', label: 'Workflows', icon: WorkflowIcon },
  { id: 'communication', label: 'Communications', icon: MessageIcon },
  { id: 'skills', label: 'Skills', icon: WrenchIcon },
  { id: 'templates', label: 'Templates', icon: TemplateIcon },
  // System tabs below - separated by divider
  { id: 'docs', label: 'Documents', icon: FileIcon },
  { id: 'keys', label: 'Keys & Secrets', icon: KeyIcon },
  { id: 'activity', label: 'Activity & Budget', icon: ActivityIcon },
  { id: 'logs', label: 'System & Logs', icon: LogIcon },
]

const USER_TABS_COUNT = 7
const PRIMARY_CLIENT_GROUPS: Page[][] = [
  ['builder', 'organizations'],
  ['agents', 'workflows', 'communication'],
  ['skills', 'templates'],
]
const DOCUMENTS_TABS_ORDER: Page[] = ['docs']
const CREATION_TABS_ORDER: Page[] = []
const OPERATIONS_TABS_ORDER: Page[] = ['keys', 'activity', 'logs']
const SYSTEM_TABS_ORDER: Page[] = [...DOCUMENTS_TABS_ORDER, ...CREATION_TABS_ORDER, ...OPERATIONS_TABS_ORDER]
const SYSTEM_NAV_EXPANDED_STORAGE_KEY = 'clawmax-system-nav-expanded'

function getPrimaryClientGroupIndex(page: Page | undefined): number {
  if (!page) return -1
  return PRIMARY_CLIENT_GROUPS.findIndex((group) => group.includes(page))
}

function normalizeNavOrder(saved: NavItem[] | null | undefined): NavItem[] {
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_NAV_ORDER

  const byId = new Map(DEFAULT_NAV_ORDER.map(item => [item.id, item]))
  const defaultUserIds = DEFAULT_NAV_ORDER.slice(0, USER_TABS_COUNT).map(item => item.id)
  const defaultSystemIds = DEFAULT_NAV_ORDER.slice(USER_TABS_COUNT).map(item => item.id)
  const uniqueSavedIds: Page[] = []
  const seen = new Set<Page>()

  for (const item of saved) {
    if (!item?.id || !byId.has(item.id) || seen.has(item.id)) continue
    seen.add(item.id)
    uniqueSavedIds.push(item.id)
  }

  const savedUserIds = uniqueSavedIds.filter(id => defaultUserIds.includes(id))
  const savedSystemIds = uniqueSavedIds.filter(id => defaultSystemIds.includes(id))
  const normalizedUserIds: Page[] = []
  for (const group of PRIMARY_CLIENT_GROUPS) {
    const savedGroupIds = savedUserIds.filter((id) => group.includes(id))
    const nextGroupIds = savedGroupIds.length > 0
      ? savedGroupIds
      : group.slice()
    for (const id of group) {
      if (!nextGroupIds.includes(id)) nextGroupIds.push(id)
    }
    normalizedUserIds.push(...nextGroupIds)
  }

  for (const id of defaultSystemIds) {
    if (!savedSystemIds.includes(id)) savedSystemIds.push(id)
  }

  return [...normalizedUserIds, ...savedSystemIds].map(id => byId.get(id)!).filter(Boolean)
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

function WorkspaceScoped({ pageKey, children }: { pageKey: string; children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceKey = activeWorkspace?.id || activeWorkspace?.path || 'default'
  return <React.Fragment key={`${workspaceKey}:${pageKey}`}>{children}</React.Fragment>
}

export default function App() {
  const [page, setPage] = useState<Page>(() => pathToPage(window.location.pathname))
  const [visitedPages, setVisitedPages] = useState<Set<Page>>(() => new Set<Page>([pathToPage(window.location.pathname)]))
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [systemNavExpanded, setSystemNavExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem(SYSTEM_NAV_EXPANDED_STORAGE_KEY)
    return saved === 'true'
  })
  const systemTourAutoExpandRef = useRef<null | boolean>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [docFile, setDocFile] = useState<string | undefined>(undefined)
  const [initialAgentId, setInitialAgentId] = useState<string | undefined>(undefined)
  const [initialAgentAction, setInitialAgentAction] = useState<'create' | 'create-ai' | 'import' | 'chat' | undefined>(undefined)
  const [initialGroupName, setInitialGroupName] = useState<string | undefined>(undefined)
  const [initialOpenChatName, setInitialOpenChatName] = useState<string | undefined>(undefined)
  const [initialSkillsAgent, setInitialSkillsAgent] = useState<string | undefined>(undefined)
  const [initialSkillsSkill, setInitialSkillsSkill] = useState<string | undefined>(undefined)
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
  const [dismissedMaintenanceKey, setDismissedMaintenanceKey] = useState<string | null>(null)
  const [showTermsOfService, setShowTermsOfService] = useState(false)

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('dark-mode', String(darkMode))
  }, [darkMode])

  const maintenanceBanner = system?.maintenanceBanner || null
  const maintenanceBannerKey = maintenanceBanner
    ? [maintenanceBanner.text, maintenanceBanner.startAt || '', maintenanceBanner.endAt || '', maintenanceBanner.link || ''].join('|')
    : null
  const maintenanceBannerVisible = Boolean(getVisibleMaintenanceBanner(
    maintenanceBanner,
    dismissedMaintenanceKey,
    maintenanceBannerKey,
  ))

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(page)) return prev
      const next = new Set(prev)
      next.add(page)
      return next
    })
  }, [page])

  useEffect(() => {
    const canonicalPath = pageToPath(page)
    if (window.location.pathname !== canonicalPath) {
      window.history.pushState({}, '', canonicalPath)
    }
  }, [page])

  useEffect(() => {
    const initialPage = pathToPage(window.location.pathname)
    const initialPath = pageToPath(initialPage)
    if (window.location.pathname !== initialPath) {
      window.history.replaceState({}, '', initialPath)
    }

    const handlePopState = () => {
      setPage(pathToPage(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const load = () =>
      fetch('/api/system')
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then(d => setSystem(d))
        .catch(() => {})
    load()
    const t = setInterval(load, 30000)
    const unsubscribe = subscribeSystemRefresh(load)
    return () => {
      clearInterval(t)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const rawLabel = typeof system?.instanceLabel === 'string' ? system.instanceLabel.trim() : ''
    if (!rawLabel) {
      document.title = 'ClawMax'
      return
    }
    document.title = `ClawMax · ${rawLabel}`
  }, [system?.instanceLabel])

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: Page; doctor?: boolean }>).detail
      if (detail?.page) {
        setPage(detail.page)
      }
      if (detail?.doctor) {
        window.dispatchEvent(new CustomEvent('open-doctor'))
      }
    }

    window.addEventListener('navigate-to-page', handleNavigate as EventListener)
    return () => window.removeEventListener('navigate-to-page', handleNavigate as EventListener)
  }, [])

  useEffect(() => {
    const handleOpenTerms = () => setShowTermsOfService(true)
    window.addEventListener('open-terms-of-service', handleOpenTerms)
    return () => window.removeEventListener('open-terms-of-service', handleOpenTerms)
  }, [])

  // Poll for running workflows count
  useEffect(() => {
    const checkRunningWorkflows = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/workflows')
        if (!res.ok) return
        const data = await res.json()
        const workflows = data.workflows || []
        const count = workflows.filter((w: any) => w.status === 'running').length
        setRunningWorkflowsCount(count)
      } catch (err) {
        console.error('Error checking running workflows:', err)
      }
    }

    checkRunningWorkflows()
    const interval = setInterval(checkRunningWorkflows, 15000)
    return () => clearInterval(interval)
  }, [])

  // Poll for unread message counts (scoped to current workspace channels)
  useEffect(() => {
    const checkUnread = () => {
      if (document.visibilityState !== 'visible') return
      Promise.all([
        fetch('/api/message-counts').then(r => r.ok ? r.json() : {}),
        fetch(CHANNEL_API_ENDPOINTS.groups).then(r => r.ok ? r.json() : { groups: [] }),
        fetch(CHANNEL_API_ENDPOINTS.communities).then(r => r.ok ? r.json() : { communities: [] }),
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
    const interval = setInterval(checkUnread, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleNavDragStart = (index: number) => {
    setDraggedNavIndex(index)
  }

  const handleNavDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedNavIndex === null || draggedNavIndex === index) return

    if (draggedNavIndex < USER_TABS_COUNT && index >= USER_TABS_COUNT) return
    if (draggedNavIndex >= USER_TABS_COUNT && index < USER_TABS_COUNT) return
    if (
      draggedNavIndex < USER_TABS_COUNT &&
      index < USER_TABS_COUNT
    ) {
      const draggedId = navOrder[draggedNavIndex]?.id
      const targetId = navOrder[index]?.id
      if (getPrimaryClientGroupIndex(draggedId) !== getPrimaryClientGroupIndex(targetId)) return
    }
    if (
      draggedNavIndex >= USER_TABS_COUNT &&
      index >= USER_TABS_COUNT
    ) {
      const draggedId = navOrder[draggedNavIndex]?.id
      const targetId = navOrder[index]?.id
      const draggedInCreation = draggedId ? CREATION_TABS_ORDER.includes(draggedId) : false
      const targetInCreation = targetId ? CREATION_TABS_ORDER.includes(targetId) : false
      if (draggedInCreation !== targetInCreation) return
    }

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

  useEffect(() => {
    localStorage.setItem(SYSTEM_NAV_EXPANDED_STORAGE_KEY, String(systemNavExpanded))
  }, [systemNavExpanded])

  useEffect(() => {
    const handleWorkspaceTourStep = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean; stepId?: string | null }>).detail
      const isSystemStep = detail?.visible === true && detail?.stepId === 'system'

      if (isSystemStep) {
        if (systemTourAutoExpandRef.current === null) {
          systemTourAutoExpandRef.current = systemNavExpanded
        }
        if (!systemNavExpanded) {
          setSystemNavExpanded(true)
        }
        return
      }

      if (systemTourAutoExpandRef.current !== null) {
        const wasExpandedBeforeTourStep = systemTourAutoExpandRef.current
        systemTourAutoExpandRef.current = null
        if (!wasExpandedBeforeTourStep) {
          setSystemNavExpanded(false)
        }
      }
    }

    window.addEventListener('clawmax-workspace-tour-step', handleWorkspaceTourStep as EventListener)
    return () => window.removeEventListener('clawmax-workspace-tour-step', handleWorkspaceTourStep as EventListener)
  }, [systemNavExpanded])

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
          <TermsOfServiceModal open={showTermsOfService} onClose={() => setShowTermsOfService(false)} />
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
                <p className="text-xs text-gray-400 mt-0.5">
                  {system?.instanceLabel ? `Owner Dashboard · ${system.instanceLabel}` : 'Owner Dashboard'}
                </p>
              </div>
            )}
            {navCollapsed && (
              <div className="py-5 border-b border-gray-700 flex justify-center">
                <span className="text-white font-bold text-xs tracking-tight">C<span className="text-sky-400">M</span></span>
              </div>
            )}

            {/* Nav */}
            <nav className="flex-1 px-2 py-4 space-y-1">
              {navOrder.slice(0, USER_TABS_COUNT).map((item, index) => (
                <React.Fragment key={item.id}>
                  <NavItemDraggable
                    label={item.label}
                    icon={item.icon}
                    dataTourId={`nav-${item.id}`}
                    active={page === item.id}
                    badge={item.id === 'communication' && totalUnread > 0 ? totalUnread : undefined}
                    onClick={() => {
                      setPage(item.id)
                      setMobileNavOpen(false)
                    }}
                    collapsed={navCollapsed}
                    onDragStart={() => handleNavDragStart(index)}
                    onDragOver={(e) => handleNavDragOver(e, index)}
                    onDragEnd={handleNavDragEnd}
                  />
                  {index < USER_TABS_COUNT - 1 && getPrimaryClientGroupIndex(item.id) !== getPrimaryClientGroupIndex(navOrder[index + 1]?.id as Page) && (
                    <div className="my-2 mx-3 border-t border-gray-700"></div>
                  )}
                </React.Fragment>
              ))}
              <div className="my-2 mx-3 border-t border-gray-700"></div>
              <button
                type="button"
                onClick={() => setSystemNavExpanded((current) => !current)}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white ${navCollapsed ? 'justify-center' : 'justify-between'}`}
                title={navCollapsed ? 'Toggle system navigation' : undefined}
              >
                {navCollapsed ? (
                  systemNavExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightSmallIcon className="h-4 w-4" />
                ) : (
                  <>
                    <span className="uppercase tracking-[0.18em] text-[11px] text-gray-400">System</span>
                    {systemNavExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightSmallIcon className="h-4 w-4" />}
                  </>
                )}
              </button>
              {systemNavExpanded && navOrder.slice(USER_TABS_COUNT).map((item, offset) => {
                const index = USER_TABS_COUNT + offset
                return (
                  <React.Fragment key={item.id}>
                    <NavItemDraggable
                      label={item.label}
                      icon={item.icon}
                      dataTourId={`nav-${item.id}`}
                      active={page === item.id}
                      badge={item.id === 'communication' && totalUnread > 0 ? totalUnread : undefined}
                      onClick={() => {
                        setPage(item.id)
                        setMobileNavOpen(false)
                      }}
                      collapsed={navCollapsed}
                      onDragStart={() => handleNavDragStart(index)}
                      onDragOver={(e) => handleNavDragOver(e, index)}
                      onDragEnd={handleNavDragEnd}
                    />
                  </React.Fragment>
                )
              })}
            </nav>

            {/* User info */}
            <UserBadge collapsed={navCollapsed} />

            {/* Footer / collapse toggle */}
            <div className={`border-t border-gray-700 ${navCollapsed ? 'px-2 py-3 flex justify-center' : 'px-4 py-3 flex items-center justify-between'}`}>
              {!navCollapsed ? (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-mono text-gray-500">{system?.version ?? '…'} · {(system?.machineName || system?.hostname || '…')}</div>
                    <button
                      onClick={() => setShowTermsOfService(true)}
                      className="mt-1 text-[11px] text-sky-400 hover:text-sky-300"
                    >
                      Terms of Service
                    </button>
                  </div>
                  <button
                    onClick={() => setNavCollapsed(c => !c)}
                    className="text-gray-500 hover:text-gray-300 transition-colors text-xs leading-none p-1 rounded hover:bg-gray-800"
                    title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    ◀
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => setShowTermsOfService(true)}
                    className="text-[10px] text-sky-400 hover:text-sky-300"
                    title="Terms of Service"
                  >
                    TOS
                  </button>
                  <button
                    onClick={() => setNavCollapsed(c => !c)}
                    className="text-gray-500 hover:text-gray-300 transition-colors text-xs leading-none p-1 rounded hover:bg-gray-800"
                    title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    ▶
                  </button>
                </div>
              )}
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
              onOpenAgentCreateAI={() => { setInitialAgentAction('create-ai'); setPage('agents') }}
              onOpenAgentImport={() => { setInitialAgentAction('import'); setPage('agents') }}
              onOpenBuilder={() => setPage('builder')}
              onOpenByok={() => window.dispatchEvent(new CustomEvent('open-byok-wizard'))}
              onOpenPartners={() => window.dispatchEvent(new CustomEvent('open-partners-wizard'))}
            />
            {maintenanceBanner && maintenanceBannerVisible && maintenanceBannerKey && (
              <MaintenanceBanner
                banner={maintenanceBanner}
                onDismiss={maintenanceBanner.dismissible ? () => {
                  setDismissedMaintenanceKey(maintenanceBannerKey)
                } : undefined}
              />
            )}
            {system?.hostAgentStatus && (
              <HostAgentStatusBanner status={system.hostAgentStatus} />
            )}
            {visitedPages.has('agents') && (
            <div className={`flex-1 overflow-auto ${page === 'agents' ? '' : 'hidden'}`}>
              <WorkspaceScoped pageKey="agents">
                <Agents
                  onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                  onNavigateToGroup={(groupName) => { setInitialGroupName(groupName); setPage('communication'); }}
                  onNavigateToSkills={(agentId, skillName) => {
                    setInitialSkillsAgent(agentId)
                    setInitialSkillsSkill(skillName)
                    setPage('skills')
                  }}
                  onNavigateToWorkflows={() => { setPage('workflows'); }}
                  onNavigateToTemplates={() => { setPage('templates'); }}
                  initialAgentId={initialAgentId}
                  initialAction={initialAgentAction}
                  onInitialActionHandled={() => setInitialAgentAction(undefined)}
                  isActive={page === 'agents'}
                />
              </WorkspaceScoped>
            </div>
            )}
            {visitedPages.has('builder') && (
            <div className={`flex-1 overflow-auto ${page === 'builder' ? '' : 'hidden'}`}>
              <WorkspaceScoped pageKey="builder">
                <Builder
                  onNavigateToPage={(nextPage) => setPage(nextPage as Page)}
                  onOpenAgentCreate={() => { setInitialAgentAction('create'); setPage('agents') }}
                  onOpenAgentCreateAI={() => { setInitialAgentAction('create-ai'); setPage('agents') }}
                  onOpenAgentImport={() => { setInitialAgentAction('import'); setPage('agents') }}
                  onOpenAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents') }}
                  onOpenAgentChat={(agentId) => { setInitialAgentId(agentId); setInitialAgentAction('chat'); setPage('agents') }}
                  onOpenSkill={(skillName, agentId) => {
                    setInitialSkillsAgent(agentId)
                    setInitialSkillsSkill(skillName)
                    setPage('skills')
                  }}
                  onOpenWorkflow={(workflowId) => { setInitialWorkflowId(workflowId); setPage('workflows') }}
                />
              </WorkspaceScoped>
            </div>
            )}
            {visitedPages.has('templates') && (
            <div className={`flex-1 overflow-auto ${page === 'templates' ? '' : 'hidden'}`}>
              <WorkspaceScoped pageKey="templates">
                <Templates />
              </WorkspaceScoped>
            </div>
            )}
            {visitedPages.has('organizations') && (
            <div className={`flex-1 overflow-auto ${page === 'organizations' ? '' : 'hidden'}`}>
              <WorkspaceScoped pageKey="organizations">
                <Organizations
                  onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents'); }}
                  onNavigateToWorkflow={(workflowId) => { setInitialWorkflowId(workflowId); setPage('workflows'); }}
                  onNavigateToGroup={(groupName) => { setInitialGroupName(groupName); setPage('communication'); }}
                  onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                  initialCommunityName={initialCommunityName}
                  initialGroupName={initialOrgGroupName}
                  isActive={page === 'organizations'}
                />
              </WorkspaceScoped>
            </div>
            )}
            {visitedPages.has('workflows') && (
            <div className={`flex-1 overflow-auto ${page === 'workflows' ? '' : 'hidden'}`}>
              <WorkspaceScoped pageKey="workflows">
                <Workflows
                  onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents'); }}
                  onNavigateToGroup={(groupName, openChat) => {
                    setInitialGroupName(groupName)
                    setInitialOpenChatName(openChat ? groupName : undefined)
                    setPage('communication')
                  }}
                  onNavigateToCommunity={(communityName) => { setInitialCommunityName(communityName); setPage('organizations'); }}
                  onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                  initialWorkflowId={initialWorkflowId}
                  isActive={page === 'workflows'}
                />
              </WorkspaceScoped>
            </div>
            )}
            {visitedPages.has('skills') && (
            <div className={`flex-1 overflow-auto ${page === 'skills' ? '' : 'hidden'}`}>
              <WorkspaceScoped pageKey="skills">
                <SkillsTest initialAgentId={initialSkillsAgent} initialSkillName={initialSkillsSkill} />
              </WorkspaceScoped>
            </div>
            )}
            {page === 'keys' && (
            <div className="flex-1 overflow-auto">
              <WorkspaceScoped pageKey="keys">
                <KeysSecrets />
              </WorkspaceScoped>
            </div>
            )}
            {page === 'communication' && (
            <div className="flex-1 overflow-auto">
              <WorkspaceScoped pageKey="communication">
                <Communication
                  onNavigateToAgent={(agentId) => { setInitialAgentId(agentId); setPage('agents'); }}
                  onNavigateToWorkflow={(workflowId) => { setInitialWorkflowId(workflowId); setPage('workflows'); }}
                  onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }}
                  initialGroupName={initialGroupName}
                  onClearInitialGroupName={() => setInitialGroupName(undefined)}
                  initialOpenChatName={initialOpenChatName}
                  onClearInitialOpenChatName={() => setInitialOpenChatName(undefined)}
                  isActive={page === 'communication'}
                />
              </WorkspaceScoped>
            </div>
            )}
            {page === 'activity' && (
            <div className="flex-1 overflow-auto">
              <WorkspaceScoped pageKey="activity">
                <Activity isActive={page === 'activity'} onNavigateToDoc={(file) => { setDocFile(file); setPage('docs'); }} />
              </WorkspaceScoped>
            </div>
            )}
            {page === 'logs' && (
            <div className="flex-1 overflow-auto">
              <WorkspaceScoped pageKey="logs">
                <Logs />
              </WorkspaceScoped>
            </div>
            )}
            {visitedPages.has('docs') && (
            <div className={`flex-1 overflow-auto ${page === 'docs' ? '' : 'hidden'}`}>
              <WorkspaceScoped pageKey="docs">
                <DocHub initialFile={docFile} />
              </WorkspaceScoped>
            </div>
            )}
          </main>
          </div>
        </WorkspaceProvider>
      </ToastProvider>
        </AuthGate>
      </AuthProvider>
    </ErrorBoundary>
  )
}

function TopBar({ system, onMobileMenuToggle, onOpenWorkspaceDialog, runningWorkflowsCount, onClickRunningWorkflows, darkMode, onToggleDarkMode, onNavigateToAgent, onNavigateToWorkflow, onNavigateToPage, onNavigateToDoc, onOpenAgentCreate, onOpenAgentCreateAI, onOpenAgentImport, onOpenBuilder, onOpenByok, onOpenPartners }: {
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
  onOpenAgentCreateAI?: () => void
  onOpenAgentImport?: () => void
  onOpenBuilder?: () => void
  onOpenByok?: () => void
  onOpenPartners?: () => void
}) {
  const { user, logout, config } = useAuth()
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace()
  const activeWorkspaceKey = activeWorkspace?.path || activeWorkspace?.id || null
  const rawOnboardingVisible = !workspaceLoading && !!activeWorkspace && (activeWorkspace.agentCount ?? 0) === 0
  const [stickyOnboardingWorkspaceKey, setStickyOnboardingWorkspaceKey] = useState<string | null>(null)
  const [workspaceTourVisible, setWorkspaceTourVisible] = useState(false)
  const [workspaceTourStateVersion, setWorkspaceTourStateVersion] = useState(0)

  useEffect(() => {
    if (!activeWorkspaceKey) return
    if ((activeWorkspace.agentCount ?? 0) === 0) {
      setStickyOnboardingWorkspaceKey(activeWorkspaceKey)
      return
    }
    if (stickyOnboardingWorkspaceKey === activeWorkspaceKey) {
      setStickyOnboardingWorkspaceKey(null)
    }
  }, [activeWorkspace?.agentCount, activeWorkspaceKey, stickyOnboardingWorkspaceKey])

  const effectiveOnboardingWorkspaceKey = activeWorkspaceKey || stickyOnboardingWorkspaceKey
  const onboardingVisible = rawOnboardingVisible || (!!effectiveOnboardingWorkspaceKey && stickyOnboardingWorkspaceKey === effectiveOnboardingWorkspaceKey)
  const workspaceTourStoredState = effectiveOnboardingWorkspaceKey ? readWorkspaceTourState(effectiveOnboardingWorkspaceKey) : null
  const workspaceTourGloballyDisabled = readGlobalWorkspaceTourDisabled()
  const workspaceTourDismissed = workspaceTourStoredState === 'dismissed' || workspaceTourGloballyDisabled

  useEffect(() => {
    const workspaceKey = effectiveOnboardingWorkspaceKey
    if (!workspaceKey) {
      setWorkspaceTourVisible(false)
      return
    }
    setWorkspaceTourVisible(shouldShowWorkspaceTour({
      workspaceKey,
      workspaceAgentCount: activeWorkspace?.agentCount,
      onboardingVisible,
      storedState: workspaceTourStoredState,
      globallyDisabled: workspaceTourGloballyDisabled,
    }))
  }, [activeWorkspace?.agentCount, effectiveOnboardingWorkspaceKey, onboardingVisible, workspaceTourGloballyDisabled, workspaceTourStateVersion, workspaceTourStoredState])

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
    <>
      <WorkspaceFirstRunTour
        visible={workspaceTourVisible}
        onNavigateToPage={(nextPage) => onNavigateToPage?.(nextPage)}
        onDismiss={(state) => {
          if (effectiveOnboardingWorkspaceKey) {
            writeWorkspaceTourState(effectiveOnboardingWorkspaceKey, state)
            setWorkspaceTourStateVersion((current) => current + 1)
          }
          setWorkspaceTourVisible(false)
        }}
      />
      <div className="min-h-11 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 shrink-0 dark:border-gray-700 dark:bg-gray-800 md:min-h-14 md:px-5 md:py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-4">
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
          <div data-tour="workspace-switcher">
            <WorkspaceSwitcher onCreateNew={onOpenWorkspaceDialog} />
          </div>
        )}

        {orgBase && (
          <span className="hidden md:inline text-sm font-bold text-gray-800 dark:text-gray-200 tracking-tight dark:text-gray-200">
            {orgBase}{orgTld && <span className="text-sky-500 dark:text-sky-400">{orgTld}</span>}
          </span>
        )}
        <div className="hidden min-w-0 items-center gap-3 text-xs text-gray-500 dark:text-gray-400 sm:flex">
          <span className="hidden max-w-[10rem] truncate whitespace-nowrap font-mono text-gray-400 dark:text-gray-500 lg:inline xl:max-w-[14rem]">{system?.machineName || system?.hostname}</span>
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
      <div className="flex w-full items-center justify-end gap-2 md:w-auto md:gap-3">
        <div data-tour="notifications">
          <NotificationCenter
            onNavigateToAgent={onNavigateToAgent}
            onNavigateToWorkflow={onNavigateToWorkflow}
            onNavigateToPage={onNavigateToPage}
            onNavigateToDoc={onNavigateToDoc}
            onAgentRestarted={() => window.dispatchEvent(new CustomEvent('agents-updated'))}
          />
        </div>
        <OnboardingWizard
          visible={onboardingVisible}
          suppressAutoOpen={workspaceTourVisible}
          canShowWorkspaceTour={Boolean(effectiveOnboardingWorkspaceKey && (activeWorkspace?.agentCount ?? 0) === 0)}
          workspaceTourDismissed={workspaceTourDismissed}
          onOpenByok={() => onOpenByok?.()}
          onOpenPartners={() => onOpenPartners?.()}
          onImportAgents={() => onOpenAgentImport?.()}
          onOpenBuilder={() => onOpenBuilder?.()}
          onOpenWorkspaceTour={() => setWorkspaceTourVisible(true)}
          onResetWorkspaceTour={() => {
            if (!effectiveOnboardingWorkspaceKey) return
            resetWorkspaceTourState(effectiveOnboardingWorkspaceKey)
            setWorkspaceTourVisible(false)
            setWorkspaceTourStateVersion((current) => current + 1)
          }}
          onCreateAgent={() => onOpenAgentCreate?.()}
          onCreateAgentAI={() => onOpenAgentCreateAI?.()}
          onOpenTemplates={() => onNavigateToPage?.('templates')}
          workspaceId={effectiveOnboardingWorkspaceKey}
        />
        <div data-tour="byok">
          <ByokWizard
            triggerLabel="BYOK"
            triggerTitle="Configure model providers and local runtime"
            initialStep="models"
            openEventName="open-byok-wizard"
            suppressAutoOpen={onboardingVisible}
          />
        </div>
        <ByokWizard
          triggerLabel="Partners"
          triggerTitle="Configure optional partner integrations"
          initialStep="partners"
          openEventName="open-partners-wizard"
          suppressAutoOpen={onboardingVisible}
        />
        {user && !config?.authDisabled && (
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2.5 py-1">
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
        <span className="hidden md:inline text-xs text-gray-300 dark:text-gray-600 font-mono">{system?.version}</span>
      </div>
      </div>
    </>
  )
}

function NavItemDraggable({ label, icon: Icon, dataTourId, active, badge, onClick, collapsed, onDragStart, onDragOver, onDragEnd }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  dataTourId?: string
  active: boolean
  badge?: number
  onClick: () => void
  collapsed: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  return (
    <button
      data-tour={dataTourId}
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
      <span className="relative flex items-center justify-center">
        <Icon className="h-4 w-4" />
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
