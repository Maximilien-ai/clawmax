import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import os from 'os'
import docsRouter from './routes/docs'
import agentsRouter from './routes/agents'
import channelsRouter from './routes/channels'
import { WORKSPACE, listAgents, getInstallationActivity, getLatestTag, writeWorkspaceFile, getOrgName, parseGroups, parseIdentity } from './lib/workspace'
import { validateCommunities, validateGroups, validateIdentity } from './lib/validator'

const app = express()
const PORT = parseInt(process.env.DASHBOARD_PORT || '3001', 10)

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    workspace: WORKSPACE,
    time: new Date().toISOString(),
  })
})

// Workspace system info — installation identity card
app.get('/api/system', (_req, res) => {
  let gitBranch = 'unknown'
  try {
    const head = fs.readFileSync(path.join(WORKSPACE, '.git', 'HEAD'), 'utf-8').trim()
    gitBranch = head.startsWith('ref: refs/heads/') ? head.replace('ref: refs/heads/', '') : head.slice(0, 7)
  } catch {}

  const agents = listAgents()
  res.json({
    workspace: WORKSPACE,
    hostname: os.hostname(),
    agentCount: agents.length,
    onlineCount: agents.filter(a => a.status === 'online').length,
    version: getLatestTag() ?? '0.1.0',
    gitBranch,
    orgName: getOrgName() ?? null,
  })
})

// Installation-wide activity feed
app.get('/api/activity', (_req, res) => {
  const feed = getInstallationActivity()
  res.json({ feed })
})

// Save a workspace doc file
app.post('/api/docs/content', (req, res) => {
  const { path: relPath, content } = req.body as { path?: string; content?: string }
  if (!relPath || typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'Missing path or content' })
    return
  }

  // Validate content before saving if it's a schema-backed file
  const fileName = relPath.split('/').pop()

  if (fileName === 'COMMUNITIES.md') {
    const { communities } = parseGroups(content)
    const validation = validateCommunities(communities)
    if (!validation.valid) {
      // Enhance error messages with actual names
      const enhancedErrors = validation.errors.map(err => {
        const match = err.field.match(/^communities\.(\d+)\.?(.*)/)
        if (match) {
          const idx = parseInt(match[1])
          let subfield = match[2]
          const community = communities[idx]
          const name = community?.name || `#${idx}`

          // Further enhance array field errors (e.g., tags.0 -> tag "value")
          const arrayMatch = subfield?.match(/^(tags|channels)\.(\d+)$/)
          if (arrayMatch && community) {
            const arrayField = arrayMatch[1] as 'tags' | 'channels'
            const arrayIdx = parseInt(arrayMatch[2])
            const value = community[arrayField]?.[arrayIdx]
            if (value) {
              subfield = `${arrayField.slice(0, -1)} "${value}"`
            }
          }

          return {
            ...err,
            field: subfield ? `Community "${name}" → ${subfield}` : `Community "${name}"`
          }
        }
        return err
      })
      res.status(400).json({
        ok: false,
        error: 'Validation failed',
        validationErrors: enhancedErrors
      })
      return
    }
  } else if (fileName === 'GROUPS.md') {
    const { groups } = parseGroups(content)
    const validation = validateGroups(groups)
    if (!validation.valid) {
      // Enhance error messages with actual names
      const enhancedErrors = validation.errors.map(err => {
        const match = err.field.match(/^groups\.(\d+)\.?(.*)/)
        if (match) {
          const idx = parseInt(match[1])
          let subfield = match[2]
          const group = groups[idx]
          const name = group?.name || `#${idx}`

          // Further enhance array field errors (e.g., tags.0 -> tag "value")
          const arrayMatch = subfield?.match(/^(tags|channels)\.(\d+)$/)
          if (arrayMatch && group) {
            const arrayField = arrayMatch[1] as 'tags' | 'channels'
            const arrayIdx = parseInt(arrayMatch[2])
            const value = group[arrayField]?.[arrayIdx]
            if (value) {
              subfield = `${arrayField.slice(0, -1)} "${value}"`
            }
          }

          return {
            ...err,
            field: subfield ? `Group "${name}" → ${subfield}` : `Group "${name}"`
          }
        }
        return err
      })
      res.status(400).json({
        ok: false,
        error: 'Validation failed',
        validationErrors: enhancedErrors
      })
      return
    }
  } else if (fileName === 'IDENTITY.md') {
    const identity = parseIdentity(content)
    const validation = validateIdentity(identity)
    if (!validation.valid) {
      res.status(400).json({
        ok: false,
        error: 'Validation failed',
        validationErrors: validation.errors
      })
      return
    }
  }

  const ok = writeWorkspaceFile(relPath, content)
  if (!ok) {
    res.status(403).json({ ok: false, error: 'Path not allowed or not a markdown file' })
    return
  }
  res.json({ ok: true })
})

// API routes
app.use('/api/docs', docsRouter)
app.use('/api/agents', agentsRouter)
app.use('/api', channelsRouter)

// Serve built client in production
const clientDist = path.join(__dirname, '..', '..', 'dist', 'client')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`ClawMax Dashboard server running at http://localhost:${PORT}`)
  console.log(`Workspace: ${WORKSPACE}`)
})
