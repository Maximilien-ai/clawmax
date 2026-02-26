import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useToast } from '../components/Toast'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  lastAccessedAt: string
  agentCount?: number
  color?: string
  tags?: string[]
}

interface WorkspaceContextValue {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  loading: boolean

  // Actions
  switchWorkspace: (id: string) => Promise<void>
  createWorkspace: (name: string, path: string, options?: { color?: string; tags?: string[] }) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  refreshWorkspaces: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { showSuccess, showError } = useToast()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshWorkspaces = useCallback(async () => {
    try {
      const [workspacesRes, activeRes] = await Promise.all([
        fetch('/api/workspaces'),
        fetch('/api/workspaces/active')
      ])

      if (workspacesRes.ok && activeRes.ok) {
        const workspacesData = await workspacesRes.json()
        const activeData = await activeRes.json()

        setWorkspaces(workspacesData.workspaces || [])
        setActiveWorkspace(activeData.workspace || null)
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err)
      showError('Failed to load workspaces')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    refreshWorkspaces()
  }, [refreshWorkspaces])

  const switchWorkspace = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/workspaces/${id}/activate`, {
        method: 'PUT'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to switch workspace')
      }

      await refreshWorkspaces()

      // Reload the page to refresh all data with new workspace
      window.location.reload()
    } catch (err: any) {
      console.error('Failed to switch workspace:', err)
      showError(err.message || 'Failed to switch workspace')
    }
  }, [refreshWorkspaces, showError])

  const createWorkspace = useCallback(async (
    name: string,
    path: string,
    options?: { color?: string; tags?: string[] }
  ): Promise<Workspace> => {
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, ...options })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create workspace')
      }

      const data = await res.json()
      await refreshWorkspaces()
      showSuccess(`Workspace "${name}" created successfully`)
      return data.workspace
    } catch (err: any) {
      console.error('Failed to create workspace:', err)
      showError(err.message || 'Failed to create workspace')
      throw err
    }
  }, [refreshWorkspaces, showSuccess, showError])

  const deleteWorkspace = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete workspace')
      }

      await refreshWorkspaces()
      showSuccess('Workspace deleted successfully')
    } catch (err: any) {
      console.error('Failed to delete workspace:', err)
      showError(err.message || 'Failed to delete workspace')
      throw err
    }
  }, [refreshWorkspaces, showSuccess, showError])

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    loading,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    refreshWorkspaces
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}
