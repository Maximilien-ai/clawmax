import express, { Router } from 'express'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import archiver from 'archiver'
import { listAgents, getAgentActivity, getNextAgentId, findFreePort, getAgentImpact, deleteAgent, cloneAgentFiles, getAgentGatewayConfig, parseGroups, getWorkspacePath, getAgentsDir } from '../lib/workspace'
import { generateAgentFiles, generateArchiveTitle } from '../lib/ai-generator'
import { importAgentFromTemplate } from '../lib/templates'
import { getConfiguredGatewayPort, getGatewayClient, isGatewayConfigured, isGatewayRunning } from '../lib/gateway-rpc'
import { listWorkflows, resolveParticipants } from '../lib/workflows'
import { safeEnv, validatePort } from '../lib/safe-env'
import { validateAgentConfigSections, validateProvisionInput } from '../lib/agent-config-validation'
import { updateAgentModelInConfigFile, upsertAgentModelInIdentityContent } from '../lib/agent-model'
import { validateAgentCostLimit } from '../lib/budget'
import { getSystemProviderKeys, getUserDefaultProviderKeys } from '../lib/dashboard-env'
import { discoverModels, getAvailableModelsCached, clearModelCache } from '../lib/model-discovery'
import { getPausedAgents, pauseAgents, resumeAgents, getAgentCostLimit, setAgentCostLimit, getAllAgentCostLimits } from '../lib/agent-state'
import { exportAgentToOpenClaw, getAgentTransferMetadata, importAgentFromBundleDirectory, importAgentFromOpenClaw, importAgentFromZipArchive, listImportableOpenClawAgents } from '../lib/openclaw-agent-transfer'

/** Find the root dir of a pnpm package by scanning .pnpm store for a prefix */
function findPnpmPkg(repoDir: string, prefix: string, pkgSubPath: string): string | null {
  const pnpmDir = path.join(repoDir, 'node_modules', '.pnpm')
  try {
    const entries = fs.readdirSync(pnpmDir)
    for (const e of entries) {
      if (!e.startsWith(prefix)) continue
      const candidate = path.join(pnpmDir, e, 'node_modules', pkgSubPath)
      if (fs.existsSync(path.join(candidate, 'lib', 'index.js'))) return candidate
    }
  } catch {}
  // Fallback: direct node_modules
  const direct = path.join(repoDir, 'node_modules', pkgSubPath)
  if (fs.existsSync(path.join(direct, 'lib', 'index.js'))) return direct
  return null
}

/** Detect Baileys and Boom paths from known openclaw repo locations */
function detectWaPaths(): { baileys: string | null; boom: string | null } {
  const HOME = process.env.HOME || ''
  // Search order: openclaw main repo, workspace itself
  const repoDirs = [
    path.join(HOME, 'github', 'maximilien', 'openclaw'),
    getWorkspacePath(),
  ]
  for (const dir of repoDirs) {
    const baileys = findPnpmPkg(dir, '@whiskeysockets+baileys', '@whiskeysockets/baileys')
    const boom = findPnpmPkg(dir, '@hapi+boom', '@hapi/boom')
    if (baileys && boom) return { baileys, boom }
  }
  return { baileys: null, boom: null }
}

/** Synchronous model list for validation — uses cached discovery or fallback */
function getAvailableModels(): string[] {
  return getAvailableModelsCached()
}

// buildModelsResponse removed — replaced by discoverModels() from model-discovery.ts

function updateAgentModelInConfig(agentId: string, model: string): { ok: boolean; error?: string } {
  const HOME = process.env.HOME || ''
  const profileConfigPath = path.join(HOME, `.openclaw-${agentId}`, 'openclaw.json')
  const defaultConfigPath = path.join(HOME, '.openclaw', 'openclaw.json')
  const configPath = fs.existsSync(profileConfigPath) ? profileConfigPath : defaultConfigPath
  return updateAgentModelInConfigFile(configPath, agentId, model)
}

function updateAgentIdentityModel(identityPath: string, model: string) {
  const content = fs.readFileSync(identityPath, 'utf-8')
  fs.writeFileSync(identityPath, upsertAgentModelInIdentityContent(content, model), 'utf-8')
}

/**
 * Register a new agent via Gateway RPC
 *
 * Uses OpenClaw Gateway RPC for config modifications, which provides:
 * - Full Zod schema validation
 * - Automatic metadata stamping
 * - Environment variable preservation
 * - Merge patch conflict resolution
 * - Atomic writes with backups
 */
async function registerAgentInConfig(agentId: string, profile: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const HOME = process.env.HOME || ''
    const workspacePath = path.join(getWorkspacePath(), 'AGENTS', agentId)
    const agentDir = profile
      ? path.join(HOME, `.openclaw-${agentId}`, 'agents', agentId, 'agent')
      : path.join(HOME, '.openclaw', 'agents', agentId, 'agent')

    // Ensure agent directory exists
    fs.mkdirSync(agentDir, { recursive: true })

    if (profile) {
      // Profile mode: Must use direct write (Gateway doesn't support profile configs)
      console.warn(`⚠️  Profile mode: Using direct config write for agent ${agentId}`)

      const configPath = path.join(HOME, `.openclaw-${agentId}`, 'openclaw.json')

      if (!fs.existsSync(configPath)) {
        return { ok: false, error: `Config not found: ${configPath}` }
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

      if (config.agents?.list?.some((a: any) => a.id === agentId)) {
        return { ok: true }
      }

      const newAgent = {
        id: agentId,
        name: agentId,
        workspace: workspacePath,
        agentDir
      }

      if (!config.agents) config.agents = {}
      if (!config.agents.list) config.agents.list = []
      config.agents.list.push(newAgent)

      // Add metadata stamping for profile mode
      const now = new Date().toISOString()
      config.meta = {
        ...config.meta,
        lastTouchedVersion: 'dashboard-0.1.0',
        lastTouchedAt: now
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { ok: true }
    }

    // Default mode: Use Gateway RPC
    const gateway = getGatewayClient()
    await gateway.registerAgent({
      id: agentId,
      name: agentId,
      workspace: workspacePath,
      agentDir
    })

    console.log(`✓ Successfully registered agent ${agentId} via Gateway RPC`)
    return { ok: true }
  } catch (err: any) {
    console.error(`Error registering agent ${agentId}:`, err)
    return { ok: false, error: err.message || String(err) }
  }
}

const router = Router()

// GET /api/agents — list all agents with optional pagination
// Query params: ?limit=20&cursor=agent-id
router.get('/', (req, res) => {
  const { limit: limitStr, cursor } = req.query
  const allAgents = listAgents()

  // If no pagination params, return all agents (backward compatibility)
  if (!limitStr) {
    return res.json({ agents: allAgents })
  }

  const limit = parseInt(limitStr as string, 10) || 20

  // Find cursor position
  let startIndex = 0
  if (cursor && typeof cursor === 'string') {
    const cursorIndex = allAgents.findIndex(a => a.id === cursor)
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1 // Start after the cursor
    }
  }

  // Slice agents for this page
  const agents = allAgents.slice(startIndex, startIndex + limit)

  // Determine next cursor (last agent ID in this batch)
  const hasMore = startIndex + limit < allAgents.length
  const nextCursor = hasMore && agents.length > 0 ? agents[agents.length - 1].id : null

  res.json({
    agents,
    hasMore,
    nextCursor,
    total: allAgents.length
  })
})

// GET /api/agents/next — next available ID + free port (must be before /:id)
// Query param: ?cloneFrom=agent_name to suggest {agent_name}N format
router.get('/next', async (req, res) => {
  const cloneFrom = req.query.cloneFrom as string | undefined
  const id = getNextAgentId(cloneFrom)

  // Extract number from ID for port calculation
  const numMatch = id.match(/(\d+)$/)
  const n = numMatch ? parseInt(numMatch[1], 10) : 0
  const port = await findFreePort(18889 + n * 100)

  res.json({ id, port })
})

// GET /api/agents/status — system status with agent counts
router.get('/status', async (req, res) => {
  const agents = listAgents()

  const { execSync } = require('child_process')
  let runningGateways = 0
  let gatewayAvailable = false

  // Check if openclaw CLI is available
  try {
    execSync('which openclaw', { encoding: 'utf-8' })
    gatewayAvailable = true
  } catch (err) {
    // openclaw not in PATH
  }

  // Count running gateways (look for openclaw gateway process)
  try {
    const result = execSync('ps aux | grep "openclaw.*gateway" | grep -v grep', { encoding: 'utf-8' })
    runningGateways = result.trim().split('\n').filter((line: string) => line.trim()).length
  } catch (err) {
    // No gateways running
  }

  const online = agents.filter(a => a.status === 'online').length
  const offline = agents.filter(a => a.status === 'offline').length
  const unknown = agents.filter(a => a.status === 'unknown').length

  res.json({
    total: agents.length,
    online,
    offline,
    unknown,
    runningGateways,
    gatewayAvailable,
    timestamp: new Date().toISOString(),
  })
})

// POST /api/agents/generate — AI-generate agent files
// If name is omitted, AI will suggest name, tags, and model
router.post('/generate', async (req, res) => {
  const { description, name, tags, suggestMeta, byokKeys } = req.body as {
    description?: string
    name?: string
    tags?: string[]
    suggestMeta?: boolean
    byokKeys?: { openai?: string; anthropic?: string; gemini?: string }
  }

  if (!description) {
    res.status(400).json({ error: 'description is required' })
    return
  }

  try {
    // Set BYOK keys for this request
    const { setRequestByokKeys } = require('../lib/ai-generator')
    setRequestByokKeys(byokKeys)

    // If suggestMeta or no name, generate suggestions first
    let suggestedName = name || ''
    let suggestedTags = tags || []
    let suggestedModel = ''
    let suggestedSkills: string[] = []

    if (suggestMeta || !name) {
      const { generateAgentMeta } = require('../lib/ai-generator')
      const meta = await generateAgentMeta(description)
      if (!name) suggestedName = meta.name || 'new-agent'
      if (!tags || tags.length === 0) suggestedTags = meta.tags || []
      suggestedModel = meta.model || ''
      suggestedSkills = meta.skills || []
    }

    const files = await generateAgentFiles({
      description,
      name: suggestedName,
      tags: suggestedTags,
    })
    res.json({
      ...files,
      suggestedName,
      suggestedTags,
      suggestedModel,
      suggestedSkills,
    })
  } catch (err) {
    console.error('AI generation error:', err)
    res.status(500).json({ error: String(err) })
  } finally {
    const { setRequestByokKeys } = require('../lib/ai-generator')
    setRequestByokKeys(undefined)
  }
})

