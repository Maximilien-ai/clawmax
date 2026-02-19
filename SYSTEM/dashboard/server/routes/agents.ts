import { Router } from 'express'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { listAgents, getAgentActivity, getNextAgentId, findFreePort, getAgentImpact, deleteAgent, cloneAgentFiles, getAgentGatewayConfig, WORKSPACE, AGENTS_DIR } from '../lib/workspace'

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

// POST /api/agents/provision — spawn setup.sh and stream output via SSE
router.post('/provision', (req, res) => {
  const { name, model, whatsapp, port, profile, cloneFrom } = req.body as {
    name?: string; model?: string; whatsapp?: string; port?: number; profile?: boolean; cloneFrom?: string
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

  // Clone source agent files before provisioning
  if (cloneFrom && /^[a-z][a-z0-9_-]*$/.test(cloneFrom)) {
    const srcPath = path.join(AGENTS_DIR, cloneFrom)
    const dstPath = path.join(AGENTS_DIR, name)
    const copied = cloneAgentFiles(srcPath, dstPath, cloneFrom, name)
    if (copied.length > 0) {
      send('log', `Cloned ${copied.length} file(s) from ${cloneFrom}: ${copied.join(', ')}\n`)
    }
  }

  const scriptPath = path.join(WORKSPACE, 'SYSTEM', 'scripts', 'instances', 'setup.sh')
  const args: string[] = [name]
  if (model) args.push('--model', model)
  if (whatsapp) args.push('--whatsapp', whatsapp)
  if (port) args.push('--port', String(port))
  if (profile) args.push('--profile')

  send('start', `Running setup for agent: ${name}`)

  const child = spawn('bash', [scriptPath, ...args], {
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

/** Call a single RPC method on the openclaw gateway via WebSocket (Node 22+ built-in WebSocket) */
function callGatewayRpc(port: number, token: string, method: string, params: unknown = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { ws.close() } catch {} reject(new Error('gateway timeout')) }, 8000)
    // @ts-ignore — Node 22+ built-in WebSocket
    const ws = new (globalThis.WebSocket as typeof WebSocket)(`ws://127.0.0.1:${port}`)
    let stage: 'challenge' | 'connecting' | 'ready' = 'challenge'
    const reqId = String(Date.now())

    ws.onmessage = (ev: MessageEvent) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(ev.data as string) } catch { return }

      if (stage === 'challenge' && msg.type === 'event' && msg.event === 'connect.challenge') {
        stage = 'connecting'
        ws.send(JSON.stringify({
          type: 'req', id: 'connect-1', method: 'connect',
          params: {
            minProtocol: 1, maxProtocol: 99,
            client: { id: 'dashboard', version: '1.0', platform: 'node', mode: 'default' },
            role: 'operator', scopes: ['operator.read'],
            auth: { token },
          },
        }))
        return
      }

      if (stage === 'connecting' && msg.type === 'res' && msg.id === 'connect-1') {
        if (!msg.ok) { clearTimeout(timer); ws.close(); reject(new Error(`connect failed: ${JSON.stringify(msg.error)}`)); return }
        stage = 'ready'
        ws.send(JSON.stringify({ type: 'req', id: reqId, method, params }))
        return
      }

      if (stage === 'ready' && msg.type === 'res' && msg.id === reqId) {
        clearTimeout(timer)
        ws.close()
        if (msg.ok) resolve(msg.payload)
        else reject(new Error(`${method} failed: ${JSON.stringify(msg.error)}`))
      }
    }

    ws.onerror = () => { clearTimeout(timer); reject(new Error('gateway connection failed')) }
    ws.onclose = () => { clearTimeout(timer) }
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
    const result = await callGatewayRpc(cfg.port, cfg.token, 'sessions.list', {
      includeDerivedTitles: true,
      limit: 500,
    }) as { sessions?: Array<{ key: string; kind: string; subject?: string; displayName?: string; derivedTitle?: string; channel?: string }> }

    const sessions = result?.sessions ?? []

    const nameOf = (s: { key: string; subject?: string; displayName?: string; derivedTitle?: string }) =>
      (s.subject || s.displayName || s.derivedTitle || s.key.split(':').pop() || s.key).trim()

    const waGroups = sessions
      .filter(s => s.kind === 'group' && s.key.includes(':whatsapp:'))
      .map(s => ({ name: nameOf(s), key: s.key }))
      .filter((g, i, arr) => arr.findIndex(x => x.name === g.name) === i)

    const waCommunities = sessions
      .filter(s => s.kind === 'community' && s.key.includes(':whatsapp:'))
      .map(s => ({ name: nameOf(s), key: s.key }))
      .filter((g, i, arr) => arr.findIndex(x => x.name === g.name) === i)

    res.json({ groups: waGroups, communities: waCommunities })
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

export default router
