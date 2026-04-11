import express from 'express'
import { getWorkspaceManager } from '../lib/workspace-manager'
import path from 'path'
import archiver from 'archiver'
import {
  createWorkspaceDashboard,
  deleteWorkspaceDashboard,
  listWorkspaceDashboards,
  regenerateWorkspaceDashboardToken,
  updateWorkspaceDashboard,
} from '../lib/workspace-dashboards'
import { buildWorkspaceExportManifest, getWorkspaceExportFileName, getWorkspaceExportRootName } from '../lib/workspace-export'
import { importWorkspaceFromZipArchive } from '../lib/workspace-import'
import fs from 'fs'
import os from 'os'

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
    const { name, path: workspacePath, color, tags, mode } = req.body

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
      tags,
      mode
    })

    res.json({ workspace })
  } catch (err: any) {
    console.error('Error creating workspace:', err)
    if (err?.message?.startsWith('Workspace path already exists:') || err?.message?.startsWith('Workspace path is not empty:')) {
      const pathText = String(err.message.split(':').slice(1).join(':')).trim()
      const conflict = workspaceManager.inspectWorkspacePathConflict(pathText)
      return res.status(409).json({
        error: conflict.registeredWorkspace
          ? `A workspace already uses this path: ${pathText}`
          : `A workspace already exists at this path: ${pathText}`,
        code: 'WORKSPACE_PATH_CONFLICT',
        conflict
      })
    }
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

// GET /api/workspaces/:id/export - Export workspace as zip archive
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params
    const workspace = workspaceManager.getWorkspace(id)
    if (!workspace) {
      return res.status(404).json({ error: `Workspace '${id}' not found` })
    }

    const manifest = await buildWorkspaceExportManifest(id)
    const archiveName = getWorkspaceExportFileName(workspace)
    const rootName = getWorkspaceExportRootName(workspace)

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', (err) => {
      throw err
    })
    archive.pipe(res)
    archive.directory(workspace.path, rootName)
    archive.append(JSON.stringify(manifest, null, 2), { name: `${rootName}/SYSTEM/export-manifest.json` })
    await archive.finalize()
  } catch (err: any) {
    console.error('Error exporting workspace:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to export workspace' })
    }
  }
})

// POST /api/workspaces/import-zip - Import workspace from exported zip archive
router.post('/import-zip', express.raw({ type: 'application/zip', limit: '200mb' }), async (req, res) => {
  try {
    const targetName = typeof req.query.targetName === 'string' ? req.query.targetName : undefined
    const targetPath = typeof req.query.targetPath === 'string' ? req.query.targetPath : undefined
    const activate = req.query.activate === 'false' ? false : true
    const body = req.body as Buffer

    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'ZIP body is required' })
    }

    const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'clawmax-workspace-import-'))
    const zipPath = path.join(tmpDir, 'workspace.zip')
    fs.writeFileSync(zipPath, body)

    const result = importWorkspaceFromZipArchive(zipPath, { targetName, targetPath, activate })
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to import workspace' })
  }
})

// PATCH /api/workspaces/:id - Update workspace metadata
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { name, agentCount, color, tags } = req.body

    console.log('PATCH /api/workspaces/:id - Received:', { id, name, color, tags })

    const updates: any = {}
    if (name && typeof name === 'string') updates.name = name
    if (typeof agentCount === 'number') updates.agentCount = agentCount
    if (color) updates.color = color
    if (Array.isArray(tags)) updates.tags = tags

    console.log('Applying updates:', updates)

    workspaceManager.updateWorkspaceMetadata(id, updates)

    res.json({ ok: true })
  } catch (err: any) {
    console.error('Error updating workspace:', err)
    res.status(500).json({ error: err.message || 'Failed to update workspace' })
  }
})

// GET /api/workspaces/:id/dashboards - list workspace summary dashboards
router.get('/:id/dashboards', (req, res) => {
  try {
    const { id } = req.params
    const workspace = workspaceManager.getWorkspace(id)
    if (!workspace) {
      return res.status(404).json({ error: `Workspace '${id}' not found` })
    }
    res.json({ dashboards: listWorkspaceDashboards(id) })
  } catch (err: any) {
    console.error('Error listing workspace dashboards:', err)
    res.status(500).json({ error: err.message || 'Failed to list workspace dashboards' })
  }
})