// POST /api/agents/validate-provision — validate add-agent inputs before provisioning
router.post('/validate-provision', (req, res) => {
  const result = validateProvisionInput(req.body || {}, {
    existingAgentIds: listAgents().map(agent => agent.id),
    availableModels: getAvailableModels(),
  })
  res.json(result)
})

// GET /api/agents/models — dynamic discovery from provider APIs (cached 1hr)
// Must be defined before /:id routes.
router.get('/models', async (req, res) => {
  try {
    const byokKeys = {
      openai: req.query.openaiKey as string | undefined,
      anthropic: req.query.anthropicKey as string | undefined,
      gemini: req.query.geminiKey as string | undefined,
      ollamaBaseUrl: req.query.ollamaBaseUrl as string | undefined,
    }
    const result = await discoverModels(byokKeys.openai || byokKeys.anthropic || byokKeys.gemini || byokKeys.ollamaBaseUrl ? byokKeys : undefined)
    res.json(result)
  } catch (err) {
    console.error('Model discovery failed:', err)
    res.status(500).json({ error: 'Failed to discover models' })
  }
})

// POST /api/agents/models/refresh — force-clear cache and re-fetch
router.post('/models/refresh', async (req, res) => {
  clearModelCache()
  try {
    const byokKeys = req.body as { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string } | undefined
    const result = await discoverModels(byokKeys?.openai || byokKeys?.anthropic || byokKeys?.gemini || byokKeys?.ollamaBaseUrl ? byokKeys : undefined)
    res.json(result)
  } catch (err) {
    console.error('Model refresh failed:', err)
    res.status(500).json({ error: 'Failed to refresh models' })
  }
})

