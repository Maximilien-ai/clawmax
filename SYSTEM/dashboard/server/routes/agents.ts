import { Router } from 'express'
import { spawn } from 'child_process'
import path from 'path'
import { listAgents, getAgentActivity, getNextAgentId, findFreePort, getAgentImpact, deleteAgent, WORKSPACE } from '../lib/workspace'

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
  const { name, model, whatsapp, port, profile } = req.body as {
    name?: string; model?: string; whatsapp?: string; port?: number; profile?: boolean
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
  })

  child.stdout.on('data', (chunk: Buffer) => send('log', chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => send('log', chunk.toString()))

  child.on('close', (code) => {
    send('done', code === 0 ? 'ok' : `exit code ${code}`)
    res.end()
  })

  child.on('error', (err) => {
    send('error', err.message)
    res.end()
  })

  req.on('close', () => { child.kill() })
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

export default router
