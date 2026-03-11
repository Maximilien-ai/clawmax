import express from 'express'
import { getWorkspaceManager } from '../lib/workspace-manager'
import path from 'path'

const router = express.Router()
const workspaceManager = getWorkspaceManager()

// GET /api/workspaces - List all workspaces
router.get('/', (req, res) => {
  try {
    const workspaces = workspaceManager.listWorkspaces()
    res.json({ workspaces })
  } catch (err: any) {
    console.error('Error listing workspaces:', err)
    res.status(500).json({ error: 'Failed to load workspaces' })
  }
})

// POST /api/workspaces - Create new workspace
router.post('/', (req, res) => {
  try {
    const { name, path: workspacePath, color, tags } = req.body

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Workspace name is required' })
    }

    if (!workspacePath || typeof workspacePath !== 'string') {
      return res.status(400).json({ error: 'Workspace path is required' })
    }

    // Resolve path (handle ~ and relative paths)
    let resolvedPath = workspacePath
    if (workspacePath.startsWith('~')) {
      resolvedPath = path.join(process.env.HOME || '', workspacePath.slice(1))
    } else if (!path.isAbsolute(workspacePath)) {
      resolvedPath = path.resolve(workspacePath)
    }

    const workspace = workspaceManager.createWorkspace(name, resolvedPath, {
      color,
      tags
    })

    res.json({ workspace })
  } catch (err: any) {
    console.error('Error creating workspace:', err)
    res.status(500).json({ error: err.message || 'Failed to create workspace' })
  }
})

// GET /api/workspaces/active - Get active workspace
router.get('/active', (req, res) => {
  try {
    const workspace = workspaceManager.getActiveWorkspace()
    res.json({ workspace })
  } catch (err: any) {
    console.error('Error getting active workspace:', err)
    res.status(500).json({ error: 'Failed to load active workspace' })
  }
})

// PUT /api/workspaces/:id/activate - Switch active workspace
router.put('/:id/activate', (req, res) => {
  try {
    const { id } = req.params
    workspaceManager.setActiveWorkspace(id)

    res.json({ ok: true })
  } catch (err: any) {
    console.error('Error activating workspace:', err)
    res.status(500).json({ error: err.message || 'Failed to activate workspace' })
  }
})

// DELETE /api/workspaces/:id - Delete workspace
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    workspaceManager.deleteWorkspace(id)

    res.json({ ok: true })
  } catch (err: any) {
    console.error('Error deleting workspace:', err)
    res.status(500).json({ error: err.message || 'Failed to delete workspace' })
  }
})

// GET /api/workspaces/:id - Get workspace details
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const workspace = workspaceManager.getWorkspace(id)

    if (!workspace) {
      return res.status(404).json({ error: `Workspace '${id}' not found` })
    }

    res.json({ workspace })
  } catch (err: any) {
    console.error('Error getting workspace:', err)
    res.status(500).json({ error: 'Failed to load workspace' })
  }
})

// PATCH /api/workspaces/:id - Update workspace metadata
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { name, agentCount, color, tags } = req.body

    const updates: any = {}
    if (name && typeof name === 'string') updates.name = name
    if (typeof agentCount === 'number') updates.agentCount = agentCount
    if (color) updates.color = color
    if (Array.isArray(tags)) updates.tags = tags

    workspaceManager.updateWorkspaceMetadata(id, updates)

    res.json({ ok: true })
  } catch (err: any) {
    console.error('Error updating workspace:', err)
    res.status(500).json({ error: err.message || 'Failed to update workspace' })
  }
})

export default router