// POST /api/agents/provision — spawn setup.sh and stream output via SSE
router.post('/provision', (req, res) => {
  const { name, model, whatsapp, port, profile, cloneFrom, templateSlug, generatedFiles, tags, aiDescription } = req.body as {
    name?: string
    model?: string
    whatsapp?: string
    port?: number
    profile?: boolean
    cloneFrom?: string
    templateSlug?: string
    generatedFiles?: { identity: string; soul: string; tools: string }
    tags?: string[]
    aiDescription?: string
  }

  const inputValidation = validateProvisionInput(req.body || {}, {
    existingAgentIds: listAgents().map(agent => agent.id),
    availableModels: getAvailableModels(),
  })

  if (!inputValidation.valid) {
    res.status(400).json({
      error: 'Validation failed',
      details: inputValidation.errors,
      warnings: inputValidation.warnings,
    })
    return
  }

  const validatedName = name!
  const validatedModel = model!

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (type: string, data: string) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
  }

  // Write AI-generated files before provisioning
  if (generatedFiles) {
    const dstPath = path.join(getAgentsDir(), validatedName)
    fs.mkdirSync(dstPath, { recursive: true })

    fs.writeFileSync(path.join(dstPath, 'IDENTITY.md'), generatedFiles.identity)
    fs.writeFileSync(path.join(dstPath, 'SOUL.md'), generatedFiles.soul)
    fs.writeFileSync(path.join(dstPath, 'TOOLS.md'), generatedFiles.tools)

    send('log', `Wrote AI-generated files: IDENTITY.md, SOUL.md, TOOLS.md\n`)
  }

  // Import from template if specified
  if (templateSlug) {
    const result = importAgentFromTemplate(templateSlug, {
      newAgentId: validatedName,
      model: validatedModel,
      port,
      whatsapp
    })

    if (!result.ok) {
      send('error', result.error || 'Failed to import from template')
      res.end()
      return
    }

    send('log', `Imported files from template: ${templateSlug}\n`)
  }
  // Clone source agent files before provisioning
  else if (cloneFrom && /^[a-z][a-z0-9_-]*$/.test(cloneFrom)) {
    const srcPath = path.join(getAgentsDir(), cloneFrom)
    const dstPath = path.join(getAgentsDir(), validatedName)
    const copied = cloneAgentFiles(srcPath, dstPath, cloneFrom, validatedName)
    if (copied.length > 0) {
      send('log', `Cloned ${copied.length} file(s) from ${cloneFrom}: ${copied.join(', ')}\n`)
    }
  }

  // Check if agent is already registered in openclaw.json
  const HOME = process.env.HOME || ''
  const configPath = path.join(HOME, '.openclaw', 'openclaw.json')
  let isRegistered = false
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list || []
    isRegistered = agentList.some((a: any) => a.id === validatedName)
  } catch {}

  if (isRegistered) {
    // Agent already registered - skip openclaw agents add
    send('log', `Agent "${validatedName}" is already registered\n`)
    send('done', 'ok')
    res.end()
    return
  }

  // Build openclaw agents add command
  const workspaceArg = path.join(getWorkspacePath(), 'AGENTS', validatedName)
  const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', validatedName, 'agent')

  // Ensure workspace directory exists before registering agent
  try {
    fs.mkdirSync(workspaceArg, { recursive: true })
    send('log', `Created workspace directory: ${workspaceArg}\n`)
  } catch (err: any) {
    send('error', `Failed to create workspace directory: ${err.message}`)
    res.end()
    return
  }

  // Get available models based on API keys
  const availableModels = getAvailableModels()

  // Normalize model name - ensure it has a provider prefix
  let normalizedModel = validatedModel
  if (validatedModel && !validatedModel.includes('/')) {
    // Detect provider based on model name
    if (validatedModel.startsWith('claude-') || validatedModel.startsWith('anthropic-')) {
      normalizedModel = `anthropic/${validatedModel}`
    } else if (validatedModel.startsWith('gpt-') || validatedModel.startsWith('o1-') || validatedModel.startsWith('openai-')) {
      normalizedModel = `openai/${validatedModel}`
    } else if (validatedModel.startsWith('gemini-') || validatedModel.startsWith('gemini/')) {
      normalizedModel = validatedModel.startsWith('gemini/') ? validatedModel : `gemini/${validatedModel}`
    } else if (validatedModel.startsWith('ollama/') || validatedModel.includes(':')) {
      normalizedModel = validatedModel.startsWith('ollama/') ? validatedModel : `ollama/${validatedModel}`
    } else {
      // Default to openai for unknown models
      normalizedModel = `openai/${validatedModel}`
    }
    send('log', `Normalized model from "${validatedModel}" to "${normalizedModel}"\n`)
  }

  // Validate model is available - if not, use a sensible fallback
  if (normalizedModel && availableModels.length > 0 && !availableModels.includes(normalizedModel) && !availableModels.includes(normalizedModel.replace(/^(anthropic|openai|gemini|ollama)\//, ''))) {
    const fallbackModel = availableModels.find(m => m.includes('/')) || availableModels[0]
    send('log', `⚠️  Model "${normalizedModel}" is not available with system API keys\n`)
    send('log', `Using fallback model: "${fallbackModel}"\n`)
    normalizedModel = fallbackModel
  }
  // When no system keys configured (BYOK-only), trust the client's model choice
  if (availableModels.length === 0 && normalizedModel) {
    send('log', `Using BYOK model: ${normalizedModel}\n`)
  }
  // Ultimate fallback if no model at all
  if (!normalizedModel) {
    normalizedModel = 'anthropic/claude-sonnet-4-20250514'
    send('log', `No model specified, using default: ${normalizedModel}\n`)
  }

  const args: string[] = ['agents', 'add', validatedName, '--workspace', workspaceArg, '--agent-dir', agentDirArg, '--non-interactive']
  if (normalizedModel) args.push('--model', normalizedModel)
  if (whatsapp) args.push('--whatsapp', whatsapp)
  // --port is not supported by openclaw agents add command
  // Profile support removed - not currently used

  send('start', `Creating agent: ${validatedName}`)

  // Helper: save creation metadata to IDENTITY.md
  function saveCreationMetadata() {
    try {
      const identityPath = path.join(getAgentsDir(), validatedName, 'IDENTITY.md')
      let identityContent = fs.readFileSync(identityPath, 'utf-8')

      if (identityContent.includes('## Creation Metadata')) {
        send('log', 'Creation Metadata already exists in IDENTITY.md, skipping\n')
      } else {
        const metadata = `

## Creation Metadata

- **Created:** ${new Date().toISOString()}
- **Created By:** ClawMax Dashboard
- **Model:** ${model || 'default'}
- **Tags:** ${tags && tags.length > 0 ? tags.join(', ') : 'N/A'}
- **Cloned From:** ${cloneFrom || 'N/A'}
- **AI Description:** ${aiDescription || 'N/A'}
`
        identityContent += metadata
        fs.writeFileSync(identityPath, identityContent)
        send('log', 'Saved creation metadata to IDENTITY.md\n')
      }
    } catch (err: any) {
      send('log', `Warning: Could not save metadata: ${err.message}\n`)
    }
  }

  // Check if openclaw CLI is available
  let hasOpenclawCli = false
  try {
    require('child_process').execSync('which openclaw', { stdio: 'pipe' })
    hasOpenclawCli = true
  } catch {}

  if (!hasOpenclawCli) {
    // Register agent without CLI — just ensure directory structure exists
    send('log', `Registering agent without openclaw CLI...\n`)

    try {
      // Ensure agent dir exists in ~/.openclaw/agents/<name>/agent/
      fs.mkdirSync(agentDirArg, { recursive: true })

      // Create a minimal config.yaml for the agent
      const configPath = path.join(agentDirArg, '..', 'config.yaml')
      if (!fs.existsSync(configPath)) {
        const configContent = [
          `name: ${validatedName}`,
          `model: ${normalizedModel || 'anthropic/claude-sonnet-4-20250514'}`,
          `workspace: ${workspaceArg}`,
          `created: ${new Date().toISOString()}`,
        ].join('\n')
        fs.writeFileSync(configPath, configContent, 'utf-8')
        send('log', `Wrote agent config: ${configPath}\n`)
      }

      send('log', `Agent ${validatedName} registered successfully (without openclaw CLI)\n`)
      send('log', `ℹ️  Install openclaw CLI for full agent management: brew tap maximilien-ai/openclaw && brew install openclaw\n`)
    } catch (err: any) {
      send('error', `Failed to register agent: ${err.message}`)
      res.end()
      return
    }

    send('log', `Agent ${validatedName} created successfully\n`)
    saveCreationMetadata()
    send('done', 'ok')
    res.end()
    return
  }

  // openclaw CLI available — use it
  send('log', `Command: openclaw ${args.join(' ')}\n`)

  const child = spawn('openclaw', args, {
    cwd: getWorkspacePath(),
    env: safeEnv({ TERM: 'dumb' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Send SSE comment pings every 2s to keep the proxy connection alive during long runs
  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)

  const cleanup = () => clearInterval(keepalive)

  child.stdout!.on('data', (chunk: Buffer) => send('log', chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => send('log', chunk.toString()))

  child.on('close', (code, signal) => {
    cleanup()
    if (code === 0) {
      send('log', `Agent ${validatedName} created successfully\n`)
      saveCreationMetadata()
      send('done', 'ok')
    } else {
      send('done', signal ? `killed by signal ${signal}` : `exit code ${code}`)
    }
    res.end()
  })

  child.on('error', (err) => {
    cleanup()
    send('error', err.message)
    res.end()
  })

  // Don't kill setup.sh if the browser/proxy drops — let it always run to completion
  req.on('close', () => { cleanup() })
})

// POST /api/agents/doctor — comprehensive agent health check and repair
router.post('/doctor', async (req, res) => {
  const { fix = false, probe = false } = req.body || {}
  const results: Array<{ id: string; checks: Array<{ check: string; status: 'pass' | 'fail' | 'fixed' | 'warn'; message: string }> }> = []

  // Check if openclaw CLI is available
  let hasOpenclawCli = false
  try {
    require('child_process').execSync('which openclaw', { stdio: 'pipe' })
    hasOpenclawCli = true
  } catch {}

  const gatewayStatus = isGatewayRunning()
  const gatewayRunning = gatewayStatus.running

  // Read registered agents from openclaw.json
  const registeredIds = new Set<string>()
  const agentConfigs = new Map<string, any>()
  try {
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list || []
    for (const agent of agentList) {
      if (agent.id) {
        registeredIds.add(agent.id)
        agentConfigs.set(agent.id, agent)
      }
    }
  } catch {}

  // Scan workspace agents directory
  const agentsDir = getAgentsDir()
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    res.json({ results, platform: { cli: hasOpenclawCli, gateway: gatewayRunning }, message: 'No agents directory found' })
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'archive') continue

    const agentId = entry.name
    const agentDir = path.join(agentsDir, agentId)
    const checks: Array<{ check: string; status: 'pass' | 'fail' | 'fixed' | 'warn'; message: string }> = []

    // Check 1: IDENTITY.md exists
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      checks.push({ check: 'identity', status: 'pass', message: 'IDENTITY.md exists' })
    } else {
      checks.push({ check: 'identity', status: 'fail', message: 'IDENTITY.md missing' })
    }

    // Check 2: Registered with CLI
    if (registeredIds.has(agentId)) {
      checks.push({ check: 'registered', status: 'pass', message: 'Registered in openclaw.json' })
    } else if (fix && hasOpenclawCli) {
      const workspaceArg = path.join(getWorkspacePath(), 'AGENTS', agentId)
      const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
      try {
        fs.mkdirSync(agentDirArg, { recursive: true })
        const { execSync } = require('child_process')
        execSync(
          `openclaw agents add ${agentId} --workspace "${workspaceArg}" --agent-dir "${agentDirArg}" --non-interactive`,
          { encoding: 'utf-8', stdio: 'pipe', timeout: 15000, env: safeEnv() }
        )
        checks.push({ check: 'registered', status: 'fixed', message: 'Registered with openclaw CLI' })
      } catch (err: any) {
        checks.push({ check: 'registered', status: 'fail', message: `Registration failed: ${err.message?.split('\n')[0]}` })
      }
    } else {
      checks.push({ check: 'registered', status: 'fail', message: 'Not registered in openclaw.json' + (hasOpenclawCli ? ' — run doctor with fix=true' : ' — install openclaw CLI first') })
    }

    // Check 3: Agent directory in ~/.openclaw/agents/
    const homeAgentDir = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId)
    if (fs.existsSync(homeAgentDir)) {
      checks.push({ check: 'agent-dir', status: 'pass', message: 'Agent directory exists' })
    } else {
      checks.push({ check: 'agent-dir', status: 'warn', message: 'No ~/.openclaw/agents/' + agentId + ' directory' })
    }

    // Check 4: Sessions directory
    const sessionsDir = path.join(homeAgentDir, 'sessions')
    if (fs.existsSync(sessionsDir)) {
      checks.push({ check: 'sessions', status: 'pass', message: 'Sessions directory exists' })
    } else {
      if (fix) {
        try { fs.mkdirSync(sessionsDir, { recursive: true }); checks.push({ check: 'sessions', status: 'fixed', message: 'Created sessions directory' }) }
        catch { checks.push({ check: 'sessions', status: 'warn', message: 'Sessions directory missing' }) }
      } else {
        checks.push({ check: 'sessions', status: 'warn', message: 'Sessions directory missing' })
      }
    }

    // Check 5: Skills assigned
    try {
      const identity = fs.readFileSync(identityPath, 'utf-8')
      const skillsMatch = identity.match(/skills?[:\s]+([^\n]+)/i)
      if (skillsMatch) {
        checks.push({ check: 'skills', status: 'pass', message: `Skills: ${skillsMatch[1].trim().slice(0, 80)}` })
      } else {
        checks.push({ check: 'skills', status: 'warn', message: 'No skills configured' })
      }
    } catch {
      checks.push({ check: 'skills', status: 'warn', message: 'Cannot read skills from IDENTITY.md' })
    }

    // Check 6: Health probe (optional — sends a test message)
    if (probe && hasOpenclawCli && registeredIds.has(agentId)) {
      try {
        const { execSync } = require('child_process')
        const result = execSync(
          `openclaw agent --agent ${agentId} --message "health check — respond with OK" --json --local`,
          { encoding: 'utf-8', stdio: 'pipe', timeout: 30000, env: safeEnv() }
        )
        // Check if we got a response (in stdout or stderr-extracted)
        if (result.includes('"payloads"') || result.includes('"text"')) {
          checks.push({ check: 'probe', status: 'pass', message: 'Agent responded to health probe' })
        } else {
          checks.push({ check: 'probe', status: 'warn', message: 'Agent returned empty response' })
        }
      } catch (err: any) {
        checks.push({ check: 'probe', status: 'fail', message: `Health probe failed: ${err.message?.split('\n')[0]?.slice(0, 100)}` })
      }
    }

    results.push({ id: agentId, checks })
  }

  // Summary
  const allChecks = results.flatMap(r => r.checks)
  const pass = allChecks.filter(c => c.status === 'pass').length
  const fail = allChecks.filter(c => c.status === 'fail').length
  const warn = allChecks.filter(c => c.status === 'warn').length
  const fixed = allChecks.filter(c => c.status === 'fixed').length

  res.json({
    results,
    platform: {
      cli: hasOpenclawCli,
      gateway: gatewayRunning,
      gatewayPort: gatewayStatus.port ?? getConfiguredGatewayPort(),
    },
    summary: { total: allChecks.length, pass, fail, warn, fixed },
    healthy: fail === 0,
  })
})

// POST /api/agents/bulk-impact — get impact summary for bulk delete
router.post('/bulk-impact', (req, res) => {
  const { agents: agentsToDelete } = req.body as { agents?: Array<{ id: string; archived?: boolean }> }

  if (!agentsToDelete || !Array.isArray(agentsToDelete) || agentsToDelete.length === 0) {
    return res.status(400).json({ error: 'agents array is required' })
  }

  // Validate all agent IDs
  for (const agent of agentsToDelete) {
    if (!/^[a-z][a-z0-9_-]*$/.test(agent.id)) {
      return res.status(400).json({ error: `Invalid agent id: ${agent.id}` })
    }
  }

  const allAgents = listAgents()
  const impacts: Record<string, any> = {}
  const notFound: string[] = []

  for (const agentToDelete of agentsToDelete) {
    const agent = allAgents.find(a => a.id === agentToDelete.id && a.archived === (agentToDelete.archived || false))
    if (!agent) {
      notFound.push(agentToDelete.id)
      continue
    }
    impacts[agentToDelete.id] = getAgentImpact(agentToDelete.id, agent.workspacePath)
  }

  // Calculate totals
  let totalCommunities = 0
  let totalGroups = 0
  let totalTodos = 0
  const allCommunities = new Set<string>()
  const allGroups = new Set<string>()

  for (const impact of Object.values(impacts)) {
    totalTodos += impact.todoCount || 0
    totalCommunities += impact.communityCount || 0
    totalGroups += impact.groupCount || 0
  }

  res.json({
    impacts,
    notFound,
    summary: {
      agentCount: agentsToDelete.length - notFound.length,
      totalCommunities,
      totalGroups,
      totalTodos
    }
  })
})

