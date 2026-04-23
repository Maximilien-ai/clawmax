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
import workspaceDashboardsRouter from './routes/workspace-dashboards'
import chatRouter from './routes/chat'
import logsRouter from './routes/logs'
import workflowsRouter from './routes/workflows'
import integrationsRouter from './routes/integrations'
import { WORKSPACE, getWorkspacePath, listAgents, getWorkspaceActivity, getDashboardVersion, writeWorkspaceFile, getOrgName, parseGroups, parseIdentity, isManagedAgentWorkspaceDir } from './lib/workspace'
import { startScheduler, stopScheduler } from './lib/scheduler'
import { startNotificationMonitor, stopNotificationMonitor } from './lib/notifications'
import notificationsRouter from './routes/notifications'
import { initOpikTracing, shutdownOpik, isOpikEnabled, getRequestDashboardInstanceId } from './lib/opik'
import { getWorkspaceMetering } from './lib/metering'
import { validateCommunities, validateGroups, validateIdentity } from './lib/validator'
import { requireAuth, verifyToken } from './lib/auth'
import { createAuthRouter, requireGitHubAuth, isGitHubAuthConfigured, isOtpAuthConfigured, getAuthenticatedSession } from './lib/github-auth'
import { safeEnv } from './lib/safe-env'
import { auditLog } from './lib/audit'
import { getBudgetStatus, loadBudgetConfig, saveBudgetConfig, BudgetConfig } from './lib/budget'
import { allowSystemKeysForUserExecution, getSystemProviderKeys, getUserDefaultProviderKeys, getBestAvailableModel, getCostEfficientModel, getDashboardEnvRaw, getDefaultOllamaBaseUrl, isManagedRuntime, isOllamaUiEnabled } from './lib/dashboard-env'
import { getResolvedMaintenanceBanner } from './lib/cloud-maintenance-status'

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

const shouldServeBuiltClient = process.env.NODE_ENV === 'production'

// Serve static assets BEFORE any other middleware — no CORS/auth needed for files
const earlyClientDist = shouldServeBuiltClient ? resolveClientDist() : null
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
  skip: (req) => req.method === 'GET' && /^\/api\/workspaces\/[^/]+\/export$/.test(req.path),
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
  const rawEnv = getDashboardEnvRaw()
  const systemKeys = getSystemProviderKeys()
  const userKeys = getUserDefaultProviderKeys()
  const managedRuntime = isManagedRuntime(rawEnv)
  res.json({
    githubEnabled: isGitHubAuthConfigured(),
    otpEnabled: isOtpAuthConfigured(),
    authMode: process.env.DASHBOARD_AUTH_MODE || 'github_oauth',
    authDisabled: process.env.BYPASS_OAUTH === 'true' || process.env.DASHBOARD_AUTH_DISABLED === 'true' || process.env.DASHBOARD_AUTH_MODE === 'bypass',
    managedRuntime,
    ollamaEnabled: isOllamaUiEnabled(rawEnv),
    defaultOllamaBaseUrl: getDefaultOllamaBaseUrl(rawEnv),
    systemKeyDefaults: {
      openai: !!systemKeys.openai,
      anthropic: !!systemKeys.anthropic,
      gemini: !!systemKeys.gemini,
    },
    userKeyDefaults: {
      openai: !!userKeys.openai,
      anthropic: !!userKeys.anthropic,
      gemini: !!userKeys.gemini,
    },
    allowSystemKeysForUserExecution: allowSystemKeysForUserExecution(),
    recommendedModel: getBestAvailableModel(),
    costEfficientModel: getCostEfficientModel(),
  })
})

// Shareable workspace summary dashboard payload (public by token)
app.use('/api/workspace-dashboards', workspaceDashboardsRouter)

// Use GitHub auth for all protected routes (falls back to dashboard token)
const protect = requireGitHubAuth

