import React, { useEffect, useState, useCallback, useMemo } from 'react'
import AgentDetailPanel from '../components/AgentDetailPanel'
import AddAgentWizard from '../components/AddAgentWizard'
import { fetchModelsWithByok, refreshModelsWithByok, hasAnyLLMKeys } from '../lib/byok'
import { useAuth } from '../contexts/AuthContext'
import DeleteAgentPanel from '../components/DeleteAgentPanel'
import ArchiveAgentPanel from '../components/ArchiveAgentPanel'
import UnarchiveAgentPanel from '../components/UnarchiveAgentPanel'
import LinkWhatsAppPanel from '../components/LinkWhatsAppPanel'
import SyncGroupsPanel from '../components/SyncGroupsPanel'
import ChatPanel from '../components/ChatPanel'
import AgentChatPanel from '../components/AgentChatPanel'
import GroupChatPanel from '../components/GroupChatPanel'
import AgentStatusPanel from '../components/AgentStatusPanel'
import CommunitiesManager from '../components/CommunitiesManager'
import BulkOperationsPanel from '../components/BulkOperationsPanel'
import SaveAsTemplatePanel from '../components/SaveAsTemplatePanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useToast } from '../components/Toast'

type MenuPlacement = 'top' | 'bottom'

function getSmartMenuPlacement(triggerRect: DOMRect, estimatedMenuHeight: number = 320): MenuPlacement {
  const spaceBelow = window.innerHeight - triggerRect.bottom
  const spaceAbove = triggerRect.top
  if (spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove) {
    return 'bottom'
  }
  return 'top'
}

function secAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

interface GroupEntry {
  name: string
  description: string | null
}

interface Workflow {
  id: string
  name: string
  description: string
  enabled: boolean
  schedule: string
}

interface Agent {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  whatsapp: string | null
  isProfile: boolean
  workspacePath: string
  communities: GroupEntry[]
  groups: GroupEntry[]
  tags: string[]
  skills?: string[]
  validationWarnings?: string[]
  archived?: boolean
  archiveMetadata?: { reason?: string; timestamp?: string }
  paused?: boolean
}

interface ImportableOpenClawAgent {
  id: string
  hasMetadata: boolean
  files: string[]
}

const STATUS_COLORS = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

const STATUS_TEXT = {
  online: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30',
  offline: 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30',
  unknown: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
}

const PAUSED_BADGE = 'ml-2 px-2 py-0.5 text-[11px] font-semibold rounded-full text-gray-200 bg-gray-800/80 dark:bg-gray-600/80 dark:text-gray-100'

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type ViewMode = 'grid' | 'list' | 'table'
type ArchiveTab = 'active' | 'archived'