// DELETE /api/agents/bulk — bulk delete multiple agents
router.delete('/bulk', (req, res) => {
  const { agents: agentsToDelete, removeStateDir } = req.body as { agents?: Array<{ id: string; archived?: boolean }>; removeStateDir?: boolean }

  if (!agentsToDelete || !Array.isArray(agentsToDelete) || agentsToDelete.length === 0) {
    return res.status(400).json({ error: 'agents array is required' })
  }

  // Validate all agent IDs
  for (const agent of agentsToDelete) {
    if (!/^[a-z][a-z0-9_-]*$/.test(agent.id)) {
      return res.status(400).json({ error: `Invalid agent id: ${agent.id}` })
    }
  }

  const results: Record<string, { ok: boolean; steps: string[]; errors: string[] }> = {}
  let successCount = 0
  let failureCount = 0

  for (const agent of agentsToDelete) {
    const result = deleteAgent(agent.id, removeStateDir === true, agent.archived || false)
    results[agent.id] = { ok: result.errors.length === 0, ...result }

    if (result.errors.length === 0) {
      successCount++
    } else {
      failureCount++
    }
  }

  res.json({
    ok: failureCount === 0,
    results,
    summary: {
      total: agentsToDelete.length,
      success: successCount,
      failure: failureCount
    }
  })
})

// DELETE /api/agents/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params
  const { removeStateDir } = req.body as { removeStateDir?: boolean }
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    res.status(400).json({ ok: false, error: 'Invalid agent id' })
    return
  }
  const result = deleteAgent(id, removeStateDir === true)
  res.json({ ok: result.errors.length === 0, ...result })
})

// GET /api/agents/:id/impact — impact summary for delete confirmation
router.get('/:id/impact', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const impact = getAgentImpact(id, agent.workspacePath)
  res.json(impact)
})


// GET /api/agents/usage — get token usage for all agents
router.get('/usage', async (req, res) => {
  const days = parseInt(req.query.days as string) || 30

  try {
    const gateway = getGatewayClient()

    // Call sessions.usage with days param
    const result = await gateway.call('sessions.usage', { days })

    // Extract agent usage from aggregates
    const agentUsage: Record<string, any> = {}
    if (result.aggregates?.byAgent) {
      for (const entry of result.aggregates.byAgent) {
        agentUsage[entry.agentId] = {
          totalTokens: entry.totals.totalTokens || 0,
          inputTokens: entry.totals.input || 0,
          outputTokens: entry.totals.output || 0,
          cacheReadTokens: entry.totals.cacheRead || 0,
          cacheWriteTokens: entry.totals.cacheWrite || 0,
          totalCost: entry.totals.totalCost || 0,
        }
      }
    }

    res.json({ agentUsage, days })
  } catch (err: any) {
    // Suppress expected errors: no gateway config, missing admin scope
    if (!err.message?.includes('missing scope: operator.admin') && !err.message?.includes('Gateway not available')) {
      console.error('Failed to fetch agent usage:', err.message)
    }

    // Return empty usage data instead of error to prevent UI breakage
    // Gateway might not be available or usage data might not exist yet
    res.json({
      agentUsage: {},
      days,
      error: 'Gateway unavailable or no usage data',
      details: err.message
    })
  }
})

// GET /api/agents/cost-limits — get all per-agent cost limits (before /:id to avoid route conflict)
router.get('/cost-limits', (_req, res) => {
  res.json({ limits: getAllAgentCostLimits() })
})

// GET /api/agents/:id — single agent
router.get('/:id', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

// GET /api/agents/:id/identity — fetch IDENTITY.md with parsed metadata
router.get('/:id/identity', (req, res) => {
  const { id } = req.params
  const identityPath = path.join(getAgentsDir(), id, 'IDENTITY.md')

  if (!fs.existsSync(identityPath)) {
    return res.status(404).json({ error: 'IDENTITY.md not found' })
  }

  const content = fs.readFileSync(identityPath, 'utf-8')

  // Parse creation metadata if it exists
  const metadata: any = {}
  const metadataMatch = content.match(/## Creation Metadata\s+([\s\S]*?)(?=\n##|\n---|$)/i)
  if (metadataMatch) {
    const metadataSection = metadataMatch[1]

    // Parse each metadata field
    const createdMatch = metadataSection.match(/\*\*Created:\*\*\s+(.+)/i)
    const modelMatch = metadataSection.match(/\*\*Model:\*\*\s+(.+)/i)
    const tagsMatch = metadataSection.match(/\*\*Tags:\*\*\s+(.+)/i)
    const clonedFromMatch = metadataSection.match(/\*\*Cloned From:\*\*\s+(.+)/i)
    const aiDescriptionMatch = metadataSection.match(/\*\*AI Description:\*\*\s+(.+)/i)

    if (createdMatch) metadata.created = createdMatch[1].trim()
    if (modelMatch) metadata.model = modelMatch[1].trim()
    if (tagsMatch) {
      const tagsStr = tagsMatch[1].trim()
      metadata.tags = tagsStr !== 'N/A' ? tagsStr.split(',').map(t => t.trim()) : []
    }
    if (clonedFromMatch) {
      const clonedFrom = clonedFromMatch[1].trim()
      metadata.clonedFrom = clonedFrom !== 'N/A' ? clonedFrom : null
    }
    if (aiDescriptionMatch) {
      const aiDesc = aiDescriptionMatch[1].trim()
      metadata.aiDescription = aiDesc !== 'N/A' ? aiDesc : null
    }
  }

  // Get live configuration from openclaw.json (authoritative source)
  let liveConfig: any = {}
  try {
    const HOME = process.env.HOME || ''
    const configPath = path.join(HOME, '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list || []
    const liveAgent = agentList.find((a: any) => a.id === id)
    if (liveAgent) {
      liveConfig = {
        model: liveAgent.model || metadata.model,
        workspace: liveAgent.workspace,
        agentDir: liveAgent.agentDir
      }
      // Override metadata.model with live model for clone pre-fill
      if (liveAgent.model) {
        metadata.model = liveAgent.model
      }
    }
  } catch (err) {
    // If we can't read live config, fall back to IDENTITY.md metadata
  }

  res.json({ content, metadata, liveConfig })
})

// POST /api/agents/:id/restart — restart agent gateway process
router.post('/:id/restart', async (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid agent id' })
  }

  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  try {
    // Get agent's gateway config to find the process
    const gatewayConfig = getAgentGatewayConfig(id)
    if (!gatewayConfig) {
      return res.status(404).json({ ok: false, error: 'Gateway config not found' })
    }

    const port = validatePort(gatewayConfig.port || 18889)

    // Kill existing process on this port
    const { execSync } = require('child_process')
    try {
      // Find and kill process on port (port validated as numeric above)
      const pid = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' }).trim()
      if (pid && /^\d+(\n\d+)*$/.test(pid)) {
        execSync(`kill -9 ${pid}`)
      }
    } catch (err) {
      // Process might not be running, that's okay
    }

    // Small delay to ensure port is freed
    await new Promise(resolve => setTimeout(resolve, 500))

    // Start new gateway process
    const HOME = process.env.HOME || ''
    const profileStateDir = path.join(HOME, `.openclaw-${id}`)
    const isProfile = fs.existsSync(profileStateDir)
    const stateDir = isProfile ? profileStateDir : path.join(HOME, '.openclaw')

    const gatewayPath = path.join(stateDir, 'openclaw.json')

    // Start gateway in background using openclaw CLI
    const profileFlag = isProfile ? ['--profile', id] : []
    const child = spawn('openclaw', [...profileFlag, 'gateway', 'install'], {
      cwd: agent.workspacePath,
      env: safeEnv({ OPENCLAW_STATE_DIR: stateDir }),
      detached: true,
      stdio: 'ignore',
    })

    child.unref()

    res.json({ ok: true, message: `Agent ${id} restarted successfully`, port })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/agents/:id/activity — file activity + key docs for the detail panel
router.get('/:id/activity', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const activity = getAgentActivity(agent.workspacePath, agent.id)
  res.json(activity)
})

// DELETE /api/agents/:id/whatsapp — unlink: delete credentials dir + clear WA line from IDENTITY.md
router.delete('/:id/whatsapp', (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    res.status(400).json({ ok: false, error: 'Invalid agent id' })
    return
  }

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)
  const stateDir = isProfile ? profileStateDir : path.join(HOME, '.openclaw')
  const credsDir = path.join(stateDir, 'credentials', 'whatsapp', 'default')

  const steps: string[] = []
  const errors: string[] = []

  // Remove credentials directory
  try {
    if (fs.existsSync(credsDir)) {
      fs.rmSync(credsDir, { recursive: true, force: true })
      steps.push(`Removed credentials: ${credsDir}`)
    } else {
      steps.push('No credentials directory found')
    }
  } catch (e) {
    errors.push(`Failed to remove credentials: ${e}`)
  }

  // Remove WhatsApp line from IDENTITY.md
  const identityPath = path.join(getAgentsDir(), id, 'IDENTITY.md')
  try {
    if (fs.existsSync(identityPath)) {
      let content = fs.readFileSync(identityPath, 'utf-8')
      const before = content
      content = content.replace(/^[^\n]*WhatsApp[^\n]*\n?/gim, '')
      if (content !== before) {
        fs.writeFileSync(identityPath, content, 'utf-8')
        steps.push('Removed WhatsApp line from IDENTITY.md')
      }
    }
  } catch (e) {
    errors.push(`Failed to update IDENTITY.md: ${e}`)
  }

  res.json({ ok: errors.length === 0, steps, errors })
})

// POST /api/agents/:id/whatsapp/pair — run whatsapp-pair.mjs and stream output via SSE
router.post('/:id/whatsapp/pair', (req, res) => {
  const { id } = req.params
  const { phone } = req.body as { phone?: string }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    res.status(400).json({ error: 'Invalid agent id' })
    return
  }
  if (!phone || !/^\d{7,15}$/.test(phone)) {
    res.status(400).json({ error: 'Invalid phone number (digits only, 7-15 chars)' })
    return
  }

  // Detect Baileys/Boom
  const { baileys, boom } = detectWaPaths()
  if (!baileys || !boom) {
    res.status(500).json({ error: 'Could not find Baileys/Boom libraries. Is openclaw installed?' })
    return
  }

  // Determine credentials dir: profile mode (~/.openclaw-<id>) vs default (~/.openclaw)
  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)
  const stateDir = isProfile ? profileStateDir : path.join(HOME, '.openclaw')
  const credsDir = path.join(stateDir, 'credentials', 'whatsapp', 'default')

  const scriptPath = path.join(getWorkspacePath(), 'SYSTEM', 'scripts', 'instances', 'lib', 'whatsapp-pair.mjs')

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (type: string, data: string) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
  }

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)
  const cleanup = () => clearInterval(keepalive)

  send('log', `Pairing WhatsApp +${phone} for agent ${id}\n`)
  send('log', `Credentials dir: ${credsDir}\n`)

  const child = spawn('node', [scriptPath, phone, credsDir, baileys, boom], {
    cwd: getWorkspacePath(),
    env: safeEnv({ TERM: 'dumb' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let linkedWritten = false
  const handleChunk = (chunk: Buffer) => {
    const text = chunk.toString()
    send('log', text)
    // Detect pairing code: "PAIRING CODE: XXXX-XXXX" or "PAIRING CODE: XXXXXXXX"
    const codeMatch = text.match(/PAIRING CODE[:\s]+([A-Z0-9]{4}[-–]?[A-Z0-9]{4})/i)
    if (codeMatch) {
      send('code', codeMatch[1].replace(/[-–]/, '-').toUpperCase())
    }
    if (/linked!/i.test(text) || /✅/.test(text)) {
      send('linked', 'ok')
      // Write phone number to IDENTITY.md so the dashboard can display it
      if (!linkedWritten) {
        linkedWritten = true
        const identityPath = path.join(getAgentsDir(), id, 'IDENTITY.md')
        try {
          if (fs.existsSync(identityPath)) {
            let content = fs.readFileSync(identityPath, 'utf-8')
            content = content.replace(/^[^\n]*WhatsApp[^\n]*\n?/gim, '')
            content = content.trimEnd() + `\n- **WhatsApp:** +${phone}\n`
            fs.writeFileSync(identityPath, content, 'utf-8')
          }
        } catch {}
      }
    }
  }

  child.stdout!.on('data', handleChunk)
  child.stderr!.on('data', handleChunk)

  child.on('close', (code, signal) => {
    cleanup()
    if (code === 0) {
      send('done', 'ok')
    } else {
      send('done', signal ? `killed by signal ${signal}` : `exit code ${code}`)
    }
    res.end()
  })

  child.on('error', (err) => {
    cleanup()
    send('error', err.message)
    res.end()
  })

  req.on('close', () => { cleanup() })
})

/** Call a single RPC method on the openclaw gateway via the openclaw CLI */
function callGatewayRpc(_port: number, _token: string, method: string, params: unknown = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ['gateway', 'call', method, '--json']
    if (params && Object.keys(params as object).length > 0) {
      args.push('--params', JSON.stringify(params))
    }
    const proc = spawn('openclaw', args, { env: safeEnv() })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { proc.kill(); reject(new Error('gateway timeout')) }, 10000)
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code: number) => {
      clearTimeout(timer)
      if (code !== 0) { reject(new Error(`openclaw gateway call failed (${code}): ${stderr}`)); return }
      try { resolve(JSON.parse(stdout)) }
      catch { reject(new Error(`invalid JSON from openclaw: ${stdout}`)) }
    })
    proc.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
  })
}

