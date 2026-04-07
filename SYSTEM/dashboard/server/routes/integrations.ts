import { Router } from 'express'
import { spawn } from 'child_process'
import { validateIntegrations } from '../lib/integration-validation'
import { readWorkspaceIntegrationConfig, writeWorkspaceIntegrationConfig } from '../lib/workspace-integrations'
import { getEnabledPartnerSlugs, listPartnerDefinitions } from '../lib/partners'
import { checkGitHubCliPrereqs } from '../lib/prereqs'
import { safeEnv } from '../lib/safe-env'

const router = Router()

router.get('/status', (_req, res) => {
  res.json({
    validationAvailable: true,
    validationMode: 'live',
    providers: ['openai', 'anthropic', 'gemini', 'ollama', 'opik'],
    notes: [
      'Validation runs against the current server build.',
      'Provider secrets remain browser-local in this preview flow.',
      'Non-secret workspace defaults persist per workspace and are reused by template apply and runtime paths.',
    ],
    visiblePartners: getEnabledPartnerSlugs(),
    partnerDefinitions: listPartnerDefinitions(),
  })
})

router.get('/config', (_req, res) => {
  res.json({ config: readWorkspaceIntegrationConfig() })
})

router.get('/github-status', (_req, res) => {
  const checks = checkGitHubCliPrereqs()
  const ready = checks.every((check) => check.status === 'pass')
  res.json({ ready, checks })
})

router.put('/config', (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>
  const config = writeWorkspaceIntegrationConfig({
    preferredModel: typeof body.preferredModel === 'string' ? body.preferredModel : undefined,
    githubDefaultRepo: typeof body.githubDefaultRepo === 'string' ? body.githubDefaultRepo : undefined,
    sensoContextLabel: typeof body.sensoContextLabel === 'string' ? body.sensoContextLabel : undefined,
    ollamaBaseUrl: typeof body.ollamaBaseUrl === 'string' ? body.ollamaBaseUrl : undefined,
    ollamaDefaultModel: typeof body.ollamaDefaultModel === 'string' ? body.ollamaDefaultModel : undefined,
    opikWorkspace: typeof body.opikWorkspace === 'string' ? body.opikWorkspace : undefined,
    opikProject: typeof body.opikProject === 'string' ? body.opikProject : undefined,
    enabledPartners: Array.isArray(body.enabledPartners) ? body.enabledPartners.filter((item): item is string => typeof item === 'string') : undefined,
    partners: typeof body.partners === 'object' && body.partners ? body.partners as Record<string, Record<string, string | boolean | undefined>> : undefined,
  })
  res.json({ ok: true, config })
})

router.post('/validate', async (req, res) => {
  try {
    const result = await validateIntegrations(req.body || {})
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to validate integrations' })
  }
})

router.post('/github-auth', (req, res) => {
  const mode = req.body?.mode === 'refresh-repo-scope' ? 'refresh-repo-scope' : 'login'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (type: string, data: string) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
  }

  const args = mode === 'refresh-repo-scope'
    ? ['auth', 'refresh', '-s', 'repo']
    : ['auth', 'login', '--web', '--git-protocol', 'https', '--scopes', 'repo']

  send('start', `$ gh ${args.join(' ')}\n`)
  send('log', mode === 'refresh-repo-scope'
    ? 'Refreshing GitHub repo scope for issue and PR workflows...\n'
    : 'Starting GitHub auth flow. Complete the browser/device flow, then return here.\n')

  const child = spawn('gh', args, { env: safeEnv(), stdio: ['ignore', 'pipe', 'pipe'] })

  child.stdout.on('data', (chunk: Buffer) => send('log', chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => send('log', chunk.toString()))
  child.on('error', (err) => {
    send('error', err.message || 'Failed to start GitHub auth')
    res.end()
  })
  child.on('close', (code) => {
    const checks = checkGitHubCliPrereqs()
    const ready = checks.every((check) => check.status === 'pass')
    send('status', JSON.stringify({ ready, checks }))
    if (code === 0) {
      send('done', ready ? 'GitHub auth complete.\n' : 'GitHub auth command finished, but readiness is still limited.\n')
    } else {
      send('error', `GitHub auth exited with code ${code}`)
    }
    res.end()
  })

  req.on('close', () => {
    if (!child.killed) child.kill()
  })
})

export default router
