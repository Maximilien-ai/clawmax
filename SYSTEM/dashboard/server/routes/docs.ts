import express, { Router } from 'express'
import path from 'path'
import { deleteWorkspaceAsset, extractZipBufferToWorkspace, listDocEntries, listMarkdownFiles, readWorkspaceBinaryFile, readWorkspaceFile, writeWorkspaceFile, writeWorkspaceBinaryFile } from '../lib/workspace'

const router = Router()

// GET /api/docs — list all .md files with section classification
router.get('/', (_req, res) => {
  const entries = listDocEntries()
  res.json({ entries })
})

// GET /api/docs/content?path=relative/path.md — read a file
router.get('/content', (req, res) => {
  const relPath = req.query.path as string
  if (!relPath) return res.status(400).json({ error: 'path query param required' })

  const normalized = relPath.trim().toLowerCase()
  const textExtensions = new Set(['.txt', '.text', '.log', '.json', '.yaml', '.yml', '.csv', '.tsv', '.xml', '.html', '.css', '.js', '.ts', '.py', '.sh'])
  const imageExtensions = new Map<string, string>([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.svg', 'image/svg+xml'],
  ])
  const ext = path.extname(normalized)

  if (normalized.endsWith('.md')) {
    const content = readWorkspaceFile(relPath)
    if (content === null) return res.status(404).json({ error: 'Not found or outside workspace' })
    return res.json({ path: relPath, kind: 'markdown', content })
  }

  if (textExtensions.has(ext)) {
    const content = readWorkspaceBinaryFile(relPath)
    if (content === null) return res.status(404).json({ error: 'Not found or outside workspace' })
    return res.json({ path: relPath, kind: 'text', content: content.toString('utf-8') })
  }

  if (imageExtensions.has(ext)) {
    const content = readWorkspaceBinaryFile(relPath)
    if (content === null) return res.status(404).json({ error: 'Not found or outside workspace' })
    return res.json({
      path: relPath,
      kind: 'image',
      mimeType: imageExtensions.get(ext),
      dataUrl: `data:${imageExtensions.get(ext)};base64,${content.toString('base64')}`,
    })
  }

  return res.status(415).json({ error: 'Preview not available for this file type' })
})

// POST /api/docs/content — create OR update a file
router.post('/content', (req, res) => {
  const { path: relPath, content } = req.body as { path: string; content: string }
  if (!relPath || content === undefined) return res.status(400).json({ error: 'path and content required' })

  const ok = writeWorkspaceFile(relPath, content)
  if (!ok) return res.status(400).json({ error: 'Cannot write to that path' })

  res.json({ ok: true })
})

// PUT /api/docs/content — write a file (legacy, use POST instead)
router.put('/content', (req, res) => {
  const { path: relPath, content } = req.body as { path: string; content: string }
  if (!relPath || content === undefined) return res.status(400).json({ error: 'path and content required' })

  const ok = writeWorkspaceFile(relPath, content)
  if (!ok) return res.status(400).json({ error: 'Cannot write to that path' })

  res.json({ ok: true })
})

// POST /api/docs/upload?target=AGENTS/agent-a&extractZip=true — upload a file into the workspace
router.post('/upload', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
  const target = typeof req.query.target === 'string' ? req.query.target.trim() : ''
  const extractZip = req.query.extractZip === 'true'
  const fileNameHeader = req.header('x-file-name') || req.header('x-upload-file-name') || ''
  const fileName = path.basename(fileNameHeader.trim())
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || [])

  if (!target) {
    return res.status(400).json({ error: 'target query param required' })
  }
  if (!fileName) {
    return res.status(400).json({ error: 'x-file-name header required' })
  }
  if (!body.length) {
    return res.status(400).json({ error: 'File body required' })
  }

  if (extractZip) {
    if (!fileName.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ error: 'ZIP extraction requires a .zip file' })
    }
    const extracted = extractZipBufferToWorkspace(target, body)
    if (!extracted.ok) {
      return res.status(400).json({ error: extracted.error || 'Failed to extract ZIP archive' })
    }
    return res.json({ ok: true, extracted: true, files: extracted.files || [] })
  }

  const destination = path.posix.join(target.replace(/\\/g, '/'), fileName)
  const ok = writeWorkspaceBinaryFile(destination, body)
  if (!ok) {
    return res.status(400).json({ error: 'Cannot write to that path' })
  }

  res.json({ ok: true, extracted: false, path: destination })
})

// DELETE /api/docs/entry?path=AGENTS/shared/foo.txt — delete a non-agent AGENTS asset
router.delete('/entry', (req, res) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : ''
  if (!relPath) {
    return res.status(400).json({ error: 'path query param required' })
  }
  const result = deleteWorkspaceAsset(relPath)
  if (!result.ok) {
    return res.status(400).json({ error: result.error || 'Delete failed' })
  }
  res.json({ ok: true })
})

// GET /api/docs/search?q=query — search across all markdown files
router.get('/search', (req, res) => {
  const query = req.query.q as string
  if (!query) return res.json({ results: [] })

  const searchTerm = query.toLowerCase()
  const entries = listMarkdownFiles()
  const results: Array<{ path: string; matches: number; preview: string }> = []

  for (const entry of entries) {
    const content = readWorkspaceFile(entry.path)
    if (content === null) continue

    const contentLower = content.toLowerCase()
    const lines = content.split('\n')

    // Count matches
    const matches = (contentLower.match(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    if (matches === 0) continue

    // Find first match and create preview
    let preview = ''
    for (const line of lines) {
      if (line.toLowerCase().includes(searchTerm)) {
        // Truncate line to ~150 chars around the match
        const matchIndex = line.toLowerCase().indexOf(searchTerm)
        const start = Math.max(0, matchIndex - 50)
        const end = Math.min(line.length, matchIndex + 100)
        preview = (start > 0 ? '...' : '') + line.slice(start, end) + (end < line.length ? '...' : '')
        break
      }
    }

    if (!preview) {
      // Fallback to first 150 chars
      preview = content.slice(0, 150) + (content.length > 150 ? '...' : '')
    }

    results.push({ path: entry.path, matches, preview })
  }

  // Sort by number of matches (descending)
  results.sort((a, b) => b.matches - a.matches)

  res.json({ results })
})

export default router