// GET /api/agents/:id/wa-groups — fetch live WA groups from the running gateway
router.get('/:id/wa-groups', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const cfg = getAgentGatewayConfig(id)
  if (!cfg) {
    return res.status(503).json({ error: 'No gateway config found for agent' })
  }

  try {
    const result = await callGatewayRpc(cfg.port, cfg.token, 'groups.fetchAll', {}) as {
      ts?: number
      groups?: Array<{ id: string; subject: string; isParent?: boolean }>
    }

    const allGroups = result?.groups ?? []

    // Baileys marks community parent groups with isParent:true — use that as primary signal.
    // Fall back to GROUPS.md cross-reference for groups without the flag.
    const groupsPath = path.join(getAgentsDir(), id, 'GROUPS.md')
    let communityNames = new Set<string>()
    let communityDescriptions = new Map<string, string | null>()
    let groupDescriptions = new Map<string, string | null>()
    try {
      const groupsContent = fs.readFileSync(groupsPath, 'utf-8')
      const parsed = parseGroups(groupsContent)
      communityNames = new Set(parsed.communities.map(c => c.name.toLowerCase()))
      // Build description lookup maps (case-insensitive)
      for (const c of parsed.communities) {
        communityDescriptions.set(c.name.toLowerCase(), c.description)
      }
      for (const g of parsed.groups) {
        groupDescriptions.set(g.name.toLowerCase(), g.description)
      }
    } catch {
      // GROUPS.md may not exist yet — use only isParent flag
    }

    const waCommunities = allGroups
      .filter(g => g.isParent || communityNames.has(g.subject.toLowerCase()))
      .map(g => ({
        name: g.subject,
        key: g.id,
        description: communityDescriptions.get(g.subject.toLowerCase()) ?? null
      }))

    const communityNameSet = new Set(waCommunities.map(c => c.name.toLowerCase()))
    const waGroups = allGroups
      .filter(g => !g.isParent && !communityNameSet.has(g.subject.toLowerCase()))
      .map(g => ({
        name: g.subject,
        key: g.id,
        description: groupDescriptions.get(g.subject.toLowerCase()) ?? null
      }))

    // Deduplicate by name (case-insensitive) - keep first occurrence
    const dedupe = <T extends { name: string }>(arr: T[]): T[] => {
      const seen = new Map<string, T>()
      for (const item of arr) {
        const key = item.name.toLowerCase()
        if (!seen.has(key)) seen.set(key, item)
      }
      return Array.from(seen.values())
    }

    const dedupedCommunities = dedupe(waCommunities)
    const dedupedGroups = dedupe(waGroups)

    res.json({ groups: dedupedGroups, communities: dedupedCommunities })
  } catch (err) {
    res.status(503).json({ error: String(err) })
  }
})

// POST /api/agents/:id/groups/sync — write merged groups back to GROUPS.md
router.post('/:id/groups/sync', (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid agent id' })
  }

  const { communities, groups } = req.body as {
    communities?: Array<{ name: string; description: string | null }>
    groups?: Array<{ name: string; description: string | null }>
  }

  if (!Array.isArray(groups)) {
    return res.status(400).json({ ok: false, error: 'groups must be an array' })
  }

  const groupsPath = path.join(getAgentsDir(), id, 'GROUPS.md')

  const commLines = (communities ?? []).map(c => `- ${c.name}${c.description ? ': ' + c.description : ''}`)
  const groupLines = groups.map(g => `- ${g.name}${g.description ? ': ' + g.description : ''}`)

  const content = [
    '# GROUPS.md - WhatsApp Presence',
    '',
    '## Communities',
    ...commLines,
    '',
    '## Groups',
    ...groupLines,
    '',
  ].join('\n')

  try {
    fs.writeFileSync(groupsPath, content, 'utf-8')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/agents/:id/chat/messages — send a message to the agent via dashboard chat
router.post('/:id/chat/messages', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const { message } = req.body as { message?: string }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  const paused = getPausedAgents()
  if (paused.has(id)) {
    return res.status(423).json({ error: 'Agent is paused — resume it before sending messages' })
  }

  const sessionKey = `agent:${id}:dashboard-chat`

  try {
    // Check if we have an existing session mapping
    const HOME = process.env.HOME || ''
    const sessionsPath = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'sessions.json')
    let actualSessionId: string | null = null

    if (fs.existsSync(sessionsPath)) {
      try {
        const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
        // Try direct lookup first
        if (sessions[sessionKey]?.sessionId) {
          actualSessionId = sessions[sessionKey].sessionId
        } else {
          // Search for entry where sessionId equals our key
          for (const [key, entry] of Object.entries(sessions)) {
            if (typeof entry === 'object' && entry !== null && (entry as any).sessionId === sessionKey) {
              actualSessionId = sessionKey
              break
            }
          }
        }
      } catch (e) {
        console.error('Failed to read sessions.json:', e)
      }
    }

    // Use the actual UUID session ID if found, otherwise use the key (will create new session)
    const sessionId = actualSessionId || sessionKey

    // Run the agent turn with the message
    const useLocal = !isGatewayConfigured()
    const args = ['agent', '--agent', id, '--session-id', sessionId, '--message', message, '--json', ...(useLocal ? ['--local'] : [])]
    const proc = spawn('openclaw', args, { env: safeEnv() })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { proc.kill(); }, 600000) // 10 min timeout

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code: number) => {
      clearTimeout(timer)
      if (code !== 0) {
        return res.status(500).json({ error: `Agent command failed: ${stderr}` })
      }

      try {
        const result = JSON.parse(stdout)
        // Extract the response text and sessionId from the payloads
        const responseText = result?.result?.payloads?.[0]?.text || 'No response from agent'
        const actualSessionId = result?.result?.meta?.agentMeta?.sessionId

        // If we got a sessionId, save it to sessions.json for future retrieval
        if (actualSessionId) {
          try {
            let sessions: Record<string, any> = {}
            if (fs.existsSync(sessionsPath)) {
              sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
            }
            // Save using sessionKey as the key, with actualSessionId as the value
            sessions[sessionKey] = { sessionId: actualSessionId, updatedAt: Date.now() }
            fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2))
          } catch (e) {
            console.error('Failed to update sessions.json:', e)
          }
        }

        res.json({ ok: true, result: { response: responseText } })
      } catch {
        res.status(500).json({ error: `Invalid JSON from agent: ${stdout}` })
      }
    })

    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      res.status(500).json({ error: String(err) })
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post('/pause', (req, res) => {
  const { agentIds } = req.body as { agentIds?: string[] }
  if (!Array.isArray(agentIds) || agentIds.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'agentIds must be an array of strings' })
  }
  const paused = pauseAgents(agentIds)
  res.json({ paused: Array.from(paused) })
})

router.post('/resume', (req, res) => {
  const { agentIds } = req.body as { agentIds?: string[] }
  if (!Array.isArray(agentIds) || agentIds.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'agentIds must be an array of strings' })
  }
  const paused = resumeAgents(agentIds)
  res.json({ paused: Array.from(paused) })
})