export default function Agents({ onNavigateToDoc, onNavigateToGroup, onNavigateToSkills, onNavigateToWorkflows, onNavigateToTemplates, initialAgentId, isActive }: { onNavigateToDoc?: (file: string) => void; onNavigateToGroup?: (groupName: string) => void; onNavigateToSkills?: (agentId: string) => void; onNavigateToWorkflows?: (workflowId: string) => void; onNavigateToTemplates?: () => void; initialAgentId?: string; isActive?: boolean } = {}) {
  const { showSuccess, showError, showInfo } = useToast()
  const { config } = useAuth()
  const aiEnabled = hasAnyLLMKeys(config)
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [doctorRunning, setDoctorRunning] = useState(false)
  const [doctorResults, setDoctorResults] = useState<any>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [budgetEditorAgentId, setBudgetEditorAgentId] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState<number>(0)
  const PAGE_SIZE = 20
  const DISPLAY_PAGE_SIZE = 10
  const [currentPage, setCurrentPage] = useState(1)
  const [agentMetering, setAgentMetering] = useState<Record<string, { calls: number; tokens: number; cost: number }>>({})
  const [agentCostLimits, setAgentCostLimits] = useState<Record<string, number>>({})
  const [meteringLoaded, setMeteringLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('agents-view-mode')
    return (saved === 'list' || saved === 'grid' || saved === 'table') ? saved : 'grid'
  })
  const [sortColumn, setSortColumn] = useState<string>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('active')
  // collapsed set: agent IDs that are collapsed (default: all expanded)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [showAddWizard, setShowAddWizard] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAgentActionsMenu, setShowAgentActionsMenu] = useState(false)
  const [aiGenerateMode, setAiGenerateMode] = useState(false)
  const [cloneFromAgent, setCloneFromAgent] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Agent | null>(null)
  const [unarchiveTarget, setUnarchiveTarget] = useState<Agent | null>(null)
  const [linkWaTarget, setLinkWaTarget] = useState<Agent | null>(null)
  const [syncGroupsTarget, setSyncGroupsTarget] = useState<Agent | null>(null)
  const [chatTarget, setChatTarget] = useState<Agent | null>(null)
  const [bulkChatChannel, setBulkChatChannel] = useState<{ name: string; description: string | null; tags: string[]; type: 'group'; community: string | null; channels: string[]; members: { id: string; name: string; status: 'online' | 'offline' | 'unknown' }[] } | null>(null)
  const [statusTarget, setStatusTarget] = useState<Agent | null>(null)
  const [communitiesTarget, setCommunitiesTarget] = useState<Agent | null>(null)
  const [saveAsTemplateTarget, setSaveAsTemplateTarget] = useState<Agent | null>(null)
  const [editTarget, setEditTarget] = useState<Agent | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [tagToRemove, setTagToRemove] = useState<{ agentId: string; tag: string; isPrimary: boolean } | null>(null)
  const [tagManageTarget, setTagManageTarget] = useState<Agent | null>(null)
  const [showSecondaryTags, setShowSecondaryTags] = useState(false)
  const [expandedSecondaryAgents, setExpandedSecondaryAgents] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set())
  const [showBulkOperations, setShowBulkOperations] = useState(false)
  const [showRestartMenu, setShowRestartMenu] = useState(false)
  const [systemStatus, setSystemStatus] = useState<{ total: number; online: number; offline: number; unknown: number; runningGateways: number; gatewayAvailable: boolean } | null>(null)
  const [allCommunities, setAllCommunities] = useState<GroupEntry[]>([])
  const [allGroups, setAllGroups] = useState<GroupEntry[]>([])
  const [agentWorkflows, setAgentWorkflows] = useState<Map<string, Workflow[]>>(new Map())
  const [renameTarget, setRenameTarget] = useState<Agent | null>(null)
  const [agentUsage, setAgentUsage] = useState<Record<string, { totalTokens: number; inputTokens: number; outputTokens: number; totalCost: number }>>({})
  const [usageDays, setUsageDays] = useState(30)

  const fetchAgents = useCallback((resetPagination = true, silent = false) => {
    const url = resetPagination
      ? `/api/agents?limit=${PAGE_SIZE}`
      : `/api/agents?limit=${PAGE_SIZE}${nextCursor ? `&cursor=${nextCursor}` : ''}`

    // Only show loading state for user-initiated actions, not background refreshes
    if (!silent) {
      if (resetPagination) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
    }

    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => {
        const normalized = (d.agents || []).map((a: any) => ({ ...a, tags: a.tags || [] }))
        if (resetPagination) {
          setAgents(normalized)
        } else {
          setAgents(prev => [...prev, ...normalized])
        }
        setHasMore(d.hasMore || false)
        setNextCursor(d.nextCursor || null)
        setTotal(d.total || 0)
        setLoading(false)
        setLoadingMore(false)
        setLastRefreshed(Date.now())
      })
      .catch((err) => {
        // Don't show error on initial load of empty workspace
        console.warn('Failed to load agents:', err)
        setLoading(false)
        setLoadingMore(false)
      })
  }, [nextCursor, PAGE_SIZE])

  // Fetch metering data
  useEffect(() => {
    fetch('/api/metering').then(r => r.json()).then(d => {
      const map: Record<string, { calls: number; tokens: number; cost: number }> = {}
      for (const a of d.byAgent || []) {
        map[a.agentId] = { calls: a.totalCalls, tokens: a.totalTokens, cost: a.estimatedCostUsd }
      }
      setAgentMetering(map)
      setMeteringLoaded(true)
    }).catch(() => { setMeteringLoaded(true) })
  }, [])

  useEffect(() => {
    fetch('/api/agents/cost-limits')
      .then(r => r.ok ? r.json() : null)
      .then(d => setAgentCostLimits(d?.limits && typeof d.limits === 'object' ? d.limits : {}))
      .catch(() => setAgentCostLimits({}))
  }, [])

  useEffect(() => {
    fetchAgents()
    // Auto-refresh every 30 seconds (silent background refresh)
    const interval = setInterval(() => {
      // Only poll if tab is visible to reduce server load
      if (!document.hidden) {
        fetchAgents(true, true) // resetPagination=true, silent=true
      }
    }, 30000) // 30 seconds

    // Listen for agent updates from other components (e.g., Communication page)
    const handleAgentsUpdated = () => {
      fetchAgents(true, true) // silent refresh
    }
    window.addEventListener('agents-updated', handleAgentsUpdated)

    return () => {
      clearInterval(interval)
      window.removeEventListener('agents-updated', handleAgentsUpdated)
    }
  }, [fetchAgents])

  // Refetch when page becomes active (e.g., navigating back from Skills page)
  useEffect(() => {
    if (isActive) {
      fetchAgents(true, true) // silent refresh when page becomes active
    }
  }, [isActive, fetchAgents])

  // Fetch agent usage data
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const response = await fetch(`/api/agents/usage?days=${usageDays}`)
        const data = await response.json()
        if (data.agentUsage) {
          setAgentUsage(data.agentUsage)
        }
      } catch (err) {
        console.error('Failed to fetch agent usage:', err)
      }
    }
    fetchUsage()
    // Refresh usage every 5 minutes
    const interval = setInterval(fetchUsage, 300000)
    return () => clearInterval(interval)
  }, [usageDays])

  useEffect(() => {
    const ticker = setInterval(() => setRefreshedLabel(secAgo(lastRefreshed)), 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  // Save view mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('agents-view-mode', viewMode)
  }, [viewMode])

  // Select initial agent if provided and scroll to it
  useEffect(() => {
    if (initialAgentId && agents.length > 0) {
      const agent = agents.find(a => a.id === initialAgentId)
      if (agent) {
        setSelectedAgent(agent)
        // Scroll to agent card after a brief delay to ensure DOM is updated
        setTimeout(() => {
          const element = document.getElementById(`agent-card-${initialAgentId}`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
    }
  }, [initialAgentId, agents])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchAgents()
    setTimeout(() => setCooling(false), 3000)
  }

  const fetchSystemStatus = useCallback(() => {
    fetch('/api/agents/status')
      .then(r => r.json())
      .then(d => setSystemStatus(d))
      .catch(() => {})
  }, [])

  // Fetch system status when menu opens
  useEffect(() => {
    if (showRestartMenu) {
      fetchSystemStatus()
    }
  }, [showRestartMenu, fetchSystemStatus])

  const handleRestart = async (agentId: string) => {
    try {
      const agent = agents.find(a => a.id === agentId)
      const res = await fetch(`/api/agents/${agentId}/restart`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        showSuccess(`Restarting ${agent?.name || agentId}...`)
        setTimeout(() => fetchAgents(), 1000)
      } else {
        showError(`Failed to restart ${agent?.name || agentId}: ${data.error}`)
      }
    } catch (err) {
      showError('Failed to restart agent')
      console.error(err)
    }
  }

  const handleRestartAll = async () => {
    setShowRestartMenu(false)
    try {
      const results = await Promise.allSettled(
        agents.map(agent =>
          fetch(`/api/agents/${agent.id}/restart`, { method: 'POST' }).then(r => r.json())
        )
      )

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.ok).length
      const failCount = results.length - successCount

      if (successCount > 0) {
        showSuccess(`Restarting ${successCount} agent${successCount !== 1 ? 's' : ''}...`)
      }
      if (failCount > 0) {
        showError(`Failed to restart ${failCount} agent${failCount !== 1 ? 's' : ''}`)
      }

      setTimeout(() => fetchAgents(), 1000)
    } catch (err) {
      showError('Failed to restart agents')
      console.error(err)
    }
  }

  const handleRestartOffline = async () => {
    setShowRestartMenu(false)
    try {
      const offlineAgents = agents.filter(a => a.status === 'offline')

      if (offlineAgents.length === 0) {
        showInfo('No offline agents to restart')
        return
      }

      const results = await Promise.allSettled(
        offlineAgents.map(agent =>
          fetch(`/api/agents/${agent.id}/restart`, { method: 'POST' }).then(r => r.json())
        )
      )

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.ok).length
      const failCount = results.length - successCount

      if (successCount > 0) {
        showSuccess(`Restarting ${successCount} offline agent${successCount !== 1 ? 's' : ''}...`)
      }
      if (failCount > 0) {
        showError(`Failed to restart ${failCount} agent${failCount !== 1 ? 's' : ''}`)
      }

      setTimeout(() => fetchAgents(), 1000)
    } catch (err) {
      showError('Failed to restart offline agents')
      console.error(err)
    }
  }

  const handleExportAgent = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    console.log('[Export] Starting export for agent:', agentId)
    try {
      console.log('[Export] Fetching:', `/api/agents/${agentId}/export`)
      const response = await fetch(`/api/agents/${agentId}/export`)
      console.log('[Export] Response status:', response.status, response.statusText)
      console.log('[Export] Response headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Export] Error response:', errorText)
        throw new Error(`Export failed: ${response.status} ${errorText}`)
      }

      console.log('[Export] Converting to blob...')
      const blob = await response.blob()
      console.log('[Export] Blob size:', blob.size, 'type:', blob.type)

      const url = window.URL.createObjectURL(blob)
      console.log('[Export] Created blob URL:', url)

      const link = document.createElement('a')
      link.href = url
      link.download = `${agentId}.zip`
      document.body.appendChild(link)
      console.log('[Export] Clicking download link...')
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      console.log('[Export] Download triggered successfully')
      showSuccess(`Exported ${agent?.name || agentId}`)
    } catch (err) {
      showError(`Failed to export ${agent?.name || agentId}`)
      console.error('[Export] Error:', err)
    }
  }

  // Fetch communities and groups for bulk operations
  useEffect(() => {
    Promise.all([
      fetch('/api/communities').then(r => r.json()),
      fetch('/api/groups').then(r => r.json()),
    ])
      .then(([commData, groupData]) => {
        setAllCommunities(commData.communities || [])
        setAllGroups(groupData.groups || [])
      })
      .catch(err => console.error('Failed to load communities/groups:', err))
  }, [])

  const handleBulkAddToCommunities = async (agentIds: string[], communities: string[]) => {
    try {
      let successCount = 0
      let failCount = 0

      for (const agentId of agentIds) {
        const agent = agents.find(a => a.id === agentId)
        if (!agent) continue

        const existingCommunities = (agent.communities || []).map(c => c.name)
        const allCommunities = Array.from(new Set([...existingCommunities, ...communities]))

        const resp = await fetch(`/api/agents/${agentId}/communities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communities: allCommunities, groups: agent.groups.map(g => g.name) }),
        })

        if (resp.ok) {
          successCount++
        } else {
          failCount++
        }
      }

      if (successCount > 0) {
        showSuccess(`Added to communities for ${successCount} agent${successCount !== 1 ? 's' : ''}`)
      }
      if (failCount > 0) {
        showError(`Failed to add ${failCount} agent${failCount !== 1 ? 's' : ''}`)
      }

      fetchAgents()

      // Exit selection mode after operation
      setSelectionMode(false)
      setSelectedAgentIds(new Set())
    } catch (err) {
      showError('Failed to add agents to communities')
      console.error(err)
    }
  }

  const handleBulkAddToGroups = async (agentIds: string[], groups: string[]) => {
    try {
      let successCount = 0
      let failCount = 0

      for (const agentId of agentIds) {
        const agent = agents.find(a => a.id === agentId)
        if (!agent) continue

        const existingGroups = agent.groups.map(g => g.name)
        const allGroups = Array.from(new Set([...existingGroups, ...groups]))

        const resp = await fetch(`/api/agents/${agentId}/communities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communities: (agent.communities || []).map(c => c.name), groups: allGroups }),
        })

        if (resp.ok) {
          successCount++
        } else {
          failCount++
        }
      }

      if (successCount > 0) {
        showSuccess(`Added to groups for ${successCount} agent${successCount !== 1 ? 's' : ''}`)
      }
      if (failCount > 0) {
        showError(`Failed to add ${failCount} agent${failCount !== 1 ? 's' : ''}`)
      }

      fetchAgents()

      // Exit selection mode after operation
      setSelectionMode(false)
      setSelectedAgentIds(new Set())
    } catch (err) {
      showError('Failed to add agents to groups')
      console.error(err)
    }
  }

  const handleBulkArchive = async (agentIds: string[]) => {
    try {
      let successCount = 0
      let failCount = 0

      for (const agentId of agentIds) {
        const resp = await fetch(`/api/agents/${agentId}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Bulk archive operation' }),
        })

        if (resp.ok) {
          successCount++
        } else {
          failCount++
        }
      }

      if (successCount > 0) {
        showSuccess(`Archived ${successCount} agent${successCount !== 1 ? 's' : ''}`)
      }
      if (failCount > 0) {
        showError(`Failed to archive ${failCount} agent${failCount !== 1 ? 's' : ''}`)
      }

      setSelectedAgentIds(new Set())
      setSelectionMode(false)
      fetchAgents()
    } catch (err) {
      showError('Failed to archive agents')
      console.error(err)
    }
  }

  const handleBulkUnarchive = async (agentIds: string[]) => {
    try {
      let successCount = 0
      let failCount = 0

      for (const agentId of agentIds) {
        const resp = await fetch(`/api/agents/${agentId}/unarchive`, { method: 'POST' })

        if (resp.ok) {
          successCount++
        } else {
          failCount++
        }
      }

      if (successCount > 0) {
        showSuccess(`Unarchived ${successCount} agent${successCount !== 1 ? 's' : ''}`)
      }
      if (failCount > 0) {
        showError(`Failed to unarchive ${failCount} agent${failCount !== 1 ? 's' : ''}`)
      }

      setSelectedAgentIds(new Set())
      setSelectionMode(false)
      fetchAgents()
    } catch (err) {
      showError('Failed to unarchive agents')
      console.error(err)
    }
  }

  const handleBulkChat = (agentIds: string[]) => {
    // Get the selected agents
    const selectedAgents = agents.filter(a => agentIds.includes(a.id))

    // Create a temporary channel for bulk chat
    // Use a unique name that won't conflict with real groups
    const timestamp = Date.now()
    setBulkChatChannel({
      name: `bulk-chat-${timestamp}`,
      description: `Temporary chat with ${selectedAgents.map(a => a.name).join(', ')}`,
      tags: ['bulk-chat'],
      type: 'group',
      community: null,
      channels: [],
      members: selectedAgents.map(a => ({
        id: a.id,
        name: a.name,
        status: a.status
      }))
    })

    // Exit selection mode after opening chat
    setSelectionMode(false)
    setSelectedAgentIds(new Set())
  }

  const handleBulkDelete = async (agentsList: Array<{ id: string; archived?: boolean }>) => {
    try {
      const resp = await fetch('/api/agents/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: agentsList, removeStateDir: false })
      })

      const result = await resp.json()

      if (result.ok) {
        showSuccess(`Successfully deleted ${result.summary.success} agent${result.summary.success !== 1 ? 's' : ''}`)
        fetchAgents()
        setSelectedAgentIds(new Set())
        setSelectionMode(false)
      } else {
        const failedCount = result.summary.failure
        showError(`Failed to delete ${failedCount} agent${failedCount !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      console.error('Bulk delete failed:', err)
      showError('Bulk delete operation failed')
    }
  }

  const handleBulkPause = async (agentIds: string[]) => {
    try {
      const resp = await fetch('/api/agents/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data?.error || 'Failed to pause agents')
      }
      showSuccess(`Paused ${agentIds.length} agent${agentIds.length !== 1 ? 's' : ''}`)
      fetchAgents()
      setSelectionMode(false)
      setSelectedAgentIds(new Set())
    } catch (err) {
      console.error('Bulk pause failed:', err)
      showError(err instanceof Error ? err.message : 'Failed to pause agents')
    }
  }

  const handleBulkResume = async (agentIds: string[]) => {
    try {
      const resp = await fetch('/api/agents/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data?.error || 'Failed to resume agents')
      }
      showSuccess(`Resumed ${agentIds.length} agent${agentIds.length !== 1 ? 's' : ''}`)
      fetchAgents()
      setSelectionMode(false)
      setSelectedAgentIds(new Set())
    } catch (err) {
      console.error('Bulk resume failed:', err)
      showError(err instanceof Error ? err.message : 'Failed to resume agents')
    }
  }

  const toggleAgentSelection = (agentId: string) => {
    const next = new Set(selectedAgentIds)
    if (next.has(agentId)) next.delete(agentId)
    else next.add(agentId)
    setSelectedAgentIds(next)
  }

  const toggleAgentSectionSelection = (agentsList: Agent[]) => {
    const ids = agentsList.map(agent => agent.id)
    const allSelected = ids.every(id => selectedAgentIds.has(id))

    setSelectedAgentIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  const fetchWorkflows = useCallback(async (agentId: string) => {
    // Skip if already fetched
    if (agentWorkflows.has(agentId)) return

    try {
      const res = await fetch(`/api/agents/${agentId}/workflows`)
      if (!res.ok) {
        console.error('Failed to fetch workflows:', res.statusText)
        return
      }
      const data = await res.json()
      setAgentWorkflows(prev => new Map(prev).set(agentId, data.workflows || []))
    } catch (err) {
      console.error('Error fetching workflows:', err)
    }
  }, [agentWorkflows])

  const toggleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        // Expanding the card - fetch workflows
        next.delete(id)
        fetchWorkflows(id)
      } else {
        // Collapsing the card
        next.add(id)
      }
      return next
    })
  }

  // Fetch workflows for all expanded agents on initial load
  useEffect(() => {
    if (agents.length > 0) {
      agents.forEach(agent => {
        // Only fetch for agents that are not collapsed (expanded by default)
        if (!collapsedIds.has(agent.id)) {
          fetchWorkflows(agent.id)
        }
      })
    }
  }, [agents, collapsedIds, fetchWorkflows])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    const primaryTags = new Set<string>() // Tags that are first for at least one agent

    agents.forEach(a => {
      const agentTags = a.tags || []
      agentTags.forEach(t => tags.add(t))
      if (agentTags.length > 0) {
        primaryTags.add(agentTags[0]) // First tag is primary
      }
    })

    // Sort: primary tags first (alphabetically), then secondary tags (alphabetically)
    return Array.from(tags).sort((a, b) => {
      const aIsPrimary = primaryTags.has(a)
      const bIsPrimary = primaryTags.has(b)

      if (aIsPrimary && !bIsPrimary) return -1
      if (!aIsPrimary && bIsPrimary) return 1
      return a.localeCompare(b)
    })
  }, [agents])

  const { primaryTags, secondaryTags } = useMemo(() => {
    const primary = new Set<string>()
    agents.forEach(a => {
      if (a.tags.length > 0) {
        primary.add(a.tags[0])
      }
    })

    const pTags = allTags.filter(t => primary.has(t))
    const sTags = allTags.filter(t => !primary.has(t))

    return { primaryTags: pTags, secondaryTags: sTags }
  }, [allTags, agents])

  const filteredAgents = useMemo(() => {
    let filtered = agents

    // Filter by archive status
    filtered = filtered.filter(agent => {
      const isArchived = agent.archived || false
      return archiveTab === 'archived' ? isArchived : !isArchived
    })

    // Filter by search query (supports wildcards with *)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      // Convert wildcard pattern to regex
      // If query has *, use anchors for exact matching (e.g., "engin*" -> /^engin.*$/i)
      // Otherwise, use partial matching (e.g., "max" -> /max/i)
      const hasWildcard = query.includes('*')
      const regexPattern = query.replace(/\*/g, '.*')
      const regex = hasWildcard
        ? new RegExp(`^${regexPattern}$`, 'i')
        : new RegExp(regexPattern, 'i')

      filtered = filtered.filter(agent => {
        // Match against name, ID, or tags
        return (
          regex.test(agent.name.toLowerCase()) ||
          regex.test(agent.id.toLowerCase()) ||
          agent.tags.some(tag => regex.test(tag.toLowerCase()))
        )
      })
    }

    // Filter by selected tags (but exclude 'archived' tag from user filter)
    if (selectedTags.size > 0) {
      filtered = filtered.filter(a => a.tags.filter(t => t !== 'archived').some(t => selectedTags.has(t)))
    }

    return filtered
  }, [agents, selectedTags, searchQuery, archiveTab])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedTags, archiveTab, viewMode])

  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / DISPLAY_PAGE_SIZE))
  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * DISPLAY_PAGE_SIZE
    return filteredAgents.slice(start, start + DISPLAY_PAGE_SIZE)
  }, [filteredAgents, currentPage])

  const groupedAgents = useMemo(() => {
    const groups = new Map<string, Agent[]>()

    // Only group by PRIMARY tags (tags that appear as first tag for at least one agent)
    primaryTags.forEach(tag => {
      const agentsWithTag = filteredAgents.filter(a => a.tags.includes(tag))
      if (agentsWithTag.length > 0) {
        groups.set(tag, agentsWithTag)
      }
    })

    // Add untagged agents
    const untagged = filteredAgents.filter(a => a.tags.length === 0)
    if (untagged.length > 0) {
      groups.set('__untagged__', untagged)
    }

    return groups
  }, [filteredAgents, primaryTags])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const removeTag = async (agentId: string, tagToRemove: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    const newTags = agent.tags.filter(t => t !== tagToRemove)

    try {
      const res = await fetch(`/api/agents/${agentId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })

      if (res.ok) {
        // Refresh agents to get updated tags
        fetchAgents()
      }
    } catch (err) {
      console.error('Failed to remove tag:', err)
    }
  }

  const handleRemoveTag = (agentId: string, tag: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    const isPrimary = agent.tags[0] === tag

    if (isPrimary) {
      setTagToRemove({ agentId, tag, isPrimary })
    } else {
      removeTag(agentId, tag)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Agent Roster</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
            {selectedTags.size > 0 && <span className="text-gray-300">({agents.length} total)</span>}
            <span className="text-gray-300">·</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse inline-block" title="Auto-refresh every 30s" />
            refreshed {refreshedLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View toggle */}
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view (compact)"
              className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Large grid view"
              className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${viewMode === 'list' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table view"
              className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${viewMode === 'table' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              ≡
            </button>
          </div>
          <button
            onClick={handleRefresh}
            disabled={cooling}
            className={`text-sm font-medium transition-colors ${
              cooling ? 'text-gray-300 cursor-not-allowed' : 'text-sky-600 hover:text-sky-800'
            }`}
          >
            {cooling ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowRestartMenu(!showRestartMenu)}
              className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900 transition-colors flex items-center gap-1.5 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
              title="Restart agents"
            >
              ↻ Restart {showRestartMenu ? '▲' : '▼'}
            </button>
            {showRestartMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowRestartMenu(false)} />
                <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden dark:border-gray-700">
                  {/* System Status */}
                  {systemStatus && (
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 dark:text-gray-300">System Status</div>
                      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex justify-between">
                          <span>Total Agents:</span>
                          <span className="font-medium">{systemStatus.total}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Online:</span>
                          <span className="font-medium text-green-600">{systemStatus.online}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Offline:</span>
                          <span className="font-medium text-yellow-600">{systemStatus.offline}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Unknown:</span>
                          <span className="font-medium text-gray-400">{systemStatus.unknown}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                          <span>Running Gateways:</span>
                          <span className="font-medium text-sky-600">{systemStatus.runningGateways}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Restart Actions */}
                  {systemStatus && !systemStatus.gatewayAvailable && (
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
                      <div className="text-xs text-amber-800">
                        <span className="font-semibold">⚠️ Restart Unavailable</span>
                        <p className="mt-1">openclaw CLI not found in PATH, so gateway restart commands are unavailable</p>
                      </div>
                    </div>
                  )}
                  <div className="py-1">
                    <button
                      onClick={handleRestartAll}
                      disabled={!systemStatus?.gatewayAvailable}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                        systemStatus?.gatewayAvailable
                          ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900'
                          : 'text-gray-400 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                      }`}
                    >
                      <span className="text-amber-500">↻</span> Restart All Agents
                    </button>
                    <button
                      onClick={handleRestartOffline}
                      disabled={!systemStatus?.gatewayAvailable || !agents.some(a => a.status === 'offline')}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                        systemStatus?.gatewayAvailable && agents.some(a => a.status === 'offline')
                          ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900'
                          : 'text-gray-400 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                      }`}
                    >
                      <span className="text-yellow-500">↻</span> Restart Offline Agents
                      {systemStatus && systemStatus.offline > 0 && (
                        <span className="ml-auto text-xs text-gray-400">({systemStatus.offline})</span>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSelectionMode(!selectionMode)
                if (selectionMode) {
                  setSelectedAgentIds(new Set())
                }
              }}
              className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                selectionMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title={selectionMode ? 'Exit selection mode' : 'Select multiple agents'}
            >
              <span className="text-base leading-none">☑</span> {selectionMode ? 'Cancel' : 'Select'}
            </button>
            {selectionMode && (
              <button
                onClick={() => {
                  if (selectedAgentIds.size === filteredAgents.length) {
                    setSelectedAgentIds(new Set())
                  } else {
                    setSelectedAgentIds(new Set(filteredAgents.map(a => a.id)))
                  }
                }}
                className="text-sm font-medium px-3 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                {selectedAgentIds.size === filteredAgents.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowAgentActionsMenu(!showAgentActionsMenu)}
                className="text-sm font-medium px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors flex items-center gap-1.5"
                title="Agent actions"
              >
                <span className="text-base leading-none">🤖</span> Agent Actions <span className="text-xs">▾</span>
              </button>
              {showAgentActionsMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAgentActionsMenu(false)} />
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1">
                    <button
                      onClick={() => {
                        setShowAgentActionsMenu(false)
                        setCloneFromAgent(null)
                        setAiGenerateMode(true)
                        setShowAddWizard(true)
                      }}
                      disabled={!aiEnabled}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                        aiEnabled
                          ? 'text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30'
                          : 'text-gray-400 dark:text-gray-500 cursor-not-allowed bg-gray-50 dark:bg-gray-800'
                      }`}
                      title={aiEnabled ? 'Generate agent with AI' : 'Configure API keys (BYOK) to enable AI generation'}
                    >
                      <span className="text-purple-500">✨</span> AI Generate
                    </button>
                    <button
                      onClick={() => {
                        setShowAgentActionsMenu(false)
                        setAiGenerateMode(false)
                        setShowAddWizard(true)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors flex items-center gap-2"
                    >
                      <span className="text-sky-500">＋</span> Create
                    </button>
                    <button
                      onClick={() => {
                        setShowAgentActionsMenu(false)
                        setShowImportModal(true)
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-2"
                    >
                      <span className="text-emerald-500">⇪</span> Import
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Archive tabs */}
      <div className="mb-4">
        <div className="inline-flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden dark:border-gray-700">
          <button
            onClick={() => setArchiveTab('active')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              archiveTab === 'active'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900'
            }`}
          >
            Active ({agents.filter(a => !a.archived).length})
          </button>
          <button
            onClick={() => setArchiveTab('archived')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              archiveTab === 'archived'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900'
            }`}
          >
            Archived ({agents.filter(a => a.archived).length})
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents by name, ID, or tags (supports * wildcard)"
            className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-xs text-gray-500">
            Found {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Filter by tags:</span>
            <button
              onClick={() => setSelectedTags(new Set())}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedTags.size === 0
                  ? 'bg-sky-600 text-white border border-sky-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
              }`}
            >
              All
            </button>
            {primaryTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedTags.has(tag)
                    ? 'bg-sky-600 text-white border border-sky-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                {tag}
              </button>
            ))}
            {secondaryTags.length > 0 && (
              <button
                onClick={() => setShowSecondaryTags(!showSecondaryTags)}
                className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors bg-white dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:border-gray-600 hover:text-gray-600 dark:border-gray-700 dark:border-gray-600"
              >
                {showSecondaryTags ? '▼' : '▶'} Secondary tags ({secondaryTags.length})
              </button>
            )}
          </div>
          {showSecondaryTags && secondaryTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-2 pl-28">
              {secondaryTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    selectedTags.has(tag)
                      ? 'bg-sky-600 text-white border border-sky-600'
                      : 'bg-white dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {/* Loading skeletons */}
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm animate-pulse dark:border-gray-700">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-2 h-2 rounded-full bg-gray-200"></div>
                  <div className="h-5 bg-gray-200 rounded w-32"></div>
                  <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded w-16 dark:bg-gray-800"></div>
                </div>
                <div className="flex gap-1">
                  <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded dark:bg-gray-800"></div>
                  <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded dark:bg-gray-800"></div>
                  <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded dark:bg-gray-800"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm border border-red-200 dark:border-red-800">{error}</div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-5xl mb-4">🤖</span>
          <p className="text-base font-medium text-gray-500 dark:text-gray-400 mb-1">No agents in this workspace yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Get started by creating your first agent or deploying a team</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              ⇪ Import from OpenClaw
            </button>
            <button
              onClick={() => { setCloneFromAgent(null); setAiGenerateMode(true); setShowAddWizard(true) }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
            >
              ✨ Create Agent with AI
            </button>
            <button
              onClick={() => onNavigateToTemplates?.()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              📋 Deploy a Team from Templates
            </button>
          </div>
        </div>
      )}

      {!loading && !error && agents.length > 0 && filteredAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🔍</span>
          <p className="text-sm">No agents match the selected tags</p>
          <button
            onClick={() => setSelectedTags(new Set())}
            className="text-xs mt-2 text-sky-600 hover:text-sky-800 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {!loading && !error && filteredAgents.length > 0 && viewMode === 'list' && (
        <div className="space-y-8">
          {(() => {
            // Separate user agents from built-in agents
            const userAgents = paginatedAgents.filter(a => !a.tags.includes('built-in'))
            const builtInAgents = paginatedAgents.filter(a => a.tags.includes('built-in'))

            const renderAgentCards = (agents: Agent[], title?: string) => (
              <>
                {title && (
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 dark:text-gray-200">
                      {title.includes('Built-in') && <span>🤖</span>}
                      {title}
                    </h2>
                    {selectionMode && (
                      <button
                        onClick={() => toggleAgentSectionSelection(agents)}
                        className="text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {agents.every(agent => selectedAgentIds.has(agent.id)) ? 'Deselect Section' : 'Select Section'}
                      </button>
                    )}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                  {agents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      selected={selectedAgent?.id === agent.id}
                      collapsed={collapsedIds.has(agent.id)}
                      onToggle={() => toggleCollapse(agent.id)}
                      onClick={() => setSelectedAgent(agent)}
                      onDelete={() => setDeleteTarget(agent.id)}
                      onLinkWa={() => setLinkWaTarget(agent)}
                      onSyncGroups={() => setSyncGroupsTarget(agent)}
                      onChat={() => setChatTarget(agent)}
                      onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true) }}
                      onEdit={() => setEditTarget(agent)}
                      onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.archived ? 'archive/' : ''}${agent.id}/IDENTITY.md`) : undefined}
                      onRemoveTag={(tag) => handleRemoveTag(agent.id, tag)}
                      onManageTags={() => setTagManageTarget(agent)}
                      onManageCommunities={() => setCommunitiesTarget(agent)}
                      onNavigateToGroup={onNavigateToGroup}
                      onNavigateToSkills={onNavigateToSkills}
                      onNavigateToWorkflow={onNavigateToWorkflows}
                      onRestart={() => handleRestart(agent.id)}
                      onArchive={() => setArchiveTarget(agent)}
                      onUnarchive={() => setUnarchiveTarget(agent)}
                      onRename={() => setRenameTarget(agent)}
                      onSetBudget={() => { setSelectedAgent(agent); setBudgetEditorAgentId(agent.id) }}
                      onSaveAsTemplate={() => setSaveAsTemplateTarget(agent)}
                      onExport={() => handleExportAgent(agent.id)}
                      workflows={agentWorkflows.get(agent.id)}
                      isSelected={selectedAgentIds.has(agent.id)}
                      onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                      metering={agentMetering[agent.id]}
                      costLimit={agentCostLimits[agent.id] ?? null}
                      onUnlinkWa={() => {
                        fetch(`/api/agents/${agent.id}/whatsapp`, { method: 'DELETE' })
                          .then(() => fetchAgents())
                          .catch(() => {})
                      }}
                    />
                  ))}
                </div>
              </>
            )

            return (
              <>
                {/* User Agents Section */}
                {userAgents.length > 0 && (
                  <div>
                    {renderAgentCards(userAgents, builtInAgents.length > 0 ? 'Your Agents' : undefined)}
                  </div>
                )}

                {/* Built-in System Agents Section */}
                {builtInAgents.length > 0 && (
                  <div className={userAgents.length > 0 ? "mt-10 pt-8 border-t-2 border-gray-300 dark:border-gray-600" : ""}>
                    {renderAgentCards(builtInAgents, 'Built-in System Agents')}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {!loading && !error && filteredAgents.length > 0 && viewMode === 'grid' && selectedTags.size === 0 && (
        <div className="space-y-8">
          {(() => {
            // Separate user agents from built-in agents
            const userAgents = paginatedAgents.filter(a => !a.tags.includes('built-in'))
            const builtInAgents = paginatedAgents.filter(a => a.tags.includes('built-in'))

            // Group each separately
            const userGrouped = new Map<string, Agent[]>()
            const builtInGrouped = new Map<string, Agent[]>()

            userAgents.forEach(agent => {
              const tag = agent.tags.length > 0 ? agent.tags[0] : '__untagged__'
              if (!userGrouped.has(tag)) userGrouped.set(tag, [])
              userGrouped.get(tag)!.push(agent)
            })

            builtInAgents.forEach(agent => {
              const tag = agent.tags.length > 0 ? agent.tags[0] : '__untagged__'
              if (!builtInGrouped.has(tag)) builtInGrouped.set(tag, [])
              builtInGrouped.get(tag)!.push(agent)
            })

            const renderAgentSection = (groupedAgents: Map<string, Agent[]>, sectionTitle: string | null, shownAgentIds: Set<string>) => (
              <>
                {sectionTitle && groupedAgents.size > 0 && (
                  <div className="mb-4">
                    <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 dark:text-gray-200">
                      {sectionTitle === 'Built-in System Agents' && <span>🤖</span>}
                      {sectionTitle}
                      <span className="text-sm font-normal text-gray-400">
                        ({Array.from(groupedAgents.values()).reduce((sum, agents) => sum + agents.length, 0)})
                      </span>
                    </h2>
                  </div>
                )}
                {Array.from(groupedAgents.entries()).map(([tag, tagAgents]) => {
              // Split agents by primary (first tag matches) vs secondary
              const primaryAgents = tagAgents.filter(a => a.tags[0] === tag && !shownAgentIds.has(a.id))
              const secondaryAgentsNotShown = tagAgents.filter(a => a.tags[0] !== tag && !shownAgentIds.has(a.id))
              const alreadyShownPrimary = tagAgents.filter(a => a.tags[0] === tag && shownAgentIds.has(a.id))
              const alreadyShownSecondary = tagAgents.filter(a => a.tags[0] !== tag && shownAgentIds.has(a.id))

              // Mark primary agents as shown
              primaryAgents.forEach(a => shownAgentIds.add(a.id))

              const isExpanded = expandedSecondaryAgents.has(tag)

              // If expanded, mark secondary agents as shown too
              if (isExpanded) {
                secondaryAgentsNotShown.forEach(a => shownAgentIds.add(a.id))
              }

              return (
                <div key={tag}>
                  <div className="mb-3 px-1 flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {tag === '__untagged__' ? 'Untagged' : tag}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {primaryAgents.length} agent{primaryAgents.length !== 1 ? 's' : ''}
                      </span>
                    </h2>
                    {selectionMode && primaryAgents.length > 0 && (
                      <button
                        onClick={() => toggleAgentSectionSelection(primaryAgents)}
                        className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {primaryAgents.every(agent => selectedAgentIds.has(agent.id)) ? 'Deselect Group' : 'Select Group'}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {primaryAgents.map(agent => (
                      <AgentGridCard
                        key={`${tag}-${agent.id}`}
                        agent={agent}
                        selected={selectedAgent?.id === agent.id}
                        onClick={() => setSelectedAgent(agent)}
                        onChat={() => setChatTarget(agent)}
                        onStatus={() => setStatusTarget(agent)}
                        onDelete={() => setDeleteTarget(agent.id)}
                        onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true); }}
                        onEdit={() => setEditTarget(agent)}
                        onSaveAsTemplate={() => setSaveAsTemplateTarget(agent)}
                        onExport={() => handleExportAgent(agent.id)}
                        onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.archived ? 'archive/' : ''}${agent.id}/IDENTITY.md`) : undefined}
                        onManageTags={() => setTagManageTarget(agent)}
                        onRestart={() => handleRestart(agent.id)}
                        onArchive={() => setArchiveTarget(agent)}
                        onUnarchive={() => setUnarchiveTarget(agent)}
                        onRename={() => setRenameTarget(agent)}
                        onSetBudget={() => { setSelectedAgent(agent); setBudgetEditorAgentId(agent.id) }}
                        isSelected={selectedAgentIds.has(agent.id)}
                        onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                        usage={agentUsage[agent.id]}
                        metering={agentMetering[agent.id]}
                        costLimit={agentCostLimits[agent.id] ?? null}
                      />
                    ))}
                  </div>

                  {/* Secondary agents (collapsible) */}
                  {secondaryAgentsNotShown.length > 0 && (
                    <div className="mt-3 px-1">
                      <button
                        onClick={() => {
                          setExpandedSecondaryAgents(prev => {
                            const next = new Set(prev)
                            if (next.has(tag)) next.delete(tag)
                            else next.add(tag)
                            return next
                          })
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors"
                      >
                        {isExpanded ? '▼' : '▶'} Additional agents ({secondaryAgentsNotShown.length})
                      </button>
                      {isExpanded && (
                        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 mt-2">
                          {secondaryAgentsNotShown.map(agent => (
                            <AgentGridCard
                              key={`${tag}-secondary-${agent.id}`}
                              agent={agent}
                              selected={selectedAgent?.id === agent.id}
                              onClick={() => setSelectedAgent(agent)}
                              onChat={() => setChatTarget(agent)}
                              onStatus={() => setStatusTarget(agent)}
                              onDelete={() => setDeleteTarget(agent.id)}
                              onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true); }}
                              onEdit={() => setEditTarget(agent)}
                              onSaveAsTemplate={() => setSaveAsTemplateTarget(agent)}
                              onExport={() => handleExportAgent(agent.id)}
                              onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.archived ? 'archive/' : ''}${agent.id}/IDENTITY.md`) : undefined}
                              onManageTags={() => setTagManageTarget(agent)}
                              onRestart={() => handleRestart(agent.id)}
                              onArchive={() => setArchiveTarget(agent)}
                              onUnarchive={() => setUnarchiveTarget(agent)}
                              onRename={() => setRenameTarget(agent)}
                              onSetBudget={() => { setSelectedAgent(agent); setBudgetEditorAgentId(agent.id) }}
                              isSelected={selectedAgentIds.has(agent.id)}
                              onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                              usage={agentUsage[agent.id]}
                              metering={agentMetering[agent.id]}
                              costLimit={agentCostLimits[agent.id] ?? null}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Already shown agents */}
                  {(alreadyShownPrimary.length > 0 || alreadyShownSecondary.length > 0) && (
                    <div className="mt-3 px-1 text-xs text-gray-400">
                      Also in this group:{' '}
                      {[...alreadyShownPrimary, ...alreadyShownSecondary].map((agent, idx) => (
                        <span key={agent.id}>
                          {idx > 0 && ', '}
                          <button
                            onClick={() => setSelectedAgent(agent)}
                            className="text-sky-500 hover:text-sky-700 hover:underline"
                          >
                            {agent.name}
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
              </>
            )

            const shownAgentIds = new Set<string>()

            return (
              <>
                {/* User Agents Section */}
                {userGrouped.size > 0 && renderAgentSection(userGrouped, userGrouped.size > 0 && builtInGrouped.size > 0 ? 'Your Agents' : null, shownAgentIds)}

                {/* Built-in System Agents Section */}
                {builtInGrouped.size > 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                    {renderAgentSection(builtInGrouped, 'Built-in System Agents', shownAgentIds)}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {!loading && !error && filteredAgents.length > 0 && viewMode === 'grid' && selectedTags.size > 0 && (
        <div className="space-y-8">
          {(() => {
            const userAgents = paginatedAgents.filter(a => !a.tags.includes('built-in'))
            const builtInAgents = paginatedAgents.filter(a => a.tags.includes('built-in'))

            return (
              <>
                {/* User Agents */}
                {userAgents.length > 0 && (
                  <>
                    {userAgents.length > 0 && builtInAgents.length > 0 && (
                      <div className="mb-4 flex items-center gap-3">
                        <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">Your Agents ({userAgents.length})</h2>
                        {selectionMode && (
                          <button
                            onClick={() => toggleAgentSectionSelection(userAgents)}
                            className="text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            {userAgents.every(agent => selectedAgentIds.has(agent.id)) ? 'Deselect Section' : 'Select Section'}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {userAgents.map(agent => (
            <AgentGridCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent?.id === agent.id}
              onClick={() => setSelectedAgent(agent)}
              onChat={() => setChatTarget(agent)}
              onStatus={() => setStatusTarget(agent)}
              onDelete={() => setDeleteTarget(agent.id)}
              onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true); }}
              onEdit={() => setEditTarget(agent)}
              onSaveAsTemplate={() => setSaveAsTemplateTarget(agent)}
              onExport={() => handleExportAgent(agent.id)}
              onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.archived ? 'archive/' : ''}${agent.id}/IDENTITY.md`) : undefined}
              onManageTags={() => setTagManageTarget(agent)}
              onRestart={() => handleRestart(agent.id)}
              onArchive={() => setArchiveTarget(agent)}
              onUnarchive={() => setUnarchiveTarget(agent)}
              onRename={() => setRenameTarget(agent)}
              onSetBudget={() => { setSelectedAgent(agent); setBudgetEditorAgentId(agent.id) }}
              isSelected={selectedAgentIds.has(agent.id)}
              onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
              usage={agentUsage[agent.id]}
              metering={agentMetering[agent.id]}
              costLimit={agentCostLimits[agent.id] ?? null}
            />
                      ))}
                    </div>
                  </>
                )}

                {/* Built-in System Agents */}
                {builtInAgents.length > 0 && (
                  <div className={userAgents.length > 0 ? "mt-8 pt-8 border-t border-gray-200 dark:border-gray-700" : ""}>
                    <div className="mb-4 flex items-center gap-3">
                      <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 dark:text-gray-200">
                        <span>🤖</span> Built-in System Agents ({builtInAgents.length})
                      </h2>
                      {selectionMode && (
                        <button
                          onClick={() => toggleAgentSectionSelection(builtInAgents)}
                          className="text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          {builtInAgents.every(agent => selectedAgentIds.has(agent.id)) ? 'Deselect Section' : 'Select Section'}
                        </button>
                      )}
                    </div>
                    <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {builtInAgents.map(agent => (
                        <AgentGridCard
                          key={agent.id}
                          agent={agent}
                          selected={selectedAgent?.id === agent.id}
                          onClick={() => setSelectedAgent(agent)}
                          onChat={() => setChatTarget(agent)}
                          onStatus={() => setStatusTarget(agent)}
                          onDelete={() => setDeleteTarget(agent.id)}
                          onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true); }}
                          onEdit={() => setEditTarget(agent)}
                          onSaveAsTemplate={() => setSaveAsTemplateTarget(agent)}
                          onExport={() => handleExportAgent(agent.id)}
                          onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.archived ? 'archive/' : ''}${agent.id}/IDENTITY.md`) : undefined}
                          onManageTags={() => setTagManageTarget(agent)}
                          onRestart={() => handleRestart(agent.id)}
                          onArchive={() => setArchiveTarget(agent)}
                          onUnarchive={() => setUnarchiveTarget(agent)}
                          onRename={() => setRenameTarget(agent)}
                          onSetBudget={() => { setSelectedAgent(agent); setBudgetEditorAgentId(agent.id) }}
                          isSelected={selectedAgentIds.has(agent.id)}
                          onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                          usage={agentUsage[agent.id]}
                          metering={agentMetering[agent.id]}
                          costLimit={agentCostLimits[agent.id] ?? null}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* Table View */}
      {!loading && !error && filteredAgents.length > 0 && viewMode === 'table' && (
        <AgentTableView
          agents={paginatedAgents}
          selectedAgent={selectedAgent}
          selectedAgentIds={selectedAgentIds}
          selectionMode={selectionMode}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={(column) => {
            if (sortColumn === column) {
              setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
            } else {
              setSortColumn(column)
              setSortDirection('asc')
            }
          }}
          onSelectAgent={setSelectedAgent}
          onToggleSelect={toggleAgentSelection}
          onChat={setChatTarget}
          onStatus={setStatusTarget}
          onDelete={(id) => setDeleteTarget(id)}
          onEdit={setEditTarget}
          onArchive={setArchiveTarget}
          onUnarchive={setUnarchiveTarget}
          metering={agentMetering}
          meteringLoaded={meteringLoaded}
        />
      )}

      {/* Pagination */}
      {!loading && !error && filteredAgents.length > DISPLAY_PAGE_SIZE && (
        <div className="flex items-center justify-between py-4 px-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {(currentPage - 1) * DISPLAY_PAGE_SIZE + 1}–{Math.min(currentPage * DISPLAY_PAGE_SIZE, filteredAgents.length)} of {filteredAgents.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page: number
              if (totalPages <= 5) {
                page = i + 1
              } else if (currentPage <= 3) {
                page = i + 1
              } else if (currentPage >= totalPages - 2) {
                page = totalPages - 4 + i
              } else {
                page = currentPage - 2 + i
              }
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    page === currentPage
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {page}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Load More from server */}
      {!loading && !error && hasMore && (
        <div className="flex justify-center py-2">
          <button
            onClick={() => fetchAgents(false)}
            disabled={loadingMore}
            className="px-4 py-1.5 text-xs rounded-lg font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
          >
            {loadingMore ? 'Loading...' : `Load more from server (${agents.length} of ${total} loaded)`}
          </button>
        </div>
      )}

      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          initialEditCostLimit={budgetEditorAgentId === selectedAgent.id}
          onClose={() => { setSelectedAgent(null); setBudgetEditorAgentId(null) }}
          onChat={() => setChatTarget(selectedAgent)}
          onClone={() => {
            setCloneFromAgent(selectedAgent.id)
            setShowAddWizard(true)
            setSelectedAgent(null)
            setBudgetEditorAgentId(null)
          }}
          onNavigateToSkills={onNavigateToSkills}
        />
      )}

      {showAddWizard && (
        <AddAgentWizard
          onClose={() => { setShowAddWizard(false); setCloneFromAgent(null); setAiGenerateMode(false) }}
          onDone={() => fetchAgents()}
          defaultCloneFrom={cloneFromAgent || undefined}
          startWithAI={aiGenerateMode}
        />
      )}

      {showImportModal && (
        <ImportOpenClawAgentModal
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false)
            fetchAgents()
          }}
          showSuccess={showSuccess}
          showError={showError}
          showInfo={showInfo}
        />
      )}

      {deleteTarget && (
        <DeleteAgentPanel
          agentId={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { fetchAgents(); setSelectedAgent(null) }}
        />
      )}

      {archiveTarget && (
        <ArchiveAgentPanel
          agent={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onArchived={() => { fetchAgents(); setSelectedAgent(null) }}
        />
      )}

      {unarchiveTarget && (
        <UnarchiveAgentPanel
          agent={unarchiveTarget}
          onClose={() => setUnarchiveTarget(null)}
          onUnarchived={() => { fetchAgents(); setSelectedAgent(null) }}
        />
      )}

      {saveAsTemplateTarget && (
        <SaveAsTemplatePanel
          agent={saveAsTemplateTarget}
          onClose={() => setSaveAsTemplateTarget(null)}
          onSuccess={() => fetchAgents()}
        />
      )}

      {linkWaTarget && (
        <LinkWhatsAppPanel
          agentId={linkWaTarget.id}
          agentName={linkWaTarget.name}
          isProfile={linkWaTarget.isProfile}
          onClose={() => setLinkWaTarget(null)}
          onLinked={() => fetchAgents()}
        />
      )}

      {syncGroupsTarget && (
        <SyncGroupsPanel
          agentId={syncGroupsTarget.id}
          agentName={syncGroupsTarget.name}
          localGroups={syncGroupsTarget.groups}
          localCommunities={syncGroupsTarget.communities}
          onClose={() => setSyncGroupsTarget(null)}
          onSynced={() => fetchAgents()}
        />
      )}

      {communitiesTarget && (
        <CommunitiesManager
          agentId={communitiesTarget.id}
          agentName={communitiesTarget.name}
          currentCommunities={communitiesTarget.communities}
          currentGroups={communitiesTarget.groups}
          onClose={() => setCommunitiesTarget(null)}
          onSave={() => {
            fetchAgents()
            setCommunitiesTarget(null)
          }}
        />
      )}

      {/* Old ChatPanel - replaced with AgentChatPanel after WebSocket auth fix
      {chatTarget && (
        <ChatPanel
          agentId={chatTarget.id}
          agentName={chatTarget.name}
          onClose={() => setChatTarget(null)}
        />
      )}
      */}

      {chatTarget && (
        <ErrorBoundary
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2 dark:text-gray-200">Chat Error</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Failed to load chat panel</p>
                <button
                  onClick={() => setChatTarget(null)}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                >
                  Close
                </button>
              </div>
            </div>
          }
        >
          <AgentChatPanel
            agentId={chatTarget.id}
            agentName={chatTarget.name}
            agentStatus={chatTarget.status}
            onClose={() => setChatTarget(null)}
            onSuccess={() => {
              // Show toast if agent was offline when chat started
              if (chatTarget.status === 'offline') {
                showSuccess(`${chatTarget.name} is now active`)
              }
              // Wait for agent to finish writing files before refreshing status
              // This ensures file activity timestamp is updated
              setTimeout(() => fetchAgents(), 2000)
            }}
          />
        </ErrorBoundary>
      )}

      {statusTarget && (
        <AgentStatusPanel
          agentId={statusTarget.id}
          agentName={statusTarget.name}
          onClose={() => setStatusTarget(null)}
        />
      )}

      {tagToRemove && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setTagToRemove(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 dark:text-gray-100">Remove Primary Tag</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              You're removing the primary tag <span className="font-semibold text-sky-600">"{tagToRemove.tag}"</span>.
              {(() => {
                const agent = agents.find(a => a.id === tagToRemove.agentId)
                const remainingTags = agent?.tags.filter(t => t !== tagToRemove.tag) || []
                if (remainingTags.length > 0) {
                  return ` The new primary tag will be "${remainingTags[0]}".`
                } else {
                  return ' This agent will become untagged.'
                }
              })()}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setTagToRemove(null)}
                className="px-4 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-900 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  removeTag(tagToRemove.agentId, tagToRemove.tag)
                  setTagToRemove(null)
                }}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Remove Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {tagManageTarget && (
        <TagManageModal
          agent={tagManageTarget}
          onClose={() => setTagManageTarget(null)}
          onSave={async (tags) => {
            try {
              const res = await fetch(`/api/agents/${tagManageTarget.id}/tags`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags }),
              })
              if (res.ok) {
                fetchAgents()
                setTagManageTarget(null)
              }
            } catch (err) {
              console.error('Failed to update tags:', err)
            }
          }}
        />
      )}

      {renameTarget && (
        <RenameAgentModal
          agent={renameTarget}
          existingAgents={agents}
          onClose={() => setRenameTarget(null)}
          onSave={async (newId) => {
            try {
              const res = await fetch(`/api/agents/${renameTarget.id}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newId }),
              })
              const data = await res.json()
              if (res.ok) {
                showSuccess(`Renamed ${renameTarget.id} to ${newId}`)
                fetchAgents()
                setRenameTarget(null)
                setSelectedAgent(null)
              } else {
                showError(data.error || 'Failed to rename agent')
              }
            } catch (err) {
              showError('Failed to rename agent')
              console.error('Failed to rename agent:', err)
            }
          }}
        />
      )}

      {/* Floating toolbar for bulk operations */}
      {selectedAgentIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-4 z-40">
          <span className="font-medium">
            {selectedAgentIds.size} agent{selectedAgentIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelectedAgentIds(new Set())}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded transition-colors text-sm"
          >
            Clear
          </button>
          <button
            onClick={() => setShowBulkOperations(true)}
            className="px-4 py-1 bg-white dark:bg-gray-800 text-blue-600 hover:bg-blue-50 rounded font-medium transition-colors text-sm"
          >
            Bulk Operations
          </button>
        </div>
      )}

      {/* Bulk Operations Panel */}
      {showBulkOperations && (
          <BulkOperationsPanel
            selectedAgents={agents.filter(a => selectedAgentIds.has(a.id) && a.archived === (archiveTab === 'archived'))}
            allCommunities={allCommunities}
            allGroups={allGroups}
            onClose={() => setShowBulkOperations(false)}
            onAddToCommunities={handleBulkAddToCommunities}
            onAddToGroups={handleBulkAddToGroups}
            onArchive={handleBulkArchive}
            onUnarchive={handleBulkUnarchive}
            onPause={handleBulkPause}
            onResume={handleBulkResume}
            onDelete={handleBulkDelete}
            onChat={handleBulkChat}
            onChangeModel={async (agentIds, model) => {
              const resp = await fetch('/api/agents/bulk-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentIds, model }),
              })
              const data = await resp.json()
              if (resp.ok) {
                showSuccess(`Updated model to ${model} for ${data.updated} agent${data.updated !== 1 ? 's' : ''}`)
                fetchAgents()
                setSelectionMode(false)
                setSelectedAgentIds(new Set())
              } else {
                showError(data.error || 'Failed to change model')
              }
            }}
            onBulkSkills={async (agentIds, addSkills, removeSkills) => {
              const resp = await fetch('/api/skills/bulk-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentIds, addSkills, removeSkills }),
              })
              const data = await resp.json()
              if (resp.ok) {
                showSuccess(`Added ${addSkills.length} skill${addSkills.length !== 1 ? 's' : ''} to ${data.updated} agent${data.updated !== 1 ? 's' : ''}`)
                fetchAgents()
                setSelectionMode(false)
                setSelectedAgentIds(new Set())
              } else {
                showError(data.error || 'Failed to assign skills')
              }
            }}
          />
      )}

      {/* Bulk Chat Panel */}
      {bulkChatChannel && (
        <GroupChatPanel
          channel={bulkChatChannel}
          onClose={() => setBulkChatChannel(null)}
          mode="overlay"
        />
      )}

      {/* Edit Agent Config Modal */}
      {editTarget && (
        <EditAgentConfigModal
          agent={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { fetchAgents(); setEditTarget(null) }}
        />
      )}
    </div>
  )
}

