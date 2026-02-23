import { Router } from 'express'
import { listMarkdownFiles, readWorkspaceFile, writeWorkspaceFile } from '../lib/workspace'

const router = Router()

// GET /api/docs — list all .md files with section classification
router.get('/', (_req, res) => {
  const entries = listMarkdownFiles()
  res.json({ entries })
})

// GET /api/docs/content?path=relative/path.md — read a file
router.get('/content', (req, res) => {
  const relPath = req.query.path as string
  if (!relPath) return res.status(400).json({ error: 'path query param required' })

  const content = readWorkspaceFile(relPath)
  if (content === null) return res.status(404).json({ error: 'Not found or outside workspace' })

  res.json({ path: relPath, content })
})

// PUT /api/docs/content — write a file
router.put('/content', (req, res) => {
  const { path: relPath, content } = req.body as { path: string; content: string }
  if (!relPath || content === undefined) return res.status(400).json({ error: 'path and content required' })

  const ok = writeWorkspaceFile(relPath, content)
  if (!ok) return res.status(400).json({ error: 'Cannot write to that path' })

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