// POST /api/agents/bulk-model — change model for multiple agents
router.post('/bulk-model', async (req, res) => {
  const { agentIds, model } = req.body as { agentIds?: string[]; model?: string }
  if (!Array.isArray(agentIds) || !model || typeof model !== 'string') {
    return res.status(400).json({ error: 'agentIds (array) and model (string) are required' })
  }

  const results: { id: string; ok: boolean; error?: string }[] = []
  for (const agentId of agentIds) {
    try {
      const configUpdate = updateAgentModelInConfig(agentId, model)
      if (!configUpdate.ok) {
        results.push({ id: agentId, ok: false, error: configUpdate.error || 'Failed to update live model config' })
        continue
      }

      // Update IDENTITY.md
      const agentDir = path.join(getWorkspacePath(), 'AGENTS', agentId)
      const identityPath = path.join(agentDir, 'IDENTITY.md')
      if (fs.existsSync(identityPath)) {
        updateAgentIdentityModel(identityPath, model)
      }

      results.push({ id: agentId, ok: true })
    } catch (err: any) {
      results.push({ id: agentId, ok: false, error: err.message })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  res.json({ ok: succeeded === agentIds.length, updated: succeeded, total: agentIds.length, results })
})

// GET /api/agents/:id/cost-limit — get cost limit for a specific agent
router.get('/:id/cost-limit', (req, res) => {
  const limit = getAgentCostLimit(req.params.id)
  res.json({ agentId: req.params.id, limitUsd: limit })
})

// PUT /api/agents/:id/cost-limit — set cost limit for a specific agent
router.put('/:id/cost-limit', (req, res) => {
  const { limitUsd } = req.body
  if (limitUsd !== null && (typeof limitUsd !== 'number' || limitUsd < 0)) {
    return res.status(400).json({ error: 'limitUsd must be a positive number or null to remove' })
  }
  const validationError = validateAgentCostLimit(limitUsd ?? null)
  if (validationError) {
    return res.status(400).json({ error: validationError })
  }
  setAgentCostLimit(req.params.id, limitUsd)
  res.json({ ok: true, agentId: req.params.id, limitUsd: limitUsd || null })
})

// PATCH /api/agents/:id/tags — update agent tags in IDENTITY.md
router.patch('/:id/tags', (req, res) => {
  const { id } = req.params
  const { tags } = req.body

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'Tags must be an array' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  const identityPath = path.join(agentDir, 'IDENTITY.md')

  try {
    // Read current IDENTITY.md
    const content = fs.readFileSync(identityPath, 'utf-8')

    // Update tags line
    const tagsLine = tags.length > 0 ? tags.join(', ') : 'untagged'
    const updatedContent = content.replace(
      /^-\s+\*\*Tags:\*\*\s+.+$/m,
      `- **Tags:** ${tagsLine}`
    )

    // Write back
    fs.writeFileSync(identityPath, updatedContent, 'utf-8')

    res.json({ ok: true, tags })
  } catch (err) {
    console.error('Failed to update tags:', err)
    res.status(500).json({ error: 'Failed to update tags' })
  }
})

// GET /api/agents/:id/config — get editable agent config files
router.get('/:id/config', (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  if (!fs.existsSync(agentDir)) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  const readFile = (name: string) => {
    const p = path.join(agentDir, name)
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
  }

  res.json({
    identity: readFile('IDENTITY.md'),
    soul: readFile('SOUL.md'),
    tools: readFile('TOOLS.md')
  })
})

// POST /api/agents/validate-config — validate editable config sections before save
router.post('/validate-config', (req, res) => {
  const { identity, soul, tools, expectedId } = req.body as {
    identity?: string
    soul?: string
    tools?: string
    expectedId?: string
  }

  if (expectedId && !/^[a-z][a-z0-9_-]*$/.test(expectedId)) {
    return res.status(400).json({ error: 'Invalid expected agent id' })
  }

  const result = validateAgentConfigSections({ identity, soul, tools }, expectedId)
  res.json(result)
})

// PUT /api/agents/:id/config — update agent config files
router.put('/:id/config', (req, res) => {
  const { id } = req.params
  const { identity, soul, tools } = req.body

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  if (!fs.existsSync(agentDir)) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  const validation = validateAgentConfigSections({ identity, soul, tools }, id)
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors,
      warnings: validation.warnings,
    })
  }

  try {
    if (typeof identity === 'string') {
      fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), identity, 'utf-8')
    }
    if (typeof soul === 'string') {
      fs.writeFileSync(path.join(agentDir, 'SOUL.md'), soul, 'utf-8')
    }
    if (typeof tools === 'string') {
      fs.writeFileSync(path.join(agentDir, 'TOOLS.md'), tools, 'utf-8')
    }
    res.json({ ok: true, warnings: validation.warnings })
  } catch (err) {
    console.error('Failed to update agent config:', err)
    res.status(500).json({ error: 'Failed to update agent config' })
  }
})

// PATCH /api/agents/:id/model — update agent model in IDENTITY.md
router.patch('/:id/model', (req, res) => {
  const { id } = req.params
  const { model } = req.body

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'model is required' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  const identityPath = path.join(agentDir, 'IDENTITY.md')

  try {
    const configUpdate = updateAgentModelInConfig(id, model)
    if (!configUpdate.ok) {
      return res.status(500).json({ error: configUpdate.error || 'Failed to update live model config' })
    }

    updateAgentIdentityModel(identityPath, model)
    res.json({ ok: true, model })
  } catch (err) {
    console.error('Failed to update model:', err)
    res.status(500).json({ error: 'Failed to update model' })
  }
})

// PATCH /api/agents/:id/rename — rename agent and update all references
router.patch('/:id/rename', (req, res) => {
  const { id } = req.params
  const { newId } = req.body

  // Validate old ID
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  // Validate new ID
  if (!newId || typeof newId !== 'string') {
    return res.status(400).json({ error: 'newId is required' })
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(newId)) {
    return res.status(400).json({ error: 'Invalid new ID format (must start with lowercase letter, contain only lowercase letters, numbers, dashes, and underscores)' })
  }
  if (newId === id) {
    return res.status(400).json({ error: 'New ID must be different from current ID' })
  }

  const agentsDir = getAgentsDir()
  const oldPath = path.join(agentsDir, id)
  const newPath = path.join(agentsDir, newId)

  try {
    // Check old agent exists
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    // Check new ID doesn't conflict
    if (fs.existsSync(newPath)) {
      return res.status(409).json({ error: `Agent "${newId}" already exists` })
    }

    // Rename directory
    fs.renameSync(oldPath, newPath)

    // Update references in COMMUNITIES.md
    try {
      const commPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
      if (fs.existsSync(commPath)) {
        let content = fs.readFileSync(commPath, 'utf-8')
        // Replace in members lists (comma-separated)
        content = content.replace(
          new RegExp(`\\b${id}\\b`, 'g'),
          newId
        )
        fs.writeFileSync(commPath, content, 'utf-8')
      }
    } catch (err) {
      console.error('Failed to update COMMUNITIES.md:', err)
    }

    // Update references in GROUPS.md
    try {
      const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
      if (fs.existsSync(groupsPath)) {
        let content = fs.readFileSync(groupsPath, 'utf-8')
        // Replace in members lists
        content = content.replace(
          new RegExp(`\\b${id}\\b`, 'g'),
          newId
        )
        fs.writeFileSync(groupsPath, content, 'utf-8')
      }
    } catch (err) {
      console.error('Failed to update GROUPS.md:', err)
    }

    res.json({ ok: true, oldId: id, newId })
  } catch (err) {
    console.error('Failed to rename agent:', err)
    // Try to rollback if directory was renamed
    try {
      if (fs.existsSync(newPath) && !fs.existsSync(oldPath)) {
        fs.renameSync(newPath, oldPath)
      }
    } catch {}
    res.status(500).json({ error: 'Failed to rename agent' })
  }
})

// GET /api/agents/:id/chat/messages — fetch dashboard chat history
router.get('/:id/chat/messages', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const sessionKey = `agent:${id}:dashboard-chat`
  const mainSessionKey = `agent:${id}:main`

  try {
    const HOME = process.env.HOME || ''
    const sessionsIndexPath = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'sessions.json')

    // Check if sessions index exists
    if (!fs.existsSync(sessionsIndexPath)) {
      return res.json({ messages: [] })
    }

    // Read sessions index
    const sessionsIndex = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'))

    // Find the session entry — try dashboard-chat first, fall back to main session
    let actualSessionId: string | null = null

    if (sessionsIndex[sessionKey]?.sessionId) {
      actualSessionId = sessionsIndex[sessionKey].sessionId
    } else if (sessionsIndex[mainSessionKey]?.sessionId) {
      // Fall back to main session (CLI creates sessions under main key)
      actualSessionId = sessionsIndex[mainSessionKey].sessionId
    } else {
      // Search through all entries
      for (const [key, entry] of Object.entries(sessionsIndex)) {
        if (typeof entry === 'object' && entry !== null) {
          const e = entry as any
          if (e.sessionId === sessionKey || key.includes(id)) {
            actualSessionId = e.sessionId
            break
          }
        }
      }
    }

    if (!actualSessionId) {
      return res.json({ messages: [] })
    }

    // Read the JSONL file for this session
    const jsonlPath = path.join(HOME, '.openclaw', 'agents', id, 'sessions', `${actualSessionId}.jsonl`)

    if (!fs.existsSync(jsonlPath)) {
      return res.json({ messages: [] })
    }

    // Parse JSONL and extract message entries
    const jsonlContent = fs.readFileSync(jsonlPath, 'utf-8')
    const lines = jsonlContent.trim().split('\n').filter(l => l.trim())
    const messages: any[] = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.type === 'message' && entry.message) {
          const msg = entry.message
          const contentArray = Array.isArray(msg.content) ? msg.content : [msg.content]
          const textContent = contentArray
            .map((c: any) => (typeof c === 'string' ? c : c.text || c.content || JSON.stringify(c)))
            .join('\n')

          messages.push({
            role: msg.role,
            content: textContent,
            timestamp: msg.timestamp || entry.timestamp || Date.now()
          })
        }
      } catch (e) {
        // Skip malformed lines
        continue
      }
    }

    res.json({ messages })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Clear agent chat messages (archives them first)
