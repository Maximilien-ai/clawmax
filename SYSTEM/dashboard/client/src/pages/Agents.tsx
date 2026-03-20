import React, { useEffect, useState, useCallback, useMemo } from 'react'
import AgentDetailPanel from '../components/AgentDetailPanel'
import AddAgentWizard from '../components/AddAgentWizard'
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

export default function Agents({ onNavigateToDoc, onNavigateToGroup, onNavigateToSkills, onNavigateToWorkflows, initialAgentId, isActive }: { onNavigateToDoc?: (file: string) => void; onNavigateToGroup?: (groupName: string) => void; onNavigateToSkills?: (agentId: string) => void; onNavigateToWorkflows?: (workflowId: string) => void; initialAgentId?: string; isActive?: boolean } = {}) {
  const { showSuccess, showError, showInfo } = useToast()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState<number>(0)
  const PAGE_SIZE = 20
  const [agentMetering, setAgentMetering] = useState<Record<string, { calls: number; tokens: number; cost: number }>>({})
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
      .then(r => r.json())
      .then(d => {
        if (resetPagination) {
          setAgents(d.agents || [])
        } else {
          setAgents(prev => [...prev, ...(d.agents || [])])
        }
        setHasMore(d.hasMore || false)
        setNextCursor(d.nextCursor || null)
        setTotal(d.total || 0)
        setLoading(false)
        setLoadingMore(false)
        setLastRefreshed(Date.now())
      })
      .catch(() => {
        setError('Failed to load agents')
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
    }).catch(() => {})
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
      showSuccess(`Exporting ${agent?.name || agentId}...`)
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

        const existingCommunities = agent.communities.map(c => c.name)
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
          body: JSON.stringify({ communities: agent.communities.map(c => c.name), groups: allGroups }),
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

  const toggleAgentSelection = (agentId: string) => {
    const next = new Set(selectedAgentIds)
    if (next.has(agentId)) next.delete(agentId)
    else next.add(agentId)
    setSelectedAgentIds(next)
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
      a.tags.forEach(t => tags.add(t))
      if (a.tags.length > 0) {
        primaryTags.add(a.tags[0]) // First tag is primary
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
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700 bg-white dark:bg-gray-800">
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
              className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
              title="Restart agents"
            >
              ↻ Restart {showRestartMenu ? '▲' : '▼'}
            </button>
            {showRestartMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowRestartMenu(false)} />
                <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden dark:border-gray-700">
                  {/* System Status */}
                  {systemStatus && (
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-xs font-semibold text-gray-700 mb-2 dark:text-gray-300">System Status</div>
                      <div className="space-y-1 text-xs text-gray-600">
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
                        <p className="mt-1">openclaw-gateway not found in PATH</p>
                      </div>
                    </div>
                  )}
                  <div className="py-1">
                    <button
                      onClick={handleRestartAll}
                      disabled={!systemStatus?.gatewayAvailable}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                        systemStatus?.gatewayAvailable
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-400 cursor-not-allowed bg-gray-50'
                      }`}
                    >
                      <span className="text-amber-500">↻</span> Restart All Agents
                    </button>
                    <button
                      onClick={handleRestartOffline}
                      disabled={!systemStatus?.gatewayAvailable || !agents.some(a => a.status === 'offline')}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                        systemStatus?.gatewayAvailable && agents.some(a => a.status === 'offline')
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-400 cursor-not-allowed bg-gray-50'
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
            <button
              onClick={() => setShowAddWizard(true)}
              className="text-sm font-medium px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors flex items-center gap-1.5"
              title="Add new agent"
            >
              <span className="text-base leading-none">+</span> Add Agent
            </button>
          </div>
        </div>
      </div>

      {/* Archive tabs */}
      <div className="mb-4">
        <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700">
          <button
            onClick={() => setArchiveTab('active')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              archiveTab === 'active'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Active ({agents.filter(a => !a.archived).length})
          </button>
          <button
            onClick={() => setArchiveTab('archived')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              archiveTab === 'archived'
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 hover:bg-gray-50'
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
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
                  : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
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
                    : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                {tag}
              </button>
            ))}
            {secondaryTags.length > 0 && (
              <button
                onClick={() => setShowSecondaryTags(!showSecondaryTags)}
                className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors bg-white dark:bg-gray-800 text-gray-400 border border-gray-200 hover:border-gray-300 hover:text-gray-600 dark:border-gray-700 dark:border-gray-600"
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
                      : 'bg-white dark:bg-gray-800 text-gray-400 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
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
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 shadow-sm animate-pulse dark:border-gray-700">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-2 h-2 rounded-full bg-gray-200"></div>
                  <div className="h-5 bg-gray-200 rounded w-32"></div>
                  <div className="h-5 bg-gray-100 rounded w-16 dark:bg-gray-800"></div>
                </div>
                <div className="flex gap-1">
                  <div className="w-6 h-6 bg-gray-100 rounded dark:bg-gray-800"></div>
                  <div className="w-6 h-6 bg-gray-100 rounded dark:bg-gray-800"></div>
                  <div className="w-6 h-6 bg-gray-100 rounded dark:bg-gray-800"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🤖</span>
          <p className="text-sm">No agents found in workspace</p>
          <p className="text-xs mt-1 text-gray-300">Run setup.sh to add the first agent</p>
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
            const userAgents = filteredAgents.filter(a => !a.tags.includes('built-in'))
            const builtInAgents = filteredAgents.filter(a => a.tags.includes('built-in'))

            const renderAgentCards = (agents: Agent[], title?: string) => (
              <>
                {title && (
                  <div className="mb-4">
                    <h2 className="text-base font-bold text-gray-800 flex items-center gap-2 dark:text-gray-200">
                      {title.includes('Built-in') && <span>🤖</span>}
                      {title}
                    </h2>
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
                      onSaveAsTemplate={() => setSaveAsTemplateTarget(agent)}
                      onExport={() => handleExportAgent(agent.id)}
                      workflows={agentWorkflows.get(agent.id)}
                      isSelected={selectedAgentIds.has(agent.id)}
                      onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                      metering={agentMetering[agent.id]}
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
            const userAgents = filteredAgents.filter(a => !a.tags.includes('built-in'))
            const builtInAgents = filteredAgents.filter(a => a.tags.includes('built-in'))

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
                    <h2 className="text-base font-bold text-gray-800 flex items-center gap-2 dark:text-gray-200">
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
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1 dark:text-gray-300">
                    {tag === '__untagged__' ? 'Untagged' : tag}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {primaryAgents.length} agent{primaryAgents.length !== 1 ? 's' : ''}
                    </span>
                  </h2>
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
                        isSelected={selectedAgentIds.has(agent.id)}
                        onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                        usage={agentUsage[agent.id]}
                        metering={agentMetering[agent.id]}
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
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
                              isSelected={selectedAgentIds.has(agent.id)}
                              onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                              usage={agentUsage[agent.id]}
                        metering={agentMetering[agent.id]}
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
            const userAgents = filteredAgents.filter(a => !a.tags.includes('built-in'))
            const builtInAgents = filteredAgents.filter(a => a.tags.includes('built-in'))

            return (
              <>
                {/* User Agents */}
                {userAgents.length > 0 && (
                  <>
                    {userAgents.length > 0 && builtInAgents.length > 0 && (
                      <div className="mb-4">
                        <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">Your Agents ({userAgents.length})</h2>
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
              isSelected={selectedAgentIds.has(agent.id)}
              onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
              usage={agentUsage[agent.id]}
                        metering={agentMetering[agent.id]}
            />
                      ))}
                    </div>
                  </>
                )}

                {/* Built-in System Agents */}
                {builtInAgents.length > 0 && (
                  <div className={userAgents.length > 0 ? "mt-8 pt-8 border-t border-gray-200 dark:border-gray-700" : ""}>
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-gray-800 flex items-center gap-2 dark:text-gray-200">
                        <span>🤖</span> Built-in System Agents ({builtInAgents.length})
                      </h2>
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
                          isSelected={selectedAgentIds.has(agent.id)}
                          onToggleSelect={selectionMode ? () => toggleAgentSelection(agent.id) : undefined}
                          usage={agentUsage[agent.id]}
                        metering={agentMetering[agent.id]}
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
          agents={filteredAgents}
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
        />
      )}

      {/* Load More button */}
      {!loading && !error && hasMore && (
        <div className="flex justify-center py-6">
          <button
            onClick={() => fetchAgents(false)}
            disabled={loadingMore}
            className={`px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              loadingMore
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
          >
            {loadingMore && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {loadingMore ? 'Loading...' : `Load More (${agents.length} of ${total})`}
          </button>
        </div>
      )}

      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onChat={() => setChatTarget(selectedAgent)}
          onClone={() => {
            setCloneFromAgent(selectedAgent.id)
            setShowAddWizard(true)
            setSelectedAgent(null)
          }}
          onNavigateToSkills={onNavigateToSkills}
        />
      )}

      {showAddWizard && (
        <AddAgentWizard
          onClose={() => { setShowAddWizard(false); setCloneFromAgent(null); }}
          onDone={() => fetchAgents()}
          defaultCloneFrom={cloneFromAgent || undefined}
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
                <h3 className="text-lg font-semibold text-gray-800 mb-2 dark:text-gray-200">Chat Error</h3>
                <p className="text-sm text-gray-600 mb-4">Failed to load chat panel</p>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">Remove Primary Tag</h3>
            <p className="text-sm text-gray-600 mb-4">
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
                className="px-4 py-2 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
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
          onDelete={handleBulkDelete}
          onChat={handleBulkChat}
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

function EditAgentConfigModal({ agent, onClose, onSaved }: { agent: Agent; onClose: () => void; onSaved: () => void }) {
  const [identity, setIdentity] = React.useState('')
  const [soul, setSoul] = React.useState('')
  const [tools, setTools] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/agents/${agent.id}/config`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load config')
        return r.json()
      })
      .then(data => {
        setIdentity(data.identity || '')
        setSoul(data.soul || '')
        setTools(data.tools || '')
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load config')
        setLoading(false)
      })
  }, [agent.id])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/agents/${agent.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, soul, tools }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Show detailed validation errors if available
        if (data.details && Array.isArray(data.details)) {
          throw new Error(data.details.join('\n'))
        }
        throw new Error(data.error || 'Failed to save config')
      }
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

          {!loading && (
            <>
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
            disabled={loading || saving}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              loading || saving
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
          >
            {saving ? 'Saving...' : 'Save'}
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">Manage Tags</h3>
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
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">Rename Agent</h3>
        <p className="text-xs text-gray-500 mb-4">
          Renaming will update the agent directory and all references in communities and groups
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
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
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
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
  agent, selected, collapsed, onToggle, onClick, onDelete, onLinkWa, onSyncGroups, onUnlinkWa, onChat, onClone, onEdit, onViewDocs, onRemoveTag, onManageTags, onManageCommunities, onNavigateToGroup, onNavigateToSkills, onNavigateToWorkflow, onRestart, onArchive, onUnarchive, onRename, onSaveAsTemplate, onExport, workflows, isSelected, onToggleSelect, metering,
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
  onNavigateToSkills?: () => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onRestart: () => void
  onRename: () => void
  onSaveAsTemplate: () => void
  onExport: () => void
  workflows?: Workflow[]
  isSelected?: boolean
  onToggleSelect?: () => void
  metering?: { calls: number; tokens: number; cost: number }
}) {
  const [confirmUnlink, setConfirmUnlink] = React.useState(false)
  const [showActionsMenu, setShowActionsMenu] = React.useState(false)
  return (
    <div
      id={`agent-card-${agent.id}`}
      className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm transition-all relative ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200 dark:border-gray-700 hover:shadow-md'
      }`}
    >
      {/* Selection checkbox overlay */}
      {onToggleSelect && (
        <div className="absolute top-2 left-2 z-10">
          <input
            type="checkbox"
            checked={isSelected || false}
            onChange={e => { e.stopPropagation(); onToggleSelect() }}
            onClick={e => e.stopPropagation()}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-gray-600"
          />
        </div>
      )}
      {/* Card header — always visible */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 min-w-0" style={onToggleSelect ? { paddingLeft: '1.5rem' } : {}}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${agent.archived ? 'bg-orange-500' : STATUS_COLORS[agent.status]}`} />
          <h3 className="font-semibold text-gray-900 truncate dark:text-gray-100">{agent.name}</h3>
          {agent.archived ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700">
              📦 Archived
            </span>
          ) : (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_TEXT[agent.status]}`}>
              {agent.status}
            </span>
          )}
          {metering && metering.calls > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700"
              title={`${metering.calls} call${metering.calls !== 1 ? 's' : ''} · ${(metering.tokens/1000).toFixed(1)}k tokens · $${metering.cost.toFixed(4)}`}
            >
              📊 ${metering.cost.toFixed(3)}
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
              onClick={e => { e.stopPropagation(); setShowActionsMenu(!showActionsMenu) }}
              className="text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-base p-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
              title="More actions"
            >
              ⋮
            </button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setShowActionsMenu(false) }} />
                <div className="absolute right-0 bottom-full mb-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg z-20 py-1 dark:border-gray-700 max-h-[70vh] overflow-y-auto">
                  {onEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); onEdit(); setShowActionsMenu(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                    >
                      <span className="text-emerald-500">✏️</span> Edit Config
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); onClone(); setShowActionsMenu(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <span>📋</span> Clone
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onSaveAsTemplate(); setShowActionsMenu(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                  >
                    <span className="text-sky-500">💾</span> Save as Template
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onExport(); setShowActionsMenu(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                  >
                    <span className="text-indigo-500">📦</span> Export as ZIP
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onRestart(); setShowActionsMenu(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                  >
                    <span className="text-amber-500">↻</span> Restart
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onRename(); setShowActionsMenu(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                  >
                    <span className="text-purple-500">✎</span> Rename
                  </button>
                  {agent.archived ? (
                    <button
                      onClick={e => { e.stopPropagation(); onUnarchive(); setShowActionsMenu(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                    >
                      <span className="text-green-500">📤</span> Unarchive
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); onArchive(); setShowActionsMenu(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                    >
                      <span className="text-orange-500">📦</span> Archive
                    </button>
                  )}
                  <div className="border-t border-gray-200 my-1 dark:border-gray-700"></div>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(); setShowActionsMenu(false) }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2"
                  >
                    <span>🗑</span> Delete
                  </button>
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

          <div className="space-y-1.5 text-sm text-gray-600">
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
                        className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
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
                      className="text-xs text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors"
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

          <div className="mt-3 pt-3 border-t border-gray-100">
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
            {(agent.communities.length > 0 || agent.groups.length > 0) ? (
              <div className="flex flex-wrap gap-1">
                {agent.communities.map(c => (
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
          <div className="mt-3 pt-3 border-t border-gray-100">
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
                  className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  + Add Skills
                </button>
              ) : (
                <p className="text-xs text-gray-300">No skills configured</p>
              )
            )}
          </div>

          {/* Workflows */}
          <div className="mt-3 pt-3 border-t border-gray-100">
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

          <div className="mt-3 pt-3 border-t border-gray-100">
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
            <div className="mt-3 pt-3 border-t border-gray-100">
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

          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-300 font-mono truncate block">
              {agent.workspacePath.replace(/^\/Users\/[^/]+/, '~')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
})

const AgentGridCard = React.memo(function AgentGridCard({ agent, selected, onClick, onChat, onStatus, onDelete, onClone, onEdit, onSaveAsTemplate, onExport, onViewDocs, onManageTags, onRestart, onArchive, onUnarchive, onRename, isSelected, onToggleSelect, usage, metering }: { agent: Agent; selected: boolean; onClick: () => void; onChat: () => void; onStatus: () => void; onDelete: () => void; onClone: () => void; onEdit?: () => void; onSaveAsTemplate: () => void; onExport: () => void; onViewDocs?: () => void; onManageTags: () => void; onRestart: () => void; onArchive: () => void; onUnarchive: () => void; onRename: () => void; isSelected?: boolean; onToggleSelect?: () => void; usage?: { totalTokens: number; inputTokens: number; outputTokens: number; totalCost: number }; metering?: { calls: number; tokens: number; cost: number } }) {
  const [showActionsMenu, setShowActionsMenu] = React.useState(false)
  const totalGroups = agent.communities.length + agent.groups.length

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
        <input
          type="checkbox"
          checked={isSelected || false}
          onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 left-2 w-4 h-4 cursor-pointer z-10"
        />
      )}
      {/* Line 1: Name + chat icon */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full shrink-0 ${agent.archived ? 'bg-orange-500' : STATUS_COLORS[agent.status]}`} />
        <span className="font-semibold text-gray-900 text-sm truncate flex-1 dark:text-gray-100">{agent.name}</span>
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
              title={`${metering.calls} call${metering.calls !== 1 ? 's' : ''} · ${(metering.tokens/1000).toFixed(1)}k tokens · $${metering.cost.toFixed(4)}`}
            >
              💲{metering.cost.toFixed(3)}
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
          <div className="text-xs text-indigo-600 shrink-0 font-medium" title={`${usage.totalTokens.toLocaleString()} tokens (${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out)${usage.totalCost > 0 ? ` • $${usage.totalCost.toFixed(4)}` : ''}`}>
            {formatTokens(usage.totalTokens)} 🪙
          </div>
        )}
        <div className="shrink-0">
          <button
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
              <div className="absolute right-0 bottom-full mb-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg z-20 py-1 dark:border-gray-700">
                <button
                  onClick={(e) => { e.stopPropagation(); onClick(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 dark:text-gray-300"
                >
                  <span>👁️</span> View Details
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onChat(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                >
                  <span className="text-sky-500">💬</span> Chat
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onStatus(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                >
                  <span className="text-green-500">📊</span> Status & Logs
                </button>
                <div className="border-t border-gray-200 my-1 dark:border-gray-700"></div>
                {onEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); setShowActionsMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                  >
                    <span className="text-emerald-500">✏️</span> Edit Config
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onClone(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <span>📋</span> Clone
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSaveAsTemplate(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                >
                  <span className="text-sky-500">💾</span> Save as Template
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onExport(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                >
                  <span className="text-indigo-500">📦</span> Export as ZIP
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRestart(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                >
                  <span className="text-amber-500">↻</span> Restart
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRename(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                >
                  <span className="text-purple-500">✎</span> Rename
                </button>
                {agent.archived ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUnarchive(); setShowActionsMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                  >
                    <span className="text-green-500">📤</span> Unarchive
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onArchive(); setShowActionsMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                  >
                    <span className="text-orange-500">📦</span> Archive
                  </button>
                )}
                <div className="border-t border-gray-200 my-1 dark:border-gray-700"></div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); setShowActionsMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2"
                >
                  <span>🗑</span> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
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
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none dark:bg-gray-800 dark:hover:bg-gray-700"
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
        <thead className="bg-gray-50 sticky top-0 z-10 dark:bg-gray-900">
          <tr>
            {selectionMode && (
              <th className="px-4 py-3 w-12">
                <input
                  type="checkbox"
                  checked={agents.length > 0 && agents.every(a => selectedAgentIds.has(a.id))}
                  onChange={(e) => {
                    agents.forEach(a => {
                      if (e.target.checked && !selectedAgentIds.has(a.id)) {
                        onToggleSelect(a.id)
                      } else if (!e.target.checked && selectedAgentIds.has(a.id)) {
                        onToggleSelect(a.id)
                      }
                    })
                  }}
                  className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 dark:border-gray-600"
                />
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
                  <input
                    type="checkbox"
                    checked={selectedAgentIds.has(agent.id)}
                    onChange={(e) => {
                      e.stopPropagation()
                      onToggleSelect(agent.id)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 dark:border-gray-600"
                  />
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
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full ${STATUS_TEXT[agent.status]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[agent.status]}`}></span>
                  {agent.status}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {agent.lastHeartbeat ? timeAgo(agent.lastHeartbeat) : 'never'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                {metering[agent.id] ? (
                  <span className="text-emerald-600 font-medium" title={`${metering[agent.id].calls} calls · ${(metering[agent.id].tokens/1000).toFixed(1)}k tokens`}>
                    ${metering[agent.id].cost.toFixed(4)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {agent.groups.slice(0, 3).map(g => (
                    <span key={g.name} className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded truncate max-w-[100px] dark:bg-gray-800 dark:text-gray-300" title={g.name}>
                      {g.name}
                    </span>
                  ))}
                  {agent.groups.length > 3 && (
                    <span className="text-xs text-gray-400">+{agent.groups.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
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
              <td className="px-4 py-3 text-sm text-gray-600">
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
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
                    title="More actions"
                  >
                    ⋮
                  </button>

                  {openDropdown === agent.id && (
                    <div className="absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 py-1 z-20 dark:border-gray-700">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenDropdown(null)
                          onSelectAgent(agent)
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
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
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
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
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-green-50 transition-colors flex items-center gap-2 dark:text-gray-300"
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
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-2 dark:text-gray-300"
                        >
                          <span className="text-emerald-500">✏️</span>
                          Edit Config
                        </button>
                      )}
                      <div className="border-t border-gray-200 my-1 dark:border-gray-700"></div>
                      {agent.archived ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenDropdown(null)
                            onUnarchive(agent)
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
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
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          <span>📦</span>
                          Archive
                        </button>
                      )}
                      <div className="border-t border-gray-200 my-1 dark:border-gray-700"></div>
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
