import { Router } from 'express'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { listAgents, getAgentActivity, getNextAgentId, findFreePort, getAgentImpact, deleteAgent, cloneAgentFiles, getAgentGatewayConfig, parseGroups, WORKSPACE, AGENTS_DIR } from '../lib/workspace'
import { generateAgentFiles } from '../lib/ai-generator'

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
    WORKSPACE,
  ]
  for (const dir of repoDirs) {
    const baileys = findPnpmPkg(dir, '@whiskeysockets+baileys', '@whiskeysockets/baileys')
    const boom = findPnpmPkg(dir, '@hapi+boom', '@hapi/boom')
    if (baileys && boom) return { baileys, boom }
  }
  return { baileys: null, boom: null }
}

/** Register a new agent in openclaw.json */
function registerAgentInConfig(agentId: string, profile: boolean): { ok: boolean; error?: string } {
  try {
    const HOME = process.env.HOME || ''
    const configPath = profile
      ? path.join(HOME, `.openclaw-${agentId}`, 'openclaw.json')
      : path.join(HOME, '.openclaw', 'openclaw.json')

    // Read existing config
    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    // Check if agent already registered
    if (config.agents?.list?.some((a: any) => a.id === agentId)) {
      return { ok: true } // Already registered, that's fine
    }

    // Add new agent entry
    const workspacePath = path.join(WORKSPACE, 'AGENTS', agentId)
    const agentDir = profile
      ? path.join(HOME, `.openclaw-${agentId}`, 'agents', agentId, 'agent')
      : path.join(HOME, '.openclaw', 'agents', agentId, 'agent')

    // Ensure agent directory exists
    fs.mkdirSync(agentDir, { recursive: true })

    const newAgent = {
      id: agentId,
      default: false,
      workspace: workspacePath,
      agentDir
    }

    if (!config.agents) config.agents = {}
    if (!config.agents.list) config.agents.list = []
    config.agents.list.push(newAgent)

    // Write back
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

const router = Router()

// GET /api/agents — list all agents
router.get('/', (_req, res) => {
  const agents = listAgents()
  res.json({ agents })
})

// GET /api/agents/next — next available ID + free port (must be before /:id)
router.get('/next', async (_req, res) => {
  const id = getNextAgentId()
  const n = parseInt(id.replace('max', ''), 10)
  const port = await findFreePort(18789 + n * 100)
  res.json({ id, port })
})

// POST /api/agents/generate — AI-generate agent files
router.post('/generate', async (req, res) => {
  const { description, name, tags } = req.body as {
    description?: string
    name?: string
    tags?: string[]
  }

  if (!description || !name) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  try {
    const files = await generateAgentFiles({
      description,
      name,
      tags: tags || [],
    })
    res.json(files)
  } catch (err) {
    console.error('AI generation error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/agents/provision — spawn setup.sh and stream output via SSE
router.post('/provision', (req, res) => {
  const { name, model, whatsapp, port, profile, cloneFrom, generatedFiles } = req.body as {
    name?: string
    model?: string
    whatsapp?: string
    port?: number
    profile?: boolean
    cloneFrom?: string
    generatedFiles?: { identity: string; soul: string; tools: string }
  }

  if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) {
    res.status(400).json({ error: 'Invalid agent name' })
    return
  }

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
    const dstPath = path.join(AGENTS_DIR, name)
    fs.mkdirSync(dstPath, { recursive: true })

    fs.writeFileSync(path.join(dstPath, 'IDENTITY.md'), generatedFiles.identity)
    fs.writeFileSync(path.join(dstPath, 'SOUL.md'), generatedFiles.soul)
    fs.writeFileSync(path.join(dstPath, 'TOOLS.md'), generatedFiles.tools)

    send('log', `Wrote AI-generated files: IDENTITY.md, SOUL.md, TOOLS.md\n`)
  }

  // Clone source agent files before provisioning
  if (cloneFrom && /^[a-z][a-z0-9_-]*$/.test(cloneFrom)) {
    const srcPath = path.join(AGENTS_DIR, cloneFrom)
    const dstPath = path.join(AGENTS_DIR, name)
    const copied = cloneAgentFiles(srcPath, dstPath, cloneFrom, name)
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
    isRegistered = agentList.some((a: any) => a.id === name)
  } catch {}

  if (isRegistered) {
    // Agent already registered - skip openclaw agents add
    send('log', `Agent "${name}" is already registered\n`)
    send('done', 'ok')
    res.end()
    return
  }

  // Build openclaw agents add command
  const workspaceArg = path.join(WORKSPACE, 'AGENTS', name)
  const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', name, 'agent')

  // Normalize model name - ensure it has a provider prefix (default to openai/)
  let normalizedModel = model
  if (model && !model.includes('/')) {
    normalizedModel = `openai/${model}`
    send('log', `Normalized model from "${model}" to "${normalizedModel}"\n`)
  }

  const args: string[] = ['agents', 'add', name, '--workspace', workspaceArg, '--agent-dir', agentDirArg, '--non-interactive']
  if (normalizedModel) args.push('--model', normalizedModel)
  if (whatsapp) args.push('--whatsapp', whatsapp)
  // --port is not supported by openclaw agents add command
  // Profile support removed - not currently used

  send('start', `Creating agent: ${name}`)
  send('log', `Command: openclaw ${args.join(' ')}\n`)

  const child = spawn('openclaw', args, {
    cwd: WORKSPACE,
    env: { ...process.env, TERM: 'dumb' },
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
      send('log', `Agent ${name} created successfully\n`)
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

// GET /api/agents/:id — single agent
router.get('/:id', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

// GET /api/agents/:id/activity — file activity + key docs for the detail panel
router.get('/:id/activity', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const activity = getAgentActivity(agent.workspacePath)
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
  const identityPath = path.join(AGENTS_DIR, id, 'IDENTITY.md')
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

  const scriptPath = path.join(WORKSPACE, 'SYSTEM', 'scripts', 'instances', 'lib', 'whatsapp-pair.mjs')

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
    cwd: WORKSPACE,
    env: { ...process.env, TERM: 'dumb' },
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
        const identityPath = path.join(AGENTS_DIR, id, 'IDENTITY.md')
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
    const proc = spawn('openclaw', args, { env: process.env })
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
    const groupsPath = path.join(AGENTS_DIR, id, 'GROUPS.md')
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

  const groupsPath = path.join(AGENTS_DIR, id, 'GROUPS.md')

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
    const args = ['agent', '--agent', id, '--session-id', sessionId, '--message', message, '--json']
    const proc = spawn('openclaw', args, { env: process.env })

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

  const agentDir = path.join(AGENTS_DIR, id)
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

// GET /api/agents/:id/chat/messages — fetch dashboard chat history
router.get('/:id/chat/messages', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const sessionKey = `agent:${id}:dashboard-chat`

  try {
    const HOME = process.env.HOME || ''
    const sessionsIndexPath = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'sessions.json')

    // Check if sessions index exists
    if (!fs.existsSync(sessionsIndexPath)) {
      return res.json({ messages: [] })
    }

    // Read sessions index
    const sessionsIndex = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'))

    // Find the session entry - it might be keyed by sessionKey directly OR we need to find it
    let actualSessionId: string | null = null

    // First try direct lookup
    if (sessionsIndex[sessionKey]?.sessionId) {
      actualSessionId = sessionsIndex[sessionKey].sessionId
    } else {
      // Search through all entries to find one where sessionId matches our key
      for (const [_, entry] of Object.entries(sessionsIndex)) {
        if (typeof entry === 'object' && entry !== null && (entry as any).sessionId === sessionKey) {
          actualSessionId = sessionKey
          break
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

export default router