router.delete('/:id/chat/messages', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const sessionKey = `agent:${id}:dashboard-chat`
  const mainSessionKey = `agent:${id}:main`

  try {
    const HOME = process.env.HOME || ''
    const sessionsDir = path.join(HOME, '.openclaw', 'agents', id, 'sessions')
    const sessionsIndexPath = path.join(sessionsDir, 'sessions.json')

    if (!fs.existsSync(sessionsIndexPath)) {
      return res.json({ ok: true, archived: false })
    }

    const sessionsIndex = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'))
    let actualSessionId: string | null = null

    // Try dashboard-chat first, fall back to main session
    if (sessionsIndex[sessionKey]?.sessionId) {
      actualSessionId = sessionsIndex[sessionKey].sessionId
    } else if (sessionsIndex[mainSessionKey]?.sessionId) {
      actualSessionId = sessionsIndex[mainSessionKey].sessionId
    }

    if (!actualSessionId) {
      return res.json({ ok: true, archived: false })
    }

    const jsonlPath = path.join(sessionsDir, `${actualSessionId}.jsonl`)

    if (fs.existsSync(jsonlPath)) {
      // Archive the session file
      const archiveDir = path.join(sessionsDir, 'archive')
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true })
      }

      const timestamp = Date.now()
      const date = new Date(timestamp).toISOString().split('T')[0]
      const archiveFile = path.join(archiveDir, `${actualSessionId}_${date}_${timestamp}.jsonl`)

      fs.copyFileSync(jsonlPath, archiveFile)
      fs.unlinkSync(jsonlPath)

      // Remove session from index
      delete sessionsIndex[sessionKey]
      fs.writeFileSync(sessionsIndexPath, JSON.stringify(sessionsIndex, null, 2))

      return res.json({ ok: true, archived: true })
    }

    res.json({ ok: true, archived: false })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get archived chat sessions
router.get('/:id/chat/archives', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    const HOME = process.env.HOME || ''
    const archiveDir = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'archive')

    if (!fs.existsSync(archiveDir)) {
      return res.json({ archives: [] })
    }

    const fileInfos = fs.readdirSync(archiveDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(filename => {
        const fullPath = path.join(archiveDir, filename)
        const timestampMatch = filename.match(/_(\d+)\.jsonl$/)
        const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0

        // Count messages and parse for LLM title generation
        let messageCount = 0
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const lines = content.trim().split('\n').filter(l => l.trim())

          for (const line of lines) {
            try {
              const obj = JSON.parse(line)
              if (obj.type === 'message' && obj.message) {
                messageCount++

                const msg = obj.message
                let textContent = ''

                if (Array.isArray(msg.content)) {
                  textContent = msg.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join(' ')
                } else if (typeof msg.content === 'string') {
                  textContent = msg.content
                }

                if (textContent && msg.role) {
                  messages.push({ role: msg.role, content: textContent })
                }
              }
            } catch {
              continue
            }
          }
        } catch {
          // ignore
        }

        return { filename, timestamp, messageCount, messages }
      })
      .sort((a, b) => b.timestamp - a.timestamp)

    // Check for cached titles
    const titlesPath = path.join(archiveDir, '.titles.json')
    let cachedTitles: Record<string, string> = {}
    try {
      if (fs.existsSync(titlesPath)) {
        cachedTitles = JSON.parse(fs.readFileSync(titlesPath, 'utf-8'))
      }
    } catch {
      // ignore
    }

    // Generate titles (using cache when available)
    const archives = await Promise.all(
      fileInfos.map(async info => {
        let title = cachedTitles[info.filename]

        if (!title) {
          // Generate new title
          title = await generateArchiveTitle(info.messages)
          cachedTitles[info.filename] = title
        }

        return {
          filename: info.filename,
          timestamp: info.timestamp,
          messageCount: info.messageCount,
          title
        }
      })
    )

    // Save updated cache
    try {
      fs.writeFileSync(titlesPath, JSON.stringify(cachedTitles, null, 2))
    } catch (err) {
      console.error('Failed to save title cache:', err)
    }

    res.json({ archives })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get specific archived chat
router.get('/:id/chat/archives/:filename', async (req, res) => {
  const { id, filename } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    const HOME = process.env.HOME || ''
    const archiveDir = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'archive')
    const filePath = path.join(archiveDir, filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archive not found' })
    }

    const jsonlContent = fs.readFileSync(filePath, 'utf-8')
    const lines = jsonlContent.trim().split('\n').filter(l => l.trim())

    const messages: { role: 'user' | 'assistant'; content: string; timestamp?: number }[] = []

    for (const line of lines) {
      try {
        const obj = JSON.parse(line)
        if (obj.type === 'message' && obj.message) {
          const msg = obj.message
          let content = ''

          // Handle content array format
          if (Array.isArray(msg.content)) {
            content = msg.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n')
          } else if (typeof msg.content === 'string') {
            content = msg.content
          }

          if (content) {
            messages.push({
              role: msg.role || 'user',
              content,
              timestamp: obj.timestamp || msg.timestamp || Date.now()
            })
          }
        }
      } catch {
        continue
      }
    }

    res.json({ messages })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Delete archived chat
router.delete('/:id/chat/archives/:filename', async (req, res) => {
  const { id, filename } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    const HOME = process.env.HOME || ''
    const archiveDir = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'archive')
    const filePath = path.join(archiveDir, filename)

    // Security: ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' })
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archive not found' })
    }

    fs.unlinkSync(filePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/agents/:id/logs — Stream live logs via SSE (agent-specific)
router.get('/:id/logs', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const profileFlag = isProfile ? ['--profile', id] : []
  const child = spawn('openclaw', [...profileFlag, 'logs', '--follow', '--limit', '200'], {
    env: safeEnv(),
  })

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l: string) => l.trim())
    lines.forEach((line: string) => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`)
    })
  })

  child.stderr.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`)
  })

  child.on('close', () => {
    res.end()
  })

  req.on('close', () => {
    child.kill()
  })
})

