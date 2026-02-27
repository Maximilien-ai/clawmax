import React, { useState, useRef, useEffect } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'

export function WorkspaceSwitcher({ onCreateNew }: { onCreateNew: () => void }) {
  const { workspaces, activeWorkspace, switchWorkspace, deleteWorkspace } = useWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{
    id: string
    name: string
    consequences: string[]
  } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium"
        title="Switch workspace"
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: activeWorkspace.color || '#3B82F6' }}
        />
        <span className="text-gray-800">{activeWorkspace.name}</span>
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
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* Workspace list */}
          <div className="max-h-80 overflow-y-auto">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="group relative">
                <button
                  onClick={() => {
                    if (workspace.id !== activeWorkspace.id) {
                      switchWorkspace(workspace.id)
                    }
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                    workspace.id === activeWorkspace.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: workspace.color || '#3B82F6' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${
                        workspace.id === activeWorkspace.id ? 'text-blue-700' : 'text-gray-900'
                      }`}>
                        {workspace.name}
                      </span>
                      {workspace.id === activeWorkspace.id && (
                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
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
                              className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"
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
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteClick(workspace)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                  title="Delete workspace"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-1" />

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
    </div>
  )
}