// Workspace system info — installation identity card
app.get('/api/system', protect, async (_req, res) => {
  const workspacePath = getWorkspacePath()
  const rawEnv = getDashboardEnvRaw()
  const managedRuntime = isManagedRuntime(rawEnv)
  let gitBranch = 'unknown'
  try {
    const head = fs.readFileSync(path.join(workspacePath, '.git', 'HEAD'), 'utf-8').trim()
    gitBranch = head.startsWith('ref: refs/heads/') ? head.replace('ref: refs/heads/', '') : head.slice(0, 7)
  } catch {}

  const agents = listAgents()
  const activeAgents = agents.filter(a => !a.paused)
  const maintenanceBanner = await getResolvedMaintenanceBanner(rawEnv)
  res.json({
    workspace: workspacePath,
    hostname: os.hostname(),
    agentCount: agents.length,
    activeAgentCount: activeAgents.length,
    pausedAgentCount: agents.length - activeAgents.length,
    onlineCount: activeAgents.filter(a => a.status === 'online').length,
    version: getDashboardVersion(),
    gitBranch,
    managedRuntime,
    ollamaEnabled: isOllamaUiEnabled(rawEnv),
    defaultOllamaBaseUrl: getDefaultOllamaBaseUrl(rawEnv),
    maintenanceBanner,
    orgName: getOrgName() ?? null,
  })
})

// Active workspace activity feed
app.get('/api/activity', protect, (_req, res) => {
  const feed = getWorkspaceActivity()
  res.json({ feed })
})

