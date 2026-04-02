import React, { useState, useRef, useEffect } from 'react'
import { useWorkspace, type Workspace } from '../contexts/WorkspaceContext'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { WorkspaceEditDialog } from './WorkspaceEditDialog'
import { useToast } from './Toast'

interface WorkspaceDashboard {
  id: string
  workspaceId: string
  title: string
  description: string | null
  token: string
  displayMode: 'standard' | 'compact' | 'detail'
  sections: {
    overview: boolean
    costs: boolean
    agents: boolean
    notifications: boolean
    workflows: boolean
    kickoff: boolean
    results: boolean
    groupChats: boolean
  }
  sectionOrder: Array<'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats'>
  compactColumns: Record<'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats', 'left' | 'right'>
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

const DEFAULT_SECTION_ORDER: Array<'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats'> = [
  'overview',
  'costs',
  'agents',
  'notifications',
  'workflows',
  'kickoff',
  'results',
  'groupChats',
]
const DEFAULT_COMPACT_COLUMNS: Record<'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats', 'left' | 'right'> = {
  overview: 'left',
  costs: 'left',
  agents: 'right',
  notifications: 'right',
  workflows: 'left',
  kickoff: 'left',
  results: 'left',
  groupChats: 'right',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.floor(diff / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function WorkspaceSwitcher({ onCreateNew }: { onCreateNew: () => void }) {
  const { workspaces, activeWorkspace, switchWorkspace, deleteWorkspace, reorderWorkspaces } = useWorkspace()
  const { showSuccess, showError } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    id: string
    name: string
    consequences: string[]
  } | null>(null)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [dashboardWorkspace, setDashboardWorkspace] = useState<Workspace | null>(null)
  const [dashboards, setDashboards] = useState<WorkspaceDashboard[]>([])
  const [dashboardTitle, setDashboardTitle] = useState('')
  const [dashboardDescription, setDashboardDescription] = useState('')
  const [dashboardDisplayMode, setDashboardDisplayMode] = useState<'standard' | 'compact' | 'detail'>('standard')
  const [dashboardSections, setDashboardSections] = useState({
    overview: true,
    costs: true,
    agents: true,
    notifications: true,
    workflows: true,
    kickoff: true,
    results: true,
    groupChats: true,
  })
  const [dashboardSectionOrder, setDashboardSectionOrder] = useState([...DEFAULT_SECTION_ORDER])
  const [dashboardCompactColumns, setDashboardCompactColumns] = useState({ ...DEFAULT_COMPACT_COLUMNS })
  const [draggedSection, setDraggedSection] = useState<null | 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats'>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadDashboards = async (workspaceId: string) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/dashboards`)
      const data = await res.json()
      const nextDashboards = Array.isArray(data.dashboards) ? data.dashboards : []
      nextDashboards.sort((a: WorkspaceDashboard, b: WorkspaceDashboard) => b.updatedAt.localeCompare(a.updatedAt))
      setDashboards(nextDashboards)
  }

  const openDashboardManager = async (workspace: Workspace) => {
    setDashboardWorkspace(workspace)
    setDashboardTitle(`${workspace.name} Summary`)
    setDashboardDescription('')
    setDashboardDisplayMode('standard')
    setDashboardSections({
      overview: true,
      costs: true,
      agents: true,
      notifications: true,
      workflows: true,
      kickoff: true,
      results: true,
      groupChats: true,
    })
    setDashboardSectionOrder([...DEFAULT_SECTION_ORDER])
    setDashboardCompactColumns({ ...DEFAULT_COMPACT_COLUMNS })
    try {
      await loadDashboards(workspace.id)
    } catch (err) {
      showError('Failed to load workspace dashboards')
    }
    setIsOpen(false)
  }

  const getDashboardUrl = (token: string) => `${window.location.origin}/dashboards/${token}`

  const copyDashboardLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getDashboardUrl(token))
      showSuccess('Dashboard link copied')
    } catch {
      showError('Failed to copy dashboard link')
    }
  }

  const createDashboard = async () => {
    if (!dashboardWorkspace || !dashboardTitle.trim()) return
    try {
      const res = await fetch(`/api/workspaces/${dashboardWorkspace.id}/dashboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: dashboardTitle.trim(),
          description: dashboardDescription.trim() || null,
          displayMode: dashboardDisplayMode,
          sections: dashboardSections,
          sectionOrder: dashboardSectionOrder,
          compactColumns: dashboardCompactColumns,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create workspace dashboard')
      await loadDashboards(dashboardWorkspace.id)
      showSuccess('Workspace dashboard created')
    } catch (err: any) {
      showError(err.message || 'Failed to create workspace dashboard')
    }
  }

  const exportWorkspace = async (workspace: Workspace) => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/export`)
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Failed to export workspace')
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const disposition = response.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] || `${workspace.id}.zip`

      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
      showSuccess(`Workspace "${workspace.name}" exported`)
    } catch (err: any) {
      showError(err.message || 'Failed to export workspace')
    }
  }

  const deleteDashboard = async (workspaceId: string, dashboardId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/dashboards/${dashboardId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to delete workspace dashboard')
      await loadDashboards(workspaceId)
      showSuccess('Workspace dashboard deleted')
    } catch (err: any) {
      showError(err.message || 'Failed to delete workspace dashboard')
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    reorderWorkspaces(draggedIndex, index)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    setDashboardSectionOrder((prev) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const moveSectionToCompactColumn = (
    section: 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats',
    column: 'left' | 'right',
    beforeKey?: 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats'
  ) => {
    setDashboardSectionOrder((prev) => {
      const without = prev.filter((key) => key !== section)
      const nextColumns = { ...dashboardCompactColumns, [section]: column }
      let insertIndex = without.length

      if (beforeKey) {
        insertIndex = without.findIndex((key) => key === beforeKey)
        if (insertIndex === -1) insertIndex = without.length
      } else {
        const lastInColumn = [...without].reverse().find((key) => nextColumns[key] === column)
        if (lastInColumn) {
          insertIndex = without.findIndex((key) => key === lastInColumn) + 1
        }
      }

      const next = [...without]
      next.splice(insertIndex, 0, section)
      setDashboardCompactColumns(nextColumns)
      return next
    })
  }

  const handleCompactTileDrop = (
    e: React.DragEvent<HTMLDivElement>,
    key: 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats',
    column: 'left' | 'right',
    sections: Array<'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats'>
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedSection || draggedSection === key) return

    const rect = e.currentTarget.getBoundingClientRect()
    const dropBefore = e.clientY < rect.top + rect.height / 2
    const currentIndex = sections.indexOf(key)
    const nextKey = dropBefore ? key : sections[currentIndex + 1]

    moveSectionToCompactColumn(draggedSection, column, nextKey)
    setDraggedSection(null)
  }

  const moveSectionBefore = (
    section: 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats',
    beforeKey?: 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats'
  ) => {
    setDashboardSectionOrder((prev) => {
      const without = prev.filter((key) => key !== section)
      const insertIndex = beforeKey ? without.findIndex((key) => key === beforeKey) : without.length
      const next = [...without]
      next.splice(insertIndex === -1 ? without.length : insertIndex, 0, section)
      return next
    })
  }

  const compactColumnSections = (column: 'left' | 'right') =>
    dashboardSectionOrder.filter((key) => dashboardCompactColumns[key] === column)

  const handleDeleteClick = async (workspace: { id: string; name: string; path: string }) => {
    const consequences: string[] = []

    try {
      // Fetch workspace details to show what will be deleted
      const [agentsRes, communitiesRes, groupsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/communities'),
        fetch('/api/groups')
      ])

      if (agentsRes.ok) {
        const data = await agentsRes.json()
        const workspaceAgents = data.agents?.filter((a: any) =>
          a.workspace?.startsWith(workspace.path)
        ) || []
        if (workspaceAgents.length > 0) {
          consequences.push(`${workspaceAgents.length} agent${workspaceAgents.length !== 1 ? 's' : ''} will be permanently deleted`)
        }
      }

      if (communitiesRes.ok) {
        const data = await communitiesRes.json()
        const count = data.communities?.length || 0
        if (count > 0) {
          consequences.push(`${count} communit${count !== 1 ? 'ies' : 'y'} will be permanently deleted`)
        }
      }

      if (groupsRes.ok) {
        const data = await groupsRes.json()
        const count = data.groups?.length || 0
        if (count > 0) {
          consequences.push(`${count} group${count !== 1 ? 's' : ''} will be permanently deleted`)
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspace details:', err)
    }

    if (consequences.length === 0) {
      consequences.push('This workspace appears to be empty')
    }

    setDeleteDialog({ id: workspace.id, name: workspace.name, consequences })
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (!activeWorkspace) {
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current workspace button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium dark:bg-gray-800"
        title="Switch workspace"
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: activeWorkspace.color || '#3B82F6' }}
        />
        <span className="text-gray-800 dark:text-gray-200">{activeWorkspace.name}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 py-1 z-50 dark:border-gray-700">
          <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Drag to reorder
          </div>
          {/* Workspace list */}
          <div className="max-h-80 overflow-y-auto">
            {workspaces.map((workspace, index) => (
              <div
                key={workspace.id}
                className={`group relative ${
                  draggedIndex === index ? 'z-10' : ''
                }`}
              >
                <div
                  className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    workspace.id === activeWorkspace.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 cursor-move rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    title={`Reorder ${workspace.name}`}
                    aria-label={`Reorder ${workspace.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (workspace.id !== activeWorkspace.id) {
                        switchWorkspace(workspace.id)
                      }
                      setIsOpen(false)
                    }}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: workspace.color || '#3B82F6' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${
                          workspace.id === activeWorkspace.id ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {workspace.name}
                        </span>
                        {workspace.id === activeWorkspace.id && (
                          <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {workspace.tags && workspace.tags.length > 0 && (
                          <div className="flex gap-1">
                            {workspace.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {workspace.agentCount !== undefined && (
                          <span className="text-xs text-gray-500">
                            {workspace.agentCount} agent{workspace.agentCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="ml-2 flex shrink-0 items-center gap-1 self-start opacity-70 transition-opacity group-hover:opacity-100">
                  {/* Edit button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingWorkspace(workspace)
                      setIsOpen(false)
                    }}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-all"
                    title="Edit workspace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      exportWorkspace(workspace)
                    }}
                    className="p-1 text-gray-500 hover:bg-gray-100 hover:text-emerald-500 dark:hover:bg-gray-700 rounded transition-all"
                    title="Export workspace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0l4-4m-4 4l-4-4m-5 8h18" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openDashboardManager(workspace)
                    }}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                    title="Manage workspace dashboard"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h8V3H3v10zm10 8h8v-6h-8v6zm0-18v8h8V3h-8zM3 21h8v-6H3v6z" />
                    </svg>
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteClick(workspace)
                    }}
                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                    title="Delete workspace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-1 dark:border-gray-700" />

          {/* Create new workspace button */}
          <button
            onClick={() => {
              setIsOpen(false)
              onCreateNew()
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New Workspace</span>
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        isOpen={deleteDialog !== null}
        itemName={deleteDialog?.name || ''}
        itemType="workspace"
        warningMessage="All agents, communities, and groups in this workspace will be permanently deleted."
        consequences={deleteDialog?.consequences}
        onConfirm={async () => {
          if (deleteDialog) {
            await deleteWorkspace(deleteDialog.id)
            setDeleteDialog(null)
            setIsOpen(false)
          }
        }}
        onCancel={() => setDeleteDialog(null)}
      />

      {/* Edit Workspace Dialog */}
      {editingWorkspace && (
        <WorkspaceEditDialog
          workspace={editingWorkspace}
          isOpen={true}
          onClose={() => setEditingWorkspace(null)}
        />
      )}

      {dashboardWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDashboardWorkspace(null)}>
          <div
            className="flex max-h-[85vh] w-[92vw] max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Workspace Dashboard</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{dashboardWorkspace.name}</p>
              </div>
              <button
                onClick={() => setDashboardWorkspace(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-5 py-5">
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Generate Dashboard</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={dashboardTitle}
                    onChange={(e) => setDashboardTitle(e.target.value)}
                    placeholder="Dashboard title"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    value={dashboardDescription}
                    onChange={(e) => setDashboardDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">View mode</label>
                    <select
                      value={dashboardDisplayMode}
                      onChange={(e) => setDashboardDisplayMode(e.target.value as 'standard' | 'compact' | 'detail')}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    >
                      <option value="standard">Standard</option>
                      <option value="compact">Compact</option>
                      <option value="detail">Detail</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Compact favors one-page summaries, Standard matches the current balanced layout, and Detail expands cards and histories.
                    </p>
                  </div>
                  {dashboardDisplayMode !== 'compact' ? (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Drag sections to reorder the dashboard. Standard stays balanced, while Detail expands workflows and chats with deeper trace and message context.
                      </div>
                      <div className="space-y-2 text-sm">
                        {dashboardSectionOrder.map((key) => (
                          <div
                            key={key}
                            draggable
                            onDragStart={() => setDraggedSection(key)}
                            onDragEnd={() => setDraggedSection(null)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (draggedSection && draggedSection !== key) {
                                moveSectionBefore(draggedSection, key)
                                setDraggedSection(null)
                              }
                            }}
                            className="flex cursor-move items-center gap-2 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900"
                          >
                            <span className="text-gray-400">⋮⋮</span>
                            <input
                              type="checkbox"
                              checked={dashboardSections[key]}
                              onChange={(e) => setDashboardSections(prev => ({ ...prev, [key]: e.target.checked }))}
                            />
                            <span className="flex-1 capitalize text-gray-700 dark:text-gray-300">{key}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Drag sections between columns to shape the compact dashboard layout. Overview stays full-width on the shared page.
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {(['left', 'right'] as const).map((column) => (
                          <div
                            key={column}
                            className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (draggedSection) {
                                moveSectionToCompactColumn(draggedSection, column)
                                setDraggedSection(null)
                              }
                            }}
                          >
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              {column} column
                            </div>
                            <div className="space-y-2 min-h-24">
                              {compactColumnSections(column).map((key, index, sections) => (
                                <React.Fragment key={key}>
                                  <div
                                    className="h-4 rounded border border-dashed border-transparent hover:border-blue-400"
                                    onDragOver={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      if (draggedSection) {
                                        moveSectionToCompactColumn(draggedSection, column, key)
                                        setDraggedSection(null)
                                      }
                                    }}
                                  >
                                  </div>
                                  <div
                                    draggable
                                    onDragStart={() => setDraggedSection(key)}
                                    onDragEnd={() => setDraggedSection(null)}
                                    onDragOver={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                    }}
                                    onDrop={(e) => handleCompactTileDrop(e, key, column, sections)}
                                    className="flex cursor-move items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800"
                                  >
                                    <span className="text-gray-400">⋮⋮</span>
                                    <input
                                      type="checkbox"
                                      checked={dashboardSections[key]}
                                      onChange={(e) => setDashboardSections(prev => ({ ...prev, [key]: e.target.checked }))}
                                    />
                                    <span className="flex-1 capitalize text-gray-700 dark:text-gray-300">{key}</span>
                                  </div>
                                  {index === sections.length - 1 && (
                                    <div
                                      className="h-4 rounded border border-dashed border-transparent hover:border-blue-400"
                                      onDragOver={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        if (draggedSection) {
                                          moveSectionToCompactColumn(draggedSection, column)
                                          setDraggedSection(null)
                                        }
                                      }}
                                    />
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={createDashboard}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Generate Dashboard
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Generated Links</h3>
                  <span className="text-xs text-gray-400">{dashboards.length} total</span>
                </div>
                {dashboards.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">No workspace dashboards yet.</div>
                ) : (
                  <div className="space-y-2">
                    {dashboards.map((dashboard) => (
                      <div key={dashboard.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{dashboard.title}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 uppercase tracking-wide text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                              {dashboard.displayMode}
                            </span>
                            <span title={new Date(dashboard.updatedAt).toLocaleString()}>Updated {timeAgo(dashboard.updatedAt)}</span>
                            <span>•</span>
                            <span className="truncate">{getDashboardUrl(dashboard.token)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => window.open(getDashboardUrl(dashboard.token), '_blank')}
                            className="text-xs text-sky-600 hover:text-sky-700"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => copyDashboardLink(dashboard.token)}
                            className="text-xs text-emerald-600 hover:text-emerald-700"
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => deleteDashboard(dashboardWorkspace.id, dashboard.id)}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