function ImportOpenClawAgentModal({
  onClose,
  onImported,
  showSuccess,
  showError,
  showInfo,
}: {
  onClose: () => void
  onImported: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  showInfo: (message: string) => void
}) {
  const [agents, setAgents] = React.useState<ImportableOpenClawAgent[]>([])
  const [sourceMode, setSourceMode] = React.useState<'openclaw' | 'zip' | 'directory'>('openclaw')
  const [selectedId, setSelectedId] = React.useState('')
  const [targetId, setTargetId] = React.useState('')
  const [directoryPath, setDirectoryPath] = React.useState('')
  const [zipFile, setZipFile] = React.useState<File | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [importing, setImporting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch('/api/agents/openclaw/importable')
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text()
          throw new Error(text || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((data) => {
        const nextAgents = Array.isArray(data.agents) ? data.agents : []
        setAgents(nextAgents)
        if (nextAgents.length > 0) {
          setSelectedId(nextAgents[0].id)
        }
        setLoading(false)
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load importable OpenClaw agents')
        setLoading(false)
      })
  }, [])

  const selectedAgent = agents.find((agent) => agent.id === selectedId) || null

  const handleImport = async () => {
    setImporting(true)
    setError(null)
    try {
      let response: Response
      if (sourceMode === 'openclaw') {
        if (!selectedId) throw new Error('Select an OpenClaw agent to import')
        response = await fetch('/api/agents/openclaw/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: selectedId,
            targetId: targetId.trim() || undefined,
          }),
        })
      } else if (sourceMode === 'directory') {
        if (!directoryPath.trim()) throw new Error('Directory path is required')
        response = await fetch('/api/agents/import-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath: directoryPath.trim(),
            targetId: targetId.trim() || undefined,
          }),
        })
      } else {
        if (!zipFile) throw new Error('Select a ZIP file to import')
        response = await fetch(`/api/agents/import-zip${targetId.trim() ? `?targetId=${encodeURIComponent(targetId.trim())}` : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/zip' },
          body: await zipFile.arrayBuffer(),
        })
      }
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import agent')
      }

      showSuccess(`Imported ${data.importedId}`)
      const warnings = Array.isArray(data.warnings) ? data.warnings : []
      if (warnings.length > 0) {
        showInfo(`Imported with warnings: ${warnings.join(' | ')}`)
      }
      onImported()
    } catch (err: any) {
      setError(err.message || 'Failed to import agent')
      showError(err.message || 'Failed to import agent')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Import Agent</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Import from OpenClaw, a ZIP bundle, or a local directory.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            title="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-sm text-gray-500 dark:text-gray-400">Loading import sources...</div>
        ) : error ? (
          <div className="py-4 px-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm border border-red-200 dark:border-red-800">{error}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: 'openclaw', label: 'OpenClaw', icon: '🗂' },
                { id: 'zip', label: 'ZIP Upload', icon: '🧳' },
                { id: 'directory', label: 'Directory', icon: '📁' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSourceMode(option.id as 'openclaw' | 'zip' | 'directory')}
                  className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
                    sourceMode === option.id
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-1.5">{option.icon}</span>{option.label}
                </button>
              ))}
            </div>

            {sourceMode === 'openclaw' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Agent</label>
                {agents.length === 0 ? (
                  <div className="py-6 px-4 text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                    No importable OpenClaw agents were found. Try `ZIP Upload` or `Directory` instead.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                    {agents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setSelectedId(agent.id)}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          selectedId === agent.id
                            ? 'bg-sky-50 dark:bg-sky-900/20'
                            : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{agent.id}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{agent.files.join(', ')}</div>
                          </div>
                          {agent.hasMetadata && (
                            <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700">
                              Metadata
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sourceMode === 'zip' && (
              <div>
                <label htmlFor="agent-import-zip" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload Agent ZIP
                </label>
                <input
                  id="agent-import-zip"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-700 dark:text-gray-300"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  ZIP should contain an agent bundle with `IDENTITY.md`, typically at the root or one folder deep.
                </p>
                {zipFile && (
                  <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                    Selected: {zipFile.name}
                  </div>
                )}
              </div>
            )}

            {sourceMode === 'directory' && (
              <div>
                <label htmlFor="import-directory-path" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Directory Path
                </label>
                <input
                  id="import-directory-path"
                  type="text"
                  value={directoryPath}
                  onChange={(e) => setDirectoryPath(e.target.value)}
                  placeholder="/path/to/agent-bundle"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Point to a directory containing `IDENTITY.md`, `SOUL.md`, and `TOOLS.md`.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="import-target-id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Agent ID (optional)
              </label>
              <input
                id="import-target-id"
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={selectedId || 'agent-id'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Leave blank to import using the detected bundle or source ID.
              </p>
            </div>

            {(sourceMode !== 'openclaw' || selectedAgent?.hasMetadata) && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                Skills will be restored. Previous groups and communities are only reattached if those entries already exist in this workspace.
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:text-gray-100 transition-colors dark:text-gray-300 dark:hover:text-gray-100"
                disabled={importing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={(sourceMode === 'openclaw' && !selectedId) || (sourceMode === 'zip' && !zipFile) || (sourceMode === 'directory' && !directoryPath.trim()) || importing}
                className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing...' : 'Import Agent'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EditAgentConfigModal({ agent, onClose, onSaved }: { agent: Agent; onClose: () => void; onSaved: () => void }) {
  const [identity, setIdentity] = React.useState('')
  const [soul, setSoul] = React.useState('')
  const [tools, setTools] = React.useState('')
  const [model, setModel] = React.useState('')
  const [availableModels, setAvailableModels] = React.useState<string[]>([])
  const [modelsByProvider, setModelsByProvider] = React.useState<Record<string, { name: string; models: string[] }>>({})
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [warnings, setWarnings] = React.useState<string[]>([])
  const [validationErrors, setValidationErrors] = React.useState<string[]>([])
  const [validating, setValidating] = React.useState(false)
  const [validationRequestError, setValidationRequestError] = React.useState<string | null>(null)

  const syncIdentityModel = React.useCallback((content: string, nextModel: string) => {
    if (!nextModel.trim()) return content
    if (/^[-*]\s+\*\*Model:\*\*\s+.+$/m.test(content)) {
      return content.replace(/^[-*]\s+\*\*Model:\*\*\s+.+$/m, `- **Model:** ${nextModel}`)
    }
    if (/^[-*]\s+\*\*Tags:\*\*\s+.+$/m.test(content)) {
      return content.replace(/^[-*]\s+\*\*Tags:\*\*\s+.+$/m, `- **Model:** ${nextModel}\n$&`)
    }
    if (/^[-*]\s+\*\*Role:\*\*\s+.+$/m.test(content)) {
      return content.replace(/^[-*]\s+\*\*Role:\*\*\s+.+$/m, `$&\n- **Model:** ${nextModel}`)
    }
    return `${content.trimEnd()}\n\n- **Model:** ${nextModel}\n`
  }, [])

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    setWarnings([])
    setValidationErrors([])
    setValidationRequestError(null)
    Promise.all([
      fetch(`/api/agents/${agent.id}/config`).then(r => {
        if (!r.ok) throw new Error('Failed to load config')
        return r.json()
      }),
      fetch(`/api/agents/${agent.id}/identity`).then(r => {
        if (!r.ok) throw new Error('Failed to load identity metadata')
        return r.json()
      }),
      fetchModelsWithByok(),
    ])
      .then(([configData, identityData, modelsData]) => {
        setIdentity(configData.identity || '')
        setSoul(configData.soul || '')
        setTools(configData.tools || '')
        setModel(identityData?.liveConfig?.model || identityData?.metadata?.model || '')
        setAvailableModels(Array.isArray(modelsData.models) ? modelsData.models : [])
        setModelsByProvider(modelsData.modelsByProvider || {})
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load config')
        setLoading(false)
      })
  }, [agent.id])

  React.useEffect(() => {
    if (loading) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setValidating(true)
      try {
        const res = await fetch('/api/agents/validate-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identity, soul, tools, expectedId: agent.id }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const raw = await res.text()
          let message = 'Failed to validate config'
          try {
            const data = raw ? JSON.parse(raw) : {}
            message = data.error || data.details?.join('\n') || raw || message
          } catch {
            message = raw || message
          }
          throw new Error(message)
        }
        const data = await res.json()
        setValidationErrors(Array.isArray(data.errors) ? data.errors : [])
        setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
        setValidationRequestError(null)
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setValidationRequestError(err.message || 'Failed to validate config')
          setValidationErrors([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setValidating(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [identity, soul, tools, agent.id, loading])

  const handleSave = async () => {
    if (validationErrors.length > 0) {
      setError(validationErrors.join('\n'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const nextIdentity = model ? syncIdentityModel(identity, model) : identity
      if (model) {
        const modelRes = await fetch(`/api/agents/${agent.id}/model`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model }),
        })
        if (!modelRes.ok) {
          const data = await modelRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to save model')
        }
      }

      const res = await fetch(`/api/agents/${agent.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: nextIdentity, soul, tools }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.details && Array.isArray(data.details)) {
          throw new Error(data.details.join('\n'))
        }
        throw new Error(data.error || 'Failed to save config')
      }
      setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      setIdentity(nextIdentity)
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to save config')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Agent Config</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{agent.name} <span className="font-mono text-xs">({agent.id})</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none p-1">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-6 w-6 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="ml-2 text-gray-500 dark:text-gray-400">Loading config...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400 whitespace-pre-line">
              {error}
            </div>
          )}

          {!loading && validationRequestError && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-300 whitespace-pre-line">
              <div className="font-medium mb-1">Validation service warning</div>
              {validationRequestError}
            </div>
          )}

          {!loading && validationErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <div className="font-medium mb-1">Validation errors</div>
              <ul className="list-disc pl-5 space-y-1">
                {validationErrors.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {!loading && warnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <div className="font-medium mb-1">Warnings</div>
              <ul className="list-disc pl-5 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {!loading && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await refreshModelsWithByok()
                        setAvailableModels(Array.isArray(data.models) ? data.models : [])
                        setModelsByProvider(data.modelsByProvider || {})
                      } catch {}
                    }}
                    className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                    title="Refresh models from provider APIs"
                  >
                    Refresh models
                  </button>
                </div>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  {!model && <option value="">Select a model</option>}
                  {Object.keys(modelsByProvider).length > 0 ? (
                    Object.entries(modelsByProvider).map(([providerId, provider]) => (
                      <optgroup key={providerId} label={provider.name || providerId}>
                        {provider.models.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </optgroup>
                    ))
                  ) : (
                    availableModels.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))
                  )}
                </select>
                <p className="mt-1 text-xs text-gray-400">Live models from provider APIs (cached 1hr). Click "Refresh" to update.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IDENTITY.md</label>
                <textarea
                  value={identity}
                  onChange={e => setIdentity(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm font-mono px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-y"
                  placeholder="Agent identity markdown..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SOUL.md</label>
                <textarea
                  value={soul}
                  onChange={e => setSoul(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm font-mono px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-y"
                  placeholder="Agent soul markdown..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TOOLS.md</label>
                <textarea
                  value={tools}
                  onChange={e => setTools(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm font-mono px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-y"
                  placeholder="Agent tools markdown..."
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving || validating || validationErrors.length > 0}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              loading || saving || validating || validationErrors.length > 0
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
          >
            {saving ? 'Saving...' : validating ? 'Validating...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TagManageModal({ agent, onClose, onSave }: { agent: Agent; onClose: () => void; onSave: (tags: string[]) => void }) {
  const [tags, setTags] = React.useState<string[]>(agent.tags)
  const [newTag, setNewTag] = React.useState('')
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null)

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newTags = [...tags]
    const [removed] = newTags.splice(draggedIndex, 1)
    newTags.splice(index, 0, removed)
    setTags(newTags)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const addTag = () => {
    if (!newTag.trim()) return
    if (tags.includes(newTag.trim())) return
    setTags([...tags, newTag.trim()])
    setNewTag('')
  }

  const removeTagAtIndex = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 dark:text-gray-100">Manage Tags</h3>
        <p className="text-xs text-gray-500 mb-4">Drag to reorder • First tag is primary</p>

        <div className="space-y-2 mb-4">
          {tags.length > 0 ? (
            tags.map((tag, index) => (
              <div
                key={`${tag}-${index}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 p-2 rounded border ${
                  index === 0 ? 'border-sky-400 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                } cursor-move hover:shadow-sm transition-shadow`}
              >
                <span className="text-gray-400 text-xs">☰</span>
                <span className={`flex-1 text-sm ${index === 0 ? 'font-semibold text-sky-700 dark:text-sky-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {tag}
                  {index === 0 && <span className="ml-1.5 text-xs text-sky-500">(primary)</span>}
                </span>
                <button
                  onClick={() => removeTagAtIndex(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No tags yet</p>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
            placeholder="Add new tag..."
            className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-sky-400 dark:focus:border-sky-600"
          />
          <button
            onClick={addTag}
            className="px-4 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors"
          >
            Add
          </button>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-900 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(tags)}
            className="px-4 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function RenameAgentModal({ agent, existingAgents, onClose, onSave }: { agent: Agent; existingAgents: Agent[]; onClose: () => void; onSave: (newId: string) => void }) {
  const [newId, setNewId] = React.useState(agent.id)
  const [error, setError] = React.useState<string | null>(null)

  const validate = (id: string): string | null => {
    if (!id.trim()) return 'Agent ID is required'
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
      return 'Must start with lowercase letter and contain only lowercase letters, numbers, dashes, and underscores'
    }
    if (id === agent.id) return 'New ID must be different from current ID'
    if (existingAgents.some(a => a.id.toLowerCase() === id.trim().toLowerCase())) {
      return `An agent with ID "${id.trim()}" already exists`
    }
    return null
  }

  const handleSave = () => {
    const validationError = validate(newId)
    if (validationError) {
      setError(validationError)
      return
    }
    onSave(newId)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 dark:text-gray-100">Rename Agent</h3>
        <p className="text-xs text-gray-500 mb-4">
          Renaming will update the agent directory and all references in communities and groups
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 dark:text-gray-300">
            Current ID: <span className="font-mono text-gray-500">{agent.id}</span>
          </label>
          <input
            type="text"
            value={newId}
            onChange={e => {
              setNewId(e.target.value)
              setError(null)
            }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Enter new agent ID..."
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-900 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}

const AgentCard = React.memo(function AgentCard({
  agent, selected, collapsed, onToggle, onClick, onDelete, onLinkWa, onSyncGroups, onUnlinkWa, onChat, onClone, onEdit, onViewDocs, onRemoveTag, onManageTags, onManageCommunities, onNavigateToGroup, onNavigateToSkills, onNavigateToWorkflow, onRestart, onArchive, onUnarchive, onRename, onSetBudget, onSaveAsTemplate, onExport, workflows, isSelected, onToggleSelect, metering, costLimit,
}: {
  agent: Agent
  selected: boolean
  collapsed: boolean
  onToggle: () => void
  onClick: () => void
  onDelete: () => void
  onArchive: () => void
  onUnarchive: () => void
  onLinkWa: () => void
  onSyncGroups: () => void
  onUnlinkWa: () => void
  onChat: () => void
  onClone: () => void
  onEdit?: () => void
  onViewDocs?: () => void
  onRemoveTag: (tag: string) => void
  onManageTags: () => void
  onManageCommunities: () => void
  onNavigateToGroup?: (groupName: string) => void
  onNavigateToSkills?: (agentId: string) => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onRestart: () => void
  onRename: () => void
  onSetBudget: () => void
  onSaveAsTemplate: () => void
  onExport: () => void
  workflows?: Workflow[]
  isSelected?: boolean
  onToggleSelect?: () => void
  metering?: { calls: number; tokens: number; cost: number }
  costLimit?: number | null
}) {
  const [confirmUnlink, setConfirmUnlink] = React.useState(false)
  const [showActionsMenu, setShowActionsMenu] = React.useState(false)
  const [menuPlacement, setMenuPlacement] = React.useState<MenuPlacement>('top')
  const actionsButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const budgetUsedPct = costLimit && costLimit > 0 && metering ? (metering.cost / costLimit) * 100 : null
  const budgetBarColor = budgetUsedPct === null
    ? 'bg-gray-300 dark:bg-gray-700'
    : budgetUsedPct >= 95
      ? 'bg-red-500'
      : budgetUsedPct >= 80
        ? 'bg-yellow-500'
        : 'bg-green-500'

  React.useEffect(() => {
    if (!showActionsMenu || !actionsButtonRef.current) return

    const updatePlacement = () => {
      if (!actionsButtonRef.current) return
      setMenuPlacement(getSmartMenuPlacement(actionsButtonRef.current.getBoundingClientRect()))
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [showActionsMenu])

  return (
    <div
      id={`agent-card-${agent.id}`}
      className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm transition-all relative ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200 dark:border-gray-700 hover:shadow-md'
      }`}
    >
      {/* Selection control */}
      {onToggleSelect && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect() }}
          className={`absolute top-3 right-3 z-10 w-6 h-6 rounded border flex items-center justify-center text-xs font-bold transition-colors ${
            isSelected
              ? 'bg-sky-600 border-sky-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400'
          }`}
          title={isSelected ? 'Deselect agent' : 'Select agent'}
        >
          {isSelected ? '✓' : '□'}
        </button>
      )}
      {/* Card header — always visible */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 min-w-0 pr-8">
          <span className={`w-2 h-2 rounded-full shrink-0 ${agent.archived ? 'bg-orange-500' : agent.paused ? 'bg-gray-400 dark:bg-gray-50 dark:bg-gray-9000' : STATUS_COLORS[agent.status]}`} />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate dark:text-gray-100">{agent.name}</h3>
          {agent.archived ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700">
              📦 Archived
            </span>
          ) : agent.paused ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700">
              paused
            </span>
          ) : (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_TEXT[agent.status]}`}>
              {agent.status}
            </span>
          )}
          {metering && metering.calls > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700"
              title={`${metering.calls} call${metering.calls !== 1 ? 's' : ''} · ${((metering.tokens || 0)/1000).toFixed(1)}k tokens · $${(metering.cost || 0).toFixed(4)}`}
            >
              📊 ${(metering.cost || 0).toFixed(3)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0 relative z-20" onClick={e => e.stopPropagation()}>
          {/* Frequent actions (always visible) */}
          {onViewDocs && (
            <button
              onClick={e => { e.stopPropagation(); onViewDocs() }}
              className="text-gray-300 hover:text-purple-500 transition-colors text-xs p-1 rounded hover:bg-purple-50"
              title="View agent documents"
            >
              📄
            </button>
          )}
          {!agent.archived && (
            <button
              onClick={e => { e.stopPropagation(); onChat() }}
              className="text-gray-300 hover:text-sky-500 transition-colors text-xs p-1 rounded hover:bg-sky-50"
              title="Chat with agent"
            >
              💬
            </button>
          )}
          {/* Actions menu */}
          <div className="relative">
            <button
              ref={actionsButtonRef}
              onClick={e => { e.stopPropagation(); setShowActionsMenu(!showActionsMenu) }}
              className="text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-base p-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
              title="More actions"
            >
              ⋮
            </button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setShowActionsMenu(false) }} />
                <div className={`absolute right-0 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 dark:border-gray-700 max-h-[70vh] overflow-y-auto ${
                  menuPlacement === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'
                }`}>
                  <div className="px-3 py-2 space-y-3">
                    <div>
                      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Build</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {onEdit && (
                          <button
                            onClick={e => { e.stopPropagation(); onEdit(); setShowActionsMenu(false) }}
                            className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors dark:text-gray-300"
                          >
                            ✏️ Edit
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); onClone(); setShowActionsMenu(false) }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
                        >
                          📋 Clone
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onSaveAsTemplate(); setShowActionsMenu(false) }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors dark:text-gray-300"
                        >
                          💾 Template
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onExport(); setShowActionsMenu(false) }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors dark:text-gray-300"
                        >
                          📦 Export
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Maintain</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={e => { e.stopPropagation(); onRestart(); setShowActionsMenu(false) }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors dark:text-gray-300"
                        >
                          ↻ Restart
                        </button>
                        <button
                          onClick={async e => {
                            e.stopPropagation()
                            setShowActionsMenu(false)
                            try {
                              const resp = await fetch('/api/agents/doctor', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ fix: true }),
                              })
                              const data = await resp.json()
                              const agentResult = data.results?.find((r: any) => r.id === agent.id)
                              if (agentResult) {
                                const fails = agentResult.checks.filter((c: any) => c.status === 'fail')
                                const fixed = agentResult.checks.filter((c: any) => c.status === 'fixed')
                                const pass = agentResult.checks.filter((c: any) => c.status === 'pass')
                                const statusEl = document.getElementById(`doctor-status-${agent.id}`)
                                if (statusEl) {
                                  statusEl.textContent = fails.length ? `✗ ${fails.map((f: any) => f.message).join('; ')}` : `✓ ${pass.length} passed${fixed.length ? `, ${fixed.length} fixed` : ''}`
                                  statusEl.className = `text-xs mt-1 ${fails.length ? 'text-red-500' : 'text-green-500'}`
                                  setTimeout(() => { statusEl.textContent = ''; statusEl.className = '' }, 5000)
                                }
                              }
                            } catch {}
                          }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors dark:text-gray-300"
                        >
                          🩺 Doctor
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onRename(); setShowActionsMenu(false) }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors dark:text-gray-300"
                        >
                          ✎ Rename
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onSetBudget(); setShowActionsMenu(false) }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors dark:text-gray-300"
                        >
                          💲 Budget
                        </button>
                        {agent.archived ? (
                          <button
                            onClick={e => { e.stopPropagation(); onUnarchive(); setShowActionsMenu(false) }}
                            className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors dark:text-gray-300"
                          >
                            📤 Restore
                          </button>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); onArchive(); setShowActionsMenu(false) }}
                            className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors dark:text-gray-300"
                          >
                            📦 Archive
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-2 dark:border-gray-700">
                      <button
                        onClick={e => { e.stopPropagation(); onDelete(); setShowActionsMenu(false) }}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      >
                        🗑 Delete agent
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            className="text-gray-300 hover:text-gray-500 transition-colors text-xs p-1"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="px-5 pb-4">
          <div className="text-xs text-gray-400 font-mono mb-3">{agent.id}</div>
          <div id={`doctor-status-${agent.id}`} />

          <div className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-20 shrink-0">Heartbeat</span>
              <span className="font-mono text-xs">{timeAgo(agent.lastHeartbeat)}</span>
            </div>
            {agent.archived && agent.archiveMetadata && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-orange-700 font-medium text-xs">📦 Archived</span>
                  {agent.archiveMetadata.timestamp && (
                    <span className="text-orange-600 text-xs font-mono">
                      {timeAgo(agent.archiveMetadata.timestamp)}
                    </span>
                  )}
                </div>
                {agent.archiveMetadata.reason && (
                  <div className="text-orange-700 text-xs">
                    <span className="font-medium">Reason:</span> {agent.archiveMetadata.reason}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-gray-400 w-20 shrink-0 mt-0.5">WhatsApp</span>
              {agent.whatsapp ? (
                confirmUnlink ? (
                  <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                    <p className="text-xs text-amber-700 font-medium">This will permanently delete WA credentials from disk. The agent will immediately stop receiving and sending WhatsApp messages and must be re-linked to resume.</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { onUnlinkWa(); setConfirmUnlink(false) }}
                        className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 font-medium transition-colors"
                      >
                        Yes, unlink
                      </button>
                      <button
                        onClick={() => setConfirmUnlink(false)}
                        className="text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:bg-gray-900 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-gray-900 dark:text-gray-100">+{agent.whatsapp}</span>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmUnlink(true) }}
                      className="text-xs text-gray-300 dark:text-gray-600 dark:text-gray-400 hover:text-red-400 dark:hover:text-red-400 transition-colors"
                      title="Unlink WhatsApp"
                    >
                      ×
                    </button>
                  </div>
                )
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); onLinkWa() }}
                  className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors font-medium"
                >
                  Link WA
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Groups</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={e => { e.stopPropagation(); onManageCommunities(); }}
                  className="text-xs px-1.5 py-0.5 rounded text-purple-600 hover:text-purple-700 hover:bg-purple-50 transition-colors font-medium"
                  title="Manage communities & groups"
                >
                  🏘 Manage
                </button>
                {agent.whatsapp && (
                  <button
                    onClick={e => { e.stopPropagation(); onSyncGroups() }}
                    className="text-xs px-1.5 py-0.5 rounded text-sky-500 hover:text-sky-700 hover:bg-sky-50 transition-colors font-medium"
                    title="Sync groups from WhatsApp"
                  >
                    ↻ Sync
                  </button>
                )}
              </div>
            </div>
            {((agent.communities || []).length > 0 || (agent.groups || []).length > 0) ? (
              <div className="flex flex-wrap gap-1">
                {(agent.communities || []).map(c => (
                  <button
                    key={c.name}
                    title={c.description ?? undefined}
                    onClick={e => { e.stopPropagation(); if (onNavigateToGroup) onNavigateToGroup(c.name); }}
                    className="text-xs px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors cursor-pointer"
                  >
                    {c.name}
                  </button>
                ))}
                {agent.groups.map(g => (
                  <button
                    key={g.name}
                    title={g.description ?? undefined}
                    onClick={e => { e.stopPropagation(); if (onNavigateToGroup) onNavigateToGroup(g.name); }}
                    className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300">No groups configured</p>
            )}
          </div>

          {/* Skills & Tools */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Skills & Tools</span>
              {onNavigateToSkills && (
                <button
                  onClick={e => { e.stopPropagation(); onNavigateToSkills(agent.id); }}
                  className="text-blue-500 hover:text-blue-700 transition-colors text-sm leading-none"
                  title="Manage skills"
                >
                  →
                </button>
              )}
            </div>
            {agent.skills && agent.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {agent.skills.map(skill => (
                  <button
                    key={skill}
                    onClick={e => { e.stopPropagation(); if (onNavigateToSkills) onNavigateToSkills(agent.id); }}
                    className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 font-medium hover:bg-blue-100 transition-colors"
                  >
                    {skill}
                  </button>
                ))}
              </div>
            ) : (
              onNavigateToSkills ? (
                <button
                  onClick={e => { e.stopPropagation(); onNavigateToSkills(agent.id); }}
                  className="text-xs px-2 py-1 rounded bg-gray-50 dark:bg-gray-900 text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:bg-gray-800 hover:text-gray-700 dark:text-gray-300 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  + Add Skills
                </button>
              ) : (
                <p className="text-xs text-gray-300">No skills configured</p>
              )
            )}
          </div>

          {/* Workflows */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">
                Workflows {workflows && workflows.length > 0 && `(${workflows.length})`}
              </span>
            </div>
            {!workflows ? (
              <p className="text-xs text-gray-400">Loading...</p>
            ) : workflows.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {workflows.map(workflow => (
                  <button
                    key={workflow.id}
                    title={workflow.description}
                    onClick={e => { e.stopPropagation(); if (onNavigateToWorkflow) onNavigateToWorkflow(workflow.id); }}
                    className="text-xs px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 font-medium hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    {workflow.enabled ? '🔄' : '⏸️'} {workflow.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300">No workflows targeting this agent</p>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Tags</span>
              <button
                onClick={e => { e.stopPropagation(); onManageTags(); }}
                className="text-sky-500 hover:text-sky-700 transition-colors text-sm leading-none"
                title="Manage tags"
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.tags.length > 0 ? (
                agent.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700 font-medium inline-flex items-center gap-1">
                    {tag}
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveTag(tag); }}
                      className="text-sky-400 hover:text-sky-700 transition-colors leading-none"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-300">untagged</span>
              )}
            </div>
          </div>

          {agent.validationWarnings && agent.validationWarnings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <span className="text-amber-600 text-xs shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-amber-800 mb-0.5">Configuration warnings</div>
                  <ul className="text-xs text-amber-700 space-y-0.5">
                    {agent.validationWarnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            {costLimit && costLimit > 0 && (
              <div className="mb-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-gray-400">
                  <span>Budget</span>
                  <span>${(metering?.cost || 0).toFixed(3)} / ${costLimit.toFixed(2)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
                  <div
                    className={`h-1.5 rounded-full transition-all ${budgetBarColor}`}
                    style={{ width: `${Math.min(budgetUsedPct || 0, 100)}%` }}
                  />
                </div>
              </div>
            )}
            <span className="text-xs text-gray-300 font-mono truncate block">
              {agent.workspacePath.replace(/^\/Users\/[^/]+/, '~')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
})

const AgentGridCard = React.memo(function AgentGridCard({ agent, selected, onClick, onChat, onStatus, onDelete, onClone, onEdit, onSaveAsTemplate, onExport, onViewDocs, onManageTags, onRestart, onArchive, onUnarchive, onRename, onSetBudget, isSelected, onToggleSelect, usage, metering, costLimit }: { agent: Agent; selected: boolean; onClick: () => void; onChat: () => void; onStatus: () => void; onDelete: () => void; onClone: () => void; onEdit?: () => void; onSaveAsTemplate: () => void; onExport: () => void; onViewDocs?: () => void; onManageTags: () => void; onRestart: () => void; onArchive: () => void; onUnarchive: () => void; onRename: () => void; onSetBudget: () => void; isSelected?: boolean; onToggleSelect?: () => void; usage?: { totalTokens: number; inputTokens: number; outputTokens: number; totalCost: number }; metering?: { calls: number; tokens: number; cost: number }; costLimit?: number | null }) {
  const [showActionsMenu, setShowActionsMenu] = React.useState(false)
  const [menuPlacement, setMenuPlacement] = React.useState<MenuPlacement>('top')
  const actionsButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const totalGroups = (agent.communities || []).length + (agent.groups || []).length
  const budgetUsedPct = costLimit && costLimit > 0 && metering ? (metering.cost / costLimit) * 100 : null
  const budgetBarColor = budgetUsedPct === null
    ? 'bg-gray-300 dark:bg-gray-700'
    : budgetUsedPct >= 95
      ? 'bg-red-500'
      : budgetUsedPct >= 80
        ? 'bg-yellow-500'
        : 'bg-green-500'

  React.useEffect(() => {
    if (!showActionsMenu || !actionsButtonRef.current) return

    const updatePlacement = () => {
      if (!actionsButtonRef.current) return
      setMenuPlacement(getSmartMenuPlacement(actionsButtonRef.current.getBoundingClientRect()))
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [showActionsMenu])

  // Format token count for display
  const formatTokens = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count.toString()
  }
  return (
    <div
      id={`agent-card-${agent.id}`}
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer relative ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {onToggleSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
          className={`absolute top-3 right-3 z-10 w-6 h-6 rounded border flex items-center justify-center text-xs font-bold transition-colors ${
            isSelected
              ? 'bg-sky-600 border-sky-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400'
          }`}
          title={isSelected ? 'Deselect agent' : 'Select agent'}
        >
          {isSelected ? '✓' : '□'}
        </button>
      )}
      {/* Line 1: Name + chat icon */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full shrink-0 ${agent.archived ? 'bg-orange-500' : agent.paused ? 'bg-gray-400 dark:bg-gray-50 dark:bg-gray-9000' : STATUS_COLORS[agent.status]}`} />
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate flex-1 dark:text-gray-100">{agent.name}</span>
        {agent.tags.includes('built-in') && <span className="shrink-0" title="Built-in system agent">🤖</span>}
        {agent.archived && <span className="shrink-0">📦</span>}
        {!agent.archived && (
          <button
            onClick={(e) => { e.stopPropagation(); onChat(); }}
            className="text-sky-500 hover:text-sky-700 transition-colors text-sm leading-none shrink-0"
            title="Chat"
          >
            💬
          </button>
        )}
      </div>
      {/* Line 2: ID + cost + file */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-gray-400 truncate">{agent.id}</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {metering && metering.calls > 0 && (
            <span
              className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
              title={`${metering.calls} call${metering.calls !== 1 ? 's' : ''} · ${((metering.tokens || 0)/1000).toFixed(1)}k tokens · $${(metering.cost || 0).toFixed(4)}`}
            >
              💲{(metering.cost || 0).toFixed(3)}
            </span>
          )}
          {onViewDocs && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewDocs(); }}
              className="text-gray-300 hover:text-purple-500 transition-colors text-xs leading-none"
              title="View docs"
            >
              📄
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-gray-400">{timeAgo(agent.lastHeartbeat)}</div>
        {agent.whatsapp && (
          <div className="flex items-center gap-0.5" title={`WhatsApp: +${agent.whatsapp}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
            <span className="text-xs text-green-600 dark:text-green-400">WA</span>
          </div>
        )}
      </div>
      {costLimit && costLimit > 0 && (
        <div className="mt-1.5">
          <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400">
            <span>Budget</span>
            <span>${(metering?.cost || 0).toFixed(3)} / ${costLimit.toFixed(2)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className={`h-1.5 rounded-full transition-all ${budgetBarColor}`}
              style={{ width: `${Math.min(budgetUsedPct || 0, 100)}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <div className="flex flex-wrap gap-0.5 flex-1 min-w-0" onClick={(e) => { e.stopPropagation(); onManageTags(); }}>
          {agent.tags.length > 0 ? (
            <>
              {agent.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700 cursor-pointer hover:bg-sky-100 transition-colors">
                  {tag}
                </span>
              ))}
              {agent.tags.length > 3 && (
                <span className="text-xs px-1.5 py-0.5 text-gray-300 cursor-pointer">+{agent.tags.length - 3}</span>
              )}
            </>
          ) : (
            <span className="text-xs px-1.5 py-0.5 text-gray-300 cursor-pointer hover:text-sky-500 transition-colors">+ add tags</span>
          )}
        </div>
        {totalGroups > 0 && (
          <div className="text-xs text-gray-400 shrink-0">{totalGroups} group{totalGroups !== 1 ? 's' : ''}</div>
        )}
        {usage && usage.totalTokens > 0 && (
          <div className="text-xs text-indigo-600 shrink-0 font-medium" title={`${(usage.totalTokens || 0).toLocaleString()} tokens (${(usage.inputTokens || 0).toLocaleString()} in / ${(usage.outputTokens || 0).toLocaleString()} out)${usage.totalCost > 0 ? ` • $${(usage.totalCost || 0).toFixed(4)}` : ''}`}>
            {formatTokens(usage.totalTokens)} 🪙
          </div>
        )}
        <div className="shrink-0">
          <button
            ref={actionsButtonRef}
            onClick={(e) => { e.stopPropagation(); setShowActionsMenu(!showActionsMenu); }}
            className="text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-base leading-none p-0.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            aria-label="More actions"
            title="More actions"
          >
            ⋮
          </button>
          {showActionsMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowActionsMenu(false); }} />
              <div className={`absolute right-0 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 dark:border-gray-700 max-h-[70vh] overflow-y-auto ${
                menuPlacement === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'
              }`}>
                <div className="px-3 py-2 space-y-3">
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Open</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); onClick(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
                      >
                        👁️ Details
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onChat(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors dark:text-gray-300"
                      >
                        💬 Chat
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onStatus(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors dark:text-gray-300"
                      >
                        📊 Status
                      </button>
                      {onViewDocs && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewDocs(); setShowActionsMenu(false); }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors dark:text-gray-300"
                        >
                          📄 Docs
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Build</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {onEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(); setShowActionsMenu(false); }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors dark:text-gray-300"
                        >
                          ✏️ Edit
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onClone(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
                      >
                        📋 Clone
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSaveAsTemplate(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors dark:text-gray-300"
                      >
                        💾 Template
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onExport(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors dark:text-gray-300"
                      >
                        📦 Export
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Maintain</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); onRestart(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors dark:text-gray-300"
                      >
                        ↻ Restart
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          setShowActionsMenu(false)
                          try {
                            const resp = await fetch('/api/agents/doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix: true }) })
                            const data = await resp.json()
                            const r = (data.results || []).find((r: any) => r.id === agent.id)
                            if (r) {
                              const fails = (r.checks || []).filter((c: any) => c.status === 'fail')
                              const fixed = (r.checks || []).filter((c: any) => c.status === 'fixed')
                              const pass = (r.checks || []).filter((c: any) => c.status === 'pass')
                              // Restart agent after doctor to revive it
                              if (fixed.length > 0 || fails.length === 0) {
                                try { await fetch(`/api/agents/${agent.id}/restart`, { method: 'POST' }) } catch {}
                              }
                              const el = document.getElementById(`doctor-msg-${agent.id}`)
                              if (el) {
                                const msg = fails.length ? `✗ ${fails.map((f: any) => f.message).join('; ')}` : `✓ ${pass.length} ok${fixed.length ? `, ${fixed.length} fixed, restarted` : ''}`
                                el.textContent = msg
                                el.className = `text-[10px] mt-1 px-2 py-1 rounded block ${fails.length ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`
                                setTimeout(() => { el.textContent = ''; el.className = '' }, 8000)
                              }
                            }
                          } catch {}
                        }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors dark:text-gray-300"
                      >
                        🩺 Doctor
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRename(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors dark:text-gray-300"
                      >
                        ✎ Rename
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetBudget(); setShowActionsMenu(false); }}
                        className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors dark:text-gray-300"
                      >
                        💲 Budget
                      </button>
                      {agent.archived ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onUnarchive(); setShowActionsMenu(false); }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors dark:text-gray-300"
                        >
                          📤 Restore
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); onArchive(); setShowActionsMenu(false); }}
                          className="rounded-md px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors dark:text-gray-300"
                        >
                          📦 Archive
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2 dark:border-gray-700">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(); setShowActionsMenu(false); }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      🗑 Delete agent
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div id={`doctor-msg-${agent.id}`} />
    </div>
  )
})
// Agent Table View Component
const AgentTableView = React.memo(function AgentTableView({
  agents,
  selectedAgent,
  selectedAgentIds,
  selectionMode,
  sortColumn,
  sortDirection,
  onSort,
  onSelectAgent,
  onToggleSelect,
  onChat,
  onStatus,
  onDelete,
  onEdit,
  onArchive,
  onUnarchive,
  metering,
  meteringLoaded = true,
}: {
  agents: Agent[]
  selectedAgent: Agent | null
  selectedAgentIds: Set<string>
  selectionMode: boolean
  sortColumn: string
  sortDirection: 'asc' | 'desc'
  onSort: (column: string) => void
  onSelectAgent: (agent: Agent) => void
  onToggleSelect: (id: string) => void
  onChat: (agent: Agent) => void
  onStatus: (agent: Agent) => void
  onDelete: (id: string) => void
  onEdit?: (agent: Agent) => void
  onArchive: (agent: Agent) => void
  onUnarchive: (agent: Agent) => void
  metering: Record<string, { calls: number; tokens: number; cost: number }>
  meteringLoaded?: boolean
}) {
  const [openDropdown, setOpenDropdown] = React.useState<string | null>(null)

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClick = () => setOpenDropdown(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Sort agents
  const sortedAgents = React.useMemo(() => {
    const sorted = [...agents]
    sorted.sort((a, b) => {
      let aVal: any, bVal: any

      switch (sortColumn) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'status':
          const statusOrder = { online: 0, offline: 1, unknown: 2 }
          aVal = statusOrder[a.status]
          bVal = statusOrder[b.status]
          break
        case 'heartbeat':
          aVal = a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0
          bVal = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0
          break
        case 'cost':
          aVal = metering[a.id]?.cost || 0
          bVal = metering[b.id]?.cost || 0
          break
        case 'groups':
          aVal = a.groups.length
          bVal = b.groups.length
          break
        case 'skills':
          aVal = a.skills?.length || 0
          bVal = b.skills?.length || 0
          break
        default:
          aVal = a.id
          bVal = b.id
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [agents, sortColumn, sortDirection])

  const SortHeader = ({ column, label }: { column: string; label: string }) => (
    <th
      onClick={() => onSort(column)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-gray-800 transition-colors select-none dark:bg-gray-800 dark:hover:bg-gray-700"
    >
      <div className="flex items-center gap-1">
        {label}
        {sortColumn === column && (
          <span className="text-sky-600 dark:text-sky-400">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  )

  return (
    <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 dark:bg-gray-900">
          <tr>
            {selectionMode && (
              <th className="px-4 py-3 w-14 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const allSelected = agents.length > 0 && agents.every(a => selectedAgentIds.has(a.id))
                    agents.forEach(agent => {
                      if (allSelected && selectedAgentIds.has(agent.id)) {
                        onToggleSelect(agent.id)
                      } else if (!allSelected && !selectedAgentIds.has(agent.id)) {
                        onToggleSelect(agent.id)
                      }
                    })
                  }}
                  className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
                    agents.length > 0 && agents.every(a => selectedAgentIds.has(a.id))
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                  } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
                  title="Toggle select all visible agents"
                >
                  {agents.length > 0 && agents.every(a => selectedAgentIds.has(a.id)) ? '✓' : '□'}
                </button>
              </th>
            )}
            <SortHeader column="name" label="Name" />
            <SortHeader column="status" label="Status" />
            <SortHeader column="heartbeat" label="Last Seen" />
            <SortHeader column="cost" label="Cost" />
            <SortHeader column="groups" label="Groups" />
            <SortHeader column="skills" label="Skills" />
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider dark:bg-gray-800">Tags</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider dark:bg-gray-800">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {sortedAgents.map(agent => (
            <tr
              key={agent.id}
              onClick={() => onSelectAgent(agent)}
              className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${
                selectedAgent?.id === agent.id ? 'bg-sky-50 dark:bg-sky-900/30' : ''
              }`}
            >
              {selectionMode && (
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelect(agent.id)
                    }}
                    className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
                      selectedAgentIds.has(agent.id)
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400'
                    } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
                    title={selectedAgentIds.has(agent.id) ? 'Deselect agent' : 'Select agent'}
                  >
                    {selectedAgentIds.has(agent.id) ? '✓' : '□'}
                  </button>
                </td>
              )}
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{agent.name}</span>
                  {agent.tags.includes('built-in') && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-700" title="Built-in system agent">
                      🤖
                    </span>
                  )}
                  <span className="text-xs text-gray-400 font-mono">{agent.id}</span>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {agent.paused && !agent.archived ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-50 dark:bg-gray-9000"></span>
                    paused
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full ${STATUS_TEXT[agent.status]}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[agent.status]}`}></span>
                    {agent.status}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {agent.lastHeartbeat ? timeAgo(agent.lastHeartbeat) : 'never'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                {!meteringLoaded ? (
                  <span className="inline-block w-14 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                ) : metering[agent.id] ? (
                  <span className="text-emerald-600 font-medium" title={`${metering[agent.id].calls} calls · ${((metering[agent.id].tokens || 0)/1000).toFixed(1)}k tokens`}>
                    ${(metering[agent.id].cost || 0).toFixed(4)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {agent.groups.slice(0, 3).map(g => (
                    <span key={g.name} className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded truncate max-w-[100px] dark:bg-gray-800 dark:text-gray-300" title={g.name}>
                      {g.name}
                    </span>
                  ))}
                  {agent.groups.length > 3 && (
                    <span className="text-xs text-gray-400">+{agent.groups.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {agent.skills?.slice(0, 3).map(s => (
                    <span key={s} className="inline-block px-1.5 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded">
                      {s}
                    </span>
                  ))}
                  {(agent.skills?.length || 0) > 3 && (
                    <span className="text-xs text-gray-400">+{(agent.skills?.length || 0) - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {agent.tags.filter(t => t !== 'archived').slice(0, 2).map(t => (
                    <span key={t} className="inline-block px-1.5 py-0.5 text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-700 rounded">
                      {t}
                    </span>
                  ))}
                  {agent.tags.filter(t => t !== 'archived').length > 2 && (
                    <span className="text-xs text-gray-400">+{agent.tags.filter(t => t !== 'archived').length - 2}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                <div className="relative flex items-center justify-end gap-1">
                  {/* Quick action icons */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onChat(agent)
                    }}
                    className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                    title="Chat"
                  >
                    💬
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectAgent(agent)
                    }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="View Details & Files"
                  >
                    📁
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenDropdown(openDropdown === agent.id ? null : agent.id)
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:bg-gray-800 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                    title="More actions"
                  >
                    ⋮
                  </button>

                  {openDropdown === agent.id && (
                    <div className="absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20 dark:border-gray-700">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenDropdown(null)
                          onSelectAgent(agent)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <span>👁️</span>
                        View Details
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenDropdown(null)
                          onChat(agent)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <span>💬</span>
                        Chat
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenDropdown(null)
                          onStatus(agent)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-green-50 transition-colors flex items-center gap-2 dark:text-gray-300"
                      >
                        <span className="text-green-500">📊</span>
                        Status & Logs
                      </button>
                      {onEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenDropdown(null)
                            onEdit(agent)
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                        >
                          <span className="text-emerald-500">✏️</span>
                          Edit Config
                        </button>
                      )}
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1 dark:border-gray-700"></div>
                      {agent.archived ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenDropdown(null)
                            onUnarchive(agent)
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          <span>📤</span>
                          Unarchive
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenDropdown(null)
                            onArchive(agent)
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          <span>📦</span>
                          Archive
                        </button>
                      )}
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1 dark:border-gray-700"></div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenDropdown(null)
                          onDelete(agent.id)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                      >
                        <span>🗑️</span>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