// GET /api/agents/:id/health — Get agent health status
router.get('/:id/health', async (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)

  try {
    const profileFlag = isProfile ? ['--profile', id] : []
    const { execSync } = require('child_process')
    const args = [...profileFlag, 'health', '--json']
    const result = execSync(['openclaw', ...args].join(' '), {
      encoding: 'utf-8',
      timeout: 10000,
      env: safeEnv(),
    })
    const health = JSON.parse(result)
    res.json(health)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/agents/:id/gateway-status — Get gateway status
router.get('/:id/gateway-status', async (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)

  try {
    const profileFlag = isProfile ? ['--profile', id] : []
    const { execSync } = require('child_process')
    const args = [...profileFlag, 'gateway', 'status']
    const result = execSync(['openclaw', ...args].join(' '), {
      encoding: 'utf-8',
      timeout: 10000,
      env: safeEnv(),
    })
    res.json({ status: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/agents/:id/communities — get agent's current community and group memberships
router.get('/:id/communities', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  res.json({
    communities: agent.communities.map(c => c.name),
    groups: agent.groups.map(g => g.name),
  })
})

// GET /api/agents/:id/workflows — get workflows targeting this agent
router.get('/:id/workflows', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  try {
    const allWorkflows = listWorkflows()
    const agentWorkflows = allWorkflows.filter(workflow => {
      const participants = resolveParticipants(workflow, agents)
      return participants.some(p => p.agentId === id)
    }).map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      enabled: wf.enabled,
      schedule: wf.schedule,
    }))

    res.json({ workflows: agentWorkflows })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get agent workflows', message: error.message })
  }
})

// POST /api/agents/:id/archive — archive an agent (move to archive directory)
router.post('/:id/archive', async (req, res) => {
  const { id } = req.params
  const { reason } = req.body as { reason?: string }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  const archiveDir = path.join(getAgentsDir(), 'archive')
  const archivedAgentDir = path.join(archiveDir, id)

  try {
    if (!fs.existsSync(agentDir)) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    // Stop the agent if it's running
    const pidFile = path.join(agentDir, '.pid')
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10)
        if (pid > 0) {
          process.kill(pid, 'SIGTERM')
          // Wait a bit for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 500))
          // Force kill if still running
          try { process.kill(pid, 'SIGKILL') } catch {}
        }
        fs.unlinkSync(pidFile)
      } catch (err) {
        // Process may already be stopped, continue with archive
      }
    }

    // Create archive directory if it doesn't exist
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true })
    }

    // Remove agent from all communities and groups
    const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')

    // Remove from communities
    if (fs.existsSync(communitiesPath)) {
      let communitiesContent = fs.readFileSync(communitiesPath, 'utf-8')
      const lines = communitiesContent.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match Members line (with or without leading dash)
        if (line.match(/^\s*-?\s*\*\*Members:\*\*/i)) {
          const membersMatch = line.match(/^(\s*-?\s*\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)
            lines[i] = prefix + membersList.join(', ')
          }
        }
      }

      fs.writeFileSync(communitiesPath, lines.join('\n'), 'utf-8')
    }

    // Remove from groups
    if (fs.existsSync(groupsPath)) {
      let groupsContent = fs.readFileSync(groupsPath, 'utf-8')
      const lines = groupsContent.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match Members line (with or without leading dash)
        if (line.match(/^\s*-?\s*\*\*Members:\*\*/i)) {
          const membersMatch = line.match(/^(\s*-?\s*\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)
            lines[i] = prefix + membersList.join(', ')
          }
        }
      }

      fs.writeFileSync(groupsPath, lines.join('\n'), 'utf-8')
    }

    // Add archive metadata to IDENTITY.md before moving
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      let content = fs.readFileSync(identityPath, 'utf-8')
      const timestamp = new Date().toISOString()
      const archiveSection = `

## Archive Metadata

- **Archived:** ${timestamp}
- **Reason:** ${reason || 'No reason provided'}
`
      // Remove existing archive metadata if present
      content = content.replace(/##\s+Archive\s+Metadata\s+[\s\S]*?(?=\n##|\n---|\Z)/i, '')
      content = content.trimEnd() + archiveSection
      fs.writeFileSync(identityPath, content, 'utf-8')
    }

    // Move agent directory to archive
    fs.renameSync(agentDir, archivedAgentDir)

    res.json({ ok: true, timestamp: new Date().toISOString(), reason: reason || 'No reason provided' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/agents/:id/unarchive — unarchive an agent (move back from archive directory)
router.post('/:id/unarchive', (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const archiveDir = path.join(getAgentsDir(), 'archive')
  const archivedAgentDir = path.join(archiveDir, id)
  const agentDir = path.join(getAgentsDir(), id)

  try {
    if (!fs.existsSync(archivedAgentDir)) {
      return res.status(404).json({ error: 'Archived agent not found' })
    }

    // If target directory already exists, remove it first (safety check for duplicates)
    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true, force: true })
    }

    // Remove archive metadata from IDENTITY.md before moving
    const identityPath = path.join(archivedAgentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      let content = fs.readFileSync(identityPath, 'utf-8')
      // Remove Archive Metadata section (match the heading and everything after it to end of file)
      content = content.replace(/\n##\s+Archive\s+Metadata[\s\S]*$/i, '')
      content = content.trimEnd() + '\n'
      fs.writeFileSync(identityPath, content, 'utf-8')
    }

    // Move agent directory back from archive
    fs.renameSync(archivedAgentDir, agentDir)

    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/agents/:id/communities — update agent's community and group memberships
router.post('/:id/communities', (req, res) => {
  const { id } = req.params
  const { communities, groups } = req.body as { communities?: string[]; groups?: string[] }

  if (!Array.isArray(communities) && !Array.isArray(groups)) {
    return res.status(400).json({ error: 'Must provide communities or groups array' })
  }

  const agents = listAgents()
  const agent = agents.find(a => a.id === id)

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  try {
    // Read COMMUNITIES.md and GROUPS.md
    const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')

    let communitiesContent = ''
    let groupsContent = ''

    try {
      communitiesContent = fs.readFileSync(communitiesPath, 'utf-8')
    } catch {}
    try {
      groupsContent = fs.readFileSync(groupsPath, 'utf-8')
    } catch {}

    // Parse current communities and groups
    const { communities: allCommunities, groups: allGroups } = parseGroups(communitiesContent + '\n' + groupsContent)

    // Update communities if provided
    if (Array.isArray(communities)) {
      // For each community in the new list, ensure agent is in members
      // For each community NOT in the new list, ensure agent is NOT in members

      const updatedCommunities = communitiesContent.split('\n')
      let currentCommunity: string | null = null
      let currentCommunityHasMembers = false
      let currentCommunityIndex = -1

      for (let i = 0; i < updatedCommunities.length; i++) {
        const line = updatedCommunities[i]
        const trimmed = line.trim()

        // Track which community we're in
        if (trimmed.startsWith('###')) {
          // Before switching to new community, add Members line if needed
          if (currentCommunity && !currentCommunityHasMembers && communities.includes(currentCommunity) && currentCommunityIndex >= 0) {
            // Insert Members line after the community header (and other metadata)
            updatedCommunities.splice(i, 0, `- **Members:** ${id}`)
            i++ // Adjust index since we inserted a line
          }
          currentCommunity = trimmed.replace(/^###\s+/, '').trim()
          currentCommunityHasMembers = false
          currentCommunityIndex = i
        }

        // Exit current community if we hit a section header
        if (trimmed.startsWith('##')) {
          if (currentCommunity && !currentCommunityHasMembers && communities.includes(currentCommunity) && currentCommunityIndex >= 0) {
            updatedCommunities.splice(i, 0, `- **Members:** ${id}`)
            i++
          }
          currentCommunity = null
          currentCommunityHasMembers = false
        }

        // Update members line if it exists
        if (currentCommunity && trimmed.match(/^-\s+\*\*Members:\*\*/i)) {
          currentCommunityHasMembers = true
          const membersMatch = line.match(/^(\s*-\s+\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)

            // Add agent if this community is in the new list
            if (communities.includes(currentCommunity)) {
              membersList.push(id)
            }

            updatedCommunities[i] = prefix + membersList.join(', ')
          }
        }
      }

      // Handle last community if it didn't have members
      if (currentCommunity && !currentCommunityHasMembers && communities.includes(currentCommunity)) {
        updatedCommunities.push(`- **Members:** ${id}`)
      }

      fs.writeFileSync(communitiesPath, updatedCommunities.join('\n'), 'utf-8')
    }

    // Update groups if provided
    if (Array.isArray(groups)) {
      const updatedGroups = groupsContent.split('\n')
      let currentGroup: string | null = null
      let currentGroupHasMembers = false
      let lastMetadataLineIndex = -1

      for (let i = 0; i < updatedGroups.length; i++) {
        const line = updatedGroups[i]
        const trimmed = line.trim()

        // Track which group we're in
        if (trimmed.startsWith('###')) {
          // Before switching to new group, add Members line if needed
          if (currentGroup && !currentGroupHasMembers && groups.includes(currentGroup) && lastMetadataLineIndex >= 0) {
            // Insert Members line after the last metadata line
            updatedGroups.splice(lastMetadataLineIndex + 1, 0, `- **Members:** ${id}`)
            i++ // Adjust index since we inserted a line
          }
          currentGroup = trimmed.replace(/^###\s+/, '').trim()
          currentGroupHasMembers = false
          lastMetadataLineIndex = i // Start tracking from the group header
        }

        // Exit current group if we hit a section header
        if (trimmed.startsWith('##')) {
          if (currentGroup && !currentGroupHasMembers && groups.includes(currentGroup) && lastMetadataLineIndex >= 0) {
            updatedGroups.splice(lastMetadataLineIndex + 1, 0, `- **Members:** ${id}`)
            i++
          }
          currentGroup = null
          currentGroupHasMembers = false
          lastMetadataLineIndex = -1
        }

        // Track metadata lines (lines starting with -)
        if (currentGroup && trimmed.startsWith('-')) {
          lastMetadataLineIndex = i

          // Check if this is the Members line
          if (trimmed.match(/^-\s+\*\*Members:\*\*/i)) {
            currentGroupHasMembers = true
            const membersMatch = line.match(/^(\s*-\s+\*\*Members:\*\*\s*)(.*)/)
            if (membersMatch) {
              const prefix = membersMatch[1]
              const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)

              // Add agent if this group is in the new list
              if (groups.includes(currentGroup)) {
                membersList.push(id)
              }

              updatedGroups[i] = prefix + membersList.join(', ')
            }
          }
        }
      }

      // Handle last group if it didn't have members
      if (currentGroup && !currentGroupHasMembers && groups.includes(currentGroup) && lastMetadataLineIndex >= 0) {
        updatedGroups.splice(lastMetadataLineIndex + 1, 0, `- **Members:** ${id}`)
      }

      fs.writeFileSync(groupsPath, updatedGroups.join('\n'), 'utf-8')
    }

    res.json({ ok: true, communities, groups })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Export agent as ZIP
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params
    console.log('[Export API] Request received for agent:', id)

    const agentsDir = getAgentsDir()
    console.log('[Export API] Agents directory:', agentsDir)

    const agentDir = path.join(agentsDir, id)
    console.log('[Export API] Agent directory:', agentDir)

    if (!fs.existsSync(agentDir)) {
      console.error('[Export API] Agent directory not found:', agentDir)
      return res.status(404).json({ error: 'Agent not found' })
    }

    console.log('[Export API] Setting headers...')
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${id}.zip"`)

    console.log('[Export API] Creating archive...')
    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.on('error', (err) => {
      console.error('[Export API] Archive error:', err)
      throw err
    })

    archive.on('end', () => {
      console.log('[Export API] Archive finalized successfully')
    })

    console.log('[Export API] Piping archive to response...')
    archive.pipe(res)
    archive.directory(agentDir, id)
    archive.append(JSON.stringify(getAgentTransferMetadata(id), null, 2), { name: `${id}/clawmax-export.json` })
    await archive.finalize()
    console.log('[Export API] Finalize called')
  } catch (err: any) {
    console.error('[Export API] Error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Import agent bundle from a local directory path
router.post('/import-directory', async (req, res) => {
  try {
    const { sourcePath, targetId } = req.body as { sourcePath?: string; targetId?: string }
    if (!sourcePath || typeof sourcePath !== 'string') {
      return res.status(400).json({ error: 'sourcePath is required' })
    }
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const result = importAgentFromBundleDirectory(sourcePath, targetId)
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Import agent bundle from ZIP upload
router.post('/import-zip', express.raw({ type: 'application/zip', limit: '25mb' }), async (req, res) => {
  try {
    const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : undefined
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const body = req.body as Buffer
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'ZIP body is required' })
    }

    const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'clawmax-import-zip-'))
    const zipPath = path.join(tmpDir, 'import.zip')
    fs.writeFileSync(zipPath, body)

    const result = importAgentFromZipArchive(zipPath, targetId)
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// List importable OpenClaw agents from ~/.openclaw/agents
router.get('/openclaw/importable', async (_req, res) => {
  try {
    res.json({ agents: listImportableOpenClawAgents() })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Import OpenClaw agent into current workspace
router.post('/openclaw/import', async (req, res) => {
  try {
    const { sourceId, targetId } = req.body as { sourceId?: string; targetId?: string }
    if (!sourceId || !/^[a-zA-Z0-9_-]+$/.test(sourceId)) {
      return res.status(400).json({ error: 'Valid sourceId is required' })
    }
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const result = importAgentFromOpenClaw(sourceId, targetId)
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Export workspace agent into ~/.openclaw/agents
router.post('/:id/export-openclaw', async (req, res) => {
  try {
    const { id } = req.params
    const { targetId, includeSkills, includeMemberships } = req.body as {
      targetId?: string
      includeSkills?: boolean
      includeMemberships?: boolean
    }
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const result = exportAgentToOpenClaw(id, targetId, { includeSkills, includeMemberships })
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
