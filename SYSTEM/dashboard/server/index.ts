import './lib/dashboard-env'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
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
import { startScheduler, stopScheduler } from './lib/scheduler'
import { startNotificationMonitor, stopNotificationMonitor } from './lib/notifications'
import notificationsRouter from './routes/notifications'
import { initOpikTracing, shutdownOpik } from './lib/opik'
import { getWorkspaceMetering } from './lib/metering'
import { validateCommunities, validateGroups, validateIdentity } from './lib/validator'
import { requireAuth, verifyToken } from './lib/auth'
import { createAuthRouter, requireGitHubAuth, isGitHubAuthConfigured } from './lib/github-auth'
import { safeEnv } from './lib/safe-env'
import { auditLog } from './lib/audit'
import { getBudgetStatus, loadBudgetConfig, saveBudgetConfig, BudgetConfig } from './lib/budget'
import { allowSystemKeysForUserExecution, getSystemProviderKeys, getUserDefaultProviderKeys, getBestAvailableModel, getCostEfficientModel } from './lib/dashboard-env'

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
const HOST = process.env.DASHBOARD_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
app.set('trust proxy', process.env.DASHBOARD_TRUST_PROXY === 'true' ? 1 : false)

const allowedCorsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const primaryAppOrigin = allowedCorsOrigins[0] || `http://localhost:${PORT}`

// Serve static assets BEFORE any other middleware — no CORS/auth needed for files
const earlyClientDist = resolveClientDist()
if (earlyClientDist) {
  app.use(express.static(earlyClientDist, {
    // Set proper MIME types and cache headers
    setHeaders: (res) => {
      res.removeHeader('X-Content-Type-Options') // Let browser sniff static files
    }
  }))
}

// CORS — allow configured origins, self-origins, and don't error on unknown
app.use(cors({
  origin: true, // Reflect the request origin — safe because auth middleware protects API routes
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

// Rate limiting — global: 1000 req/min, auth: 20 req/min
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
})
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts' },
})
app.use('/api', globalLimiter)
app.use('/api/auth', authLimiter)
app.use('/api', auditLog)

// Health (public)
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    workspace: WORKSPACE,
    time: new Date().toISOString(),
  })
})

// Auth verification (public, legacy)
app.post('/api/auth/verify', verifyToken)

// GitHub OAuth routes (public)
app.use('/api/auth', createAuthRouter())

// Auth config info (public — so login page knows what's available)
app.get('/api/auth/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const systemKeys = getSystemProviderKeys()
  const userKeys = getUserDefaultProviderKeys()
  res.json({
    githubEnabled: isGitHubAuthConfigured(),
    authDisabled: process.env.BYPASS_OAUTH === 'true' || process.env.DASHBOARD_AUTH_DISABLED === 'true',
    systemKeyDefaults: {
      openai: !!systemKeys.openai,
      anthropic: !!systemKeys.anthropic,
    },
    userKeyDefaults: {
      openai: !!userKeys.openai,
      anthropic: !!userKeys.anthropic,
    },
    allowSystemKeysForUserExecution: allowSystemKeysForUserExecution(),
    recommendedModel: getBestAvailableModel(),
    costEfficientModel: getCostEfficientModel(),
  })
})

// Use GitHub auth for all protected routes (falls back to dashboard token)
const protect = requireGitHubAuth

// Workspace system info — installation identity card
app.get('/api/system', protect, (_req, res) => {
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
app.get('/api/activity', protect, (_req, res) => {
  const feed = getInstallationActivity()
  res.json({ feed })
})

// Budget status
app.get('/api/budget', protect, async (_req, res) => {
  try {
    const status = await getBudgetStatus()
    res.json(status)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Update budget config
app.put('/api/budget', protect, (req, res) => {
  try {
    const current = loadBudgetConfig()
    const updates = req.body as Partial<BudgetConfig>

    // Validate
    if (updates.limitUsd !== undefined && (typeof updates.limitUsd !== 'number' || updates.limitUsd < 0)) {
      res.status(400).json({ error: 'limitUsd must be a non-negative number' })
      return
    }
    if (updates.warningPct !== undefined && (typeof updates.warningPct !== 'number' || updates.warningPct < 0 || updates.warningPct > 100)) {
      res.status(400).json({ error: 'warningPct must be 0-100' })
      return
    }

    const config: BudgetConfig = {
      limitUsd: updates.limitUsd ?? current.limitUsd,
      warningPct: updates.warningPct ?? current.warningPct,
      enforced: updates.enforced ?? current.enforced,
      paused: updates.paused ?? current.paused,
    }

    saveBudgetConfig(config)
    res.json({ ok: true, config })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Metering data from Opik
app.get('/api/metering', protect, async (_req, res) => {
  try {
    const data = await getWorkspaceMetering()
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// System logs - SSE stream
app.get('/api/system/logs', protect, (_req, res) => {
  const { spawn } = require('child_process')

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  let child: ReturnType<typeof spawn>
  try {
    child = spawn('openclaw', ['logs', '--follow', '--limit', '200'], {
      env: safeEnv(),
    })
  } catch {
    res.write(`data: ${JSON.stringify({ error: 'openclaw CLI not found — install it to see live logs' })}\n\n`)
    res.end()
    return
  }

  child.on('error', (err: NodeJS.ErrnoException) => {
    res.write(`data: ${JSON.stringify({ error: `openclaw CLI not available: ${err.code === 'ENOENT' ? 'not installed' : err.message}` })}\n\n`)
    res.end()
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
app.post('/api/docs/content', protect, async (req, res) => {
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
app.use('/api/docs', protect, docsRouter)
app.use('/api/agents', protect, agentsRouter)
app.use('/api/agents', protect, chatRouter)
app.use('/api/agents', protect, logsRouter)
app.use('/api/templates', protect, templatesRouter)
app.use('/api/skills', protect, skillsRouter)
app.use('/api/workflows', protect, workflowsRouter)
app.use('/api/workspaces', protect, workspacesRouter)
app.use('/api/notifications', protect, notificationsRouter)
app.use('/api', protect, channelsRouter)

function resolveClientDist(): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', 'dist', 'client'),
    path.join(process.cwd(), 'dist', 'client'),
    path.join(process.cwd(), 'SYSTEM', 'dashboard', 'dist', 'client'),
  ]

  for (const candidate of candidates) {
    const indexFile = path.join(candidate, 'index.html')
    if (fs.existsSync(indexFile)) {
      return candidate
    }
  }

  return null
}

// SPA fallback for client-side routing (static files already mounted above CORS)
if (earlyClientDist) {
  console.log(`[Static] Serving dashboard client from ${earlyClientDist}`)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(earlyClientDist, 'index.html'))
  })
} else if (process.env.NODE_ENV === 'production') {
  console.warn('[Static] No built dashboard client found. Root route will not serve the UI.')
} else {
  app.get('/', (_req, res) => {
    res.redirect(primaryAppOrigin)
  })
}

app.listen(PORT, HOST, () => {
  console.log(`ClawMax Dashboard server running at http://localhost:${PORT}`)
  console.log(`Workspace: ${WORKSPACE}`)
  logToFile(`Server started successfully on port ${PORT}`)
  logToFile(`Workspace: ${WORKSPACE}`)

  // Start workflow scheduler after server is ready
  startScheduler()

  // Start notification monitor
  startNotificationMonitor()

  // Initialize Opik tracing
  initOpikTracing()
})

// Graceful shutdown
process.on('SIGTERM', () => { stopScheduler(); stopNotificationMonitor(); shutdownOpik() })
process.on('SIGINT', () => { stopScheduler(); stopNotificationMonitor(); shutdownOpik() })
