import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import os from 'os'
import simpleGit from 'simple-git'
import docsRouter from './routes/docs'
import agentsRouter from './routes/agents'
import channelsRouter from './routes/channels'
import templatesRouter from './routes/templates'
import skillsRouter from './routes/skills'
import workspacesRouter from './routes/workspaces'
import chatRouter from './routes/chat'
import logsRouter from './routes/logs'
import workflowsRouter from './routes/workflows'
import { WORKSPACE, getWorkspacePath, listAgents, getInstallationActivity, getLatestTag, writeWorkspaceFile, getOrgName, parseGroups, parseIdentity } from './lib/workspace'
import { validateCommunities, validateGroups, validateIdentity } from './lib/validator'
import { requireAuth, verifyToken } from './lib/auth'

// ============================================================================
// Crash Protection & Error Logging
// ============================================================================

const CRASH_LOG = path.join(__dirname, 'logs', 'crash.log')

function logToFile(message: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}\n`
  try {
    fs.appendFileSync(CRASH_LOG, logEntry, 'utf-8')
  } catch (err) {
    console.error('Failed to write to crash log:', err)
  }
}

// Log server lifecycle events
logToFile('===== SERVER STARTING =====')

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  const message = `UNCAUGHT EXCEPTION: ${err.message}\nStack: ${err.stack || 'No stack trace'}\n`
  logToFile(message)
  console.error('Uncaught Exception:', err)
  console.error('Error logged to:', CRASH_LOG)
  process.exit(1)
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  const message = `UNHANDLED REJECTION: ${reason?.message || reason}\nStack: ${reason?.stack || 'No stack trace'}\n`
  logToFile(message)
  console.error('Unhandled Rejection:', reason)
  console.error('Error logged to:', CRASH_LOG)
})

// Handle graceful shutdown
process.on('SIGINT', () => {
  logToFile('===== SERVER STOPPED (SIGINT) =====')
  process.exit(0)
})

process.on('SIGTERM', () => {
  logToFile('===== SERVER STOPPED (SIGTERM) =====')
  process.exit(0)
})

// ============================================================================
// Express App Setup
// ============================================================================

const app = express()
const PORT = parseInt(process.env.DASHBOARD_PORT || '3001', 10)

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

// Health (public)
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    workspace: WORKSPACE,
    time: new Date().toISOString(),
  })
})

// Auth verification (public)
app.post('/api/auth/verify', verifyToken)

// Workspace system info — installation identity card
app.get('/api/system', requireAuth, (_req, res) => {
  const workspacePath = getWorkspacePath()
  let gitBranch = 'unknown'
  try {
    const head = fs.readFileSync(path.join(workspacePath, '.git', 'HEAD'), 'utf-8').trim()
    gitBranch = head.startsWith('ref: refs/heads/') ? head.replace('ref: refs/heads/', '') : head.slice(0, 7)
  } catch {}

  const agents = listAgents()
  res.json({
    workspace: workspacePath,
    hostname: os.hostname(),
    agentCount: agents.length,
    onlineCount: agents.filter(a => a.status === 'online').length,
    version: getLatestTag() ?? '0.1.0',
    gitBranch,
    orgName: getOrgName() ?? null,
  })
})

// Installation-wide activity feed
app.get('/api/activity', requireAuth, (_req, res) => {
  const feed = getInstallationActivity()
  res.json({ feed })
})

// System logs - SSE stream
app.get('/api/system/logs', requireAuth, (_req, res) => {
  const { spawn } = require('child_process')

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const child = spawn('openclaw', ['logs', '--follow', '--limit', '200'], {
    env: process.env,
  })

  child.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter((l: string) => l.trim())
    lines.forEach((line: string) => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`)
    })
  })

  child.stderr.on('data', (data: Buffer) => {
    res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`)
  })

  child.on('close', () => {
    res.end()
  })

  _req.on('close', () => {
    child.kill()
  })
})

// Save a workspace doc file
app.post('/api/docs/content', requireAuth, async (req, res) => {
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

  // Auto-commit the change to git
  try {
    const git = simpleGit(getWorkspacePath())
    const isRepo = await git.checkIsRepo()

    if (isRepo) {
      await git.add(relPath)
      const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0]
      const commitMessage = `docs: Update ${relPath}\n\nEdited via ClawMax Dashboard at ${timestamp}`
      await git.commit(commitMessage)
      console.log(`[Git] Auto-committed: ${relPath}`)
    }
  } catch (err) {
    // Log but don't fail the save operation
    console.error('[Git] Failed to auto-commit:', err)
  }

  res.json({ ok: true })
})

// API routes (all protected with auth)
app.use('/api/docs', requireAuth, docsRouter)
app.use('/api/agents', requireAuth, agentsRouter)
app.use('/api/agents', requireAuth, chatRouter)
app.use('/api/agents', requireAuth, logsRouter)
app.use('/api/templates', requireAuth, templatesRouter)
app.use('/api/skills', requireAuth, skillsRouter)
app.use('/api/workflows', requireAuth, workflowsRouter)
app.use('/api/workspaces', requireAuth, workspacesRouter)
app.use('/api', requireAuth, channelsRouter)

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
  logToFile(`Server started successfully on port ${PORT}`)
  logToFile(`Workspace: ${WORKSPACE}`)
})
