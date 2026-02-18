import { Router } from 'express'
import { listMarkdownFiles, readWorkspaceFile, writeWorkspaceFile } from '../lib/workspace'

const router = Router()

// GET /api/docs — list all .md files
router.get('/', (_req, res) => {
  const files = listMarkdownFiles()
  res.json({ files })
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

export default router