// Budget status
app.get('/api/budget', protect, async (req, res) => {
  try {
    if (!isOpikEnabled()) {
      return res.json({
        enabled: false,
        reason: 'Opik is not configured for this instance.',
      })
    }
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined
    const session = getAuthenticatedSession(req)
    const status = await getBudgetStatus(workspaceId, {
      userId: session?.userId || null,
      login: session?.login || null,
      email: session?.email || null,
      dashboardInstanceId: getRequestDashboardInstanceId(req),
    })
    res.json({ enabled: true, ...status })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Update budget config
app.put('/api/budget', protect, (req, res) => {
  try {
    if (!isOpikEnabled()) {
      return res.status(400).json({
        error: 'Cost & Budgeting is disabled because Opik is not configured for this instance.',
      })
    }
    const updates = req.body as Partial<BudgetConfig> & { workspaceId?: string }
    const workspaceId = typeof updates.workspaceId === 'string' ? updates.workspaceId : undefined
    const current = loadBudgetConfig(workspaceId)

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

    saveBudgetConfig(config, workspaceId)
    res.json({ ok: true, config })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Metering data from Opik
app.get('/api/metering', protect, async (req, res) => {
  try {
    if (!isOpikEnabled()) {
      return res.json({
        enabled: false,
        reason: 'Opik is not configured for this instance.',
      })
    }
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined
    const session = getAuthenticatedSession(req)
    const data = await getWorkspaceMetering(workspaceId, session ? {
      userId: session.userId,
      login: session.login,
      email: session.email || null,
      dashboardInstanceId: getRequestDashboardInstanceId(req),
    } : {
      dashboardInstanceId: getRequestDashboardInstanceId(req),
    })
    res.json({ enabled: true, ...data })
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

  // Try openclaw logs first, fall back to dashboard log file
  let child: ReturnType<typeof spawn> | null = null
  let useFileFallback = false

  try {
    require('child_process').execSync('which openclaw', { stdio: 'pipe' })
    child = spawn('openclaw', ['logs', '--follow', '--limit', '200'], { env: safeEnv() })
  } catch {
    useFileFallback = true
  }

  if (child) {
    let spawnerror = false
    child.on('error', () => {
      spawnerror = true
      useFileFallback = true
      startFileTail()
    })

    child.stdout.on('data', (data: Buffer) => {
      if (spawnerror) return
      const lines = data.toString().split('\n').filter((l: string) => l.trim())
      lines.forEach((line: string) => {
        try { res.write(`data: ${JSON.stringify({ line })}\n\n`) } catch {}
      })
    })

    child.stderr.on('data', (data: Buffer) => {
      // Don't send stderr as errors — it may contain normal output
      const text = data.toString().trim()
      if (text && !text.includes('bootstrap config')) {
        try { res.write(`data: ${JSON.stringify({ line: `[stderr] ${text}` })}\n\n`) } catch {}
      }
    })

    child.on('close', (code: number | null) => {
      if (code !== 0 && !spawnerror) {
        // openclaw logs failed — fall back to file tail
        startFileTail()
      } else if (!spawnerror) {
        try { res.end() } catch {}
      }
    })

    _req.on('close', () => {
      try { child?.kill() } catch {}
    })
  }

  if (useFileFallback) {
    startFileTail()
  }

  function startFileTail() {
    // Read last 100 lines of dashboard log then tail
    // Try multiple log file locations
    const logCandidates = ['/tmp/dashboard.log', path.join(__dirname, 'logs', 'crash.log')]
    const logFile = logCandidates.find(f => fs.existsSync(f)) || '/tmp/dashboard.log'
    res.write(`data: ${JSON.stringify({ line: '[System] Reading logs...' })}\n\n`)

    if (!fs.existsSync(logFile)) {
      res.write(`data: ${JSON.stringify({ line: '[System] Running in foreground mode — logs are in your terminal. Use ./SYSTEM/start.sh (without -f) to enable log streaming.' })}\n\n`)
      // Keep connection open with periodic pings
      const ping = setInterval(() => {
        try { res.write(': keepalive\n\n') } catch { clearInterval(ping) }
      }, 15000)
      _req.on('close', () => clearInterval(ping))
      return
    }

    // Send existing lines
    try {
      const content = fs.readFileSync(logFile, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim()).slice(-100)
      lines.forEach(line => {
        try { res.write(`data: ${JSON.stringify({ line })}\n\n`) } catch {}
      })
    } catch {}

    // Tail the file
    const tail = spawn('tail', ['-f', logFile])
    tail.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim())
      lines.forEach((line: string) => {
        try { res.write(`data: ${JSON.stringify({ line })}\n\n`) } catch {}
      })
    })

    tail.on('close', () => { try { res.end() } catch {} })
    _req.on('close', () => { try { tail.kill() } catch {} })
  }
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
app.use('/api/integrations', protect, integrationsRouter)
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
} else if (shouldServeBuiltClient) {
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

  // Auto-register unregistered workspace agents with openclaw CLI
  try {
    const { execSync } = require('child_process')
    execSync('which openclaw', { stdio: 'pipe' })
    // CLI available — check for unregistered agents
    const agentsDir = path.join(getWorkspacePath(), 'AGENTS')
    if (fs.existsSync(agentsDir)) {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
      const registeredIds = new Set<string>()
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        for (const a of config?.agents?.list || []) { if (a.id) registeredIds.add(a.id) }
      } catch {}

      const dirs = fs.readdirSync(agentsDir, { withFileTypes: true })
      let fixed = 0
      for (const d of dirs) {
        if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'archive') continue
        if (registeredIds.has(d.name)) continue
        try {
          const ws = path.join(agentsDir, d.name)
          if (!isManagedAgentWorkspaceDir(ws)) continue
          const ad = path.join(os.homedir(), '.openclaw', 'agents', d.name, 'agent')
          fs.mkdirSync(ad, { recursive: true })
          execSync(`openclaw agents add ${d.name} --workspace "${ws}" --agent-dir "${ad}" --non-interactive`, { stdio: 'pipe', timeout: 10000 })
          fixed++
        } catch {}
      }
      if (fixed > 0) console.log(`[Doctor] Auto-registered ${fixed} unregistered agent(s)`)
    }
  } catch {}

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