// POST /api/workspaces/:id/dashboards - create workspace summary dashboard link
router.post('/:id/dashboards', (req, res) => {
  try {
    const { id } = req.params
    const workspace = workspaceManager.getWorkspace(id)
    if (!workspace) {
      return res.status(404).json({ error: `Workspace '${id}' not found` })
    }

    const { title, description, displayMode, sections, sectionOrder, compactColumns, createdBy } = req.body || {}
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' })
    }

    const dashboard = createWorkspaceDashboard(id, {
      title,
      description: typeof description === 'string' ? description : null,
      displayMode: displayMode === 'compact' || displayMode === 'detail' ? displayMode : 'standard',
      sections: sections && typeof sections === 'object' ? sections : undefined,
      sectionOrder: Array.isArray(sectionOrder) ? sectionOrder : undefined,
      compactColumns: compactColumns && typeof compactColumns === 'object' ? compactColumns : undefined,
      createdBy: typeof createdBy === 'string' ? createdBy : null,
    })
    res.json({ dashboard })
  } catch (err: any) {
    console.error('Error creating workspace dashboard:', err)
    res.status(500).json({ error: err.message || 'Failed to create workspace dashboard' })
  }
})

// PATCH /api/workspaces/:id/dashboards/:dashboardId - update workspace dashboard metadata
router.patch('/:id/dashboards/:dashboardId', (req, res) => {
  try {
    const { id, dashboardId } = req.params
    const workspace = workspaceManager.getWorkspace(id)
    if (!workspace) {
      return res.status(404).json({ error: `Workspace '${id}' not found` })
    }

    const dashboard = updateWorkspaceDashboard(id, dashboardId, {
      title: typeof req.body?.title === 'string' ? req.body.title : undefined,
      description: req.body?.description,
      displayMode: req.body?.displayMode === 'compact' || req.body?.displayMode === 'detail' ? req.body.displayMode : req.body?.displayMode === 'standard' ? 'standard' : undefined,
      sections: req.body?.sections,
      sectionOrder: Array.isArray(req.body?.sectionOrder) ? req.body.sectionOrder : undefined,
      compactColumns: req.body?.compactColumns && typeof req.body.compactColumns === 'object' ? req.body.compactColumns : undefined,
    })
    if (!dashboard) {
      return res.status(404).json({ error: 'Workspace dashboard not found' })
    }
    res.json({ dashboard })
  } catch (err: any) {
    console.error('Error updating workspace dashboard:', err)
    res.status(500).json({ error: err.message || 'Failed to update workspace dashboard' })
  }
})

// POST /api/workspaces/:id/dashboards/:dashboardId/regenerate-token - rotate share token
router.post('/:id/dashboards/:dashboardId/regenerate-token', (req, res) => {
  try {
    const { id, dashboardId } = req.params
    const workspace = workspaceManager.getWorkspace(id)
    if (!workspace) {
      return res.status(404).json({ error: `Workspace '${id}' not found` })
    }

    const dashboard = regenerateWorkspaceDashboardToken(id, dashboardId)
    if (!dashboard) {
      return res.status(404).json({ error: 'Workspace dashboard not found' })
    }
    res.json({ dashboard })
  } catch (err: any) {
    console.error('Error regenerating workspace dashboard token:', err)
    res.status(500).json({ error: err.message || 'Failed to regenerate workspace dashboard token' })
  }
})

// DELETE /api/workspaces/:id/dashboards/:dashboardId - remove workspace summary dashboard link
router.delete('/:id/dashboards/:dashboardId', (req, res) => {
  try {
    const { id, dashboardId } = req.params
    const workspace = workspaceManager.getWorkspace(id)
    if (!workspace) {
      return res.status(404).json({ error: `Workspace '${id}' not found` })
    }

    const ok = deleteWorkspaceDashboard(id, dashboardId)
    if (!ok) {
      return res.status(404).json({ error: 'Workspace dashboard not found' })
    }
    res.json({ ok: true })
  } catch (err: any) {
    console.error('Error deleting workspace dashboard:', err)
    res.status(500).json({ error: err.message || 'Failed to delete workspace dashboard' })
  }
})

export default router
