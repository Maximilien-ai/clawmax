import { Router } from 'express'
import { validateIntegrations } from '../lib/integration-validation'
import { readWorkspaceIntegrationConfig, writeWorkspaceIntegrationConfig } from '../lib/workspace-integrations'

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
  })
})

router.get('/config', (_req, res) => {
  res.json({ config: readWorkspaceIntegrationConfig() })
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

export default router
