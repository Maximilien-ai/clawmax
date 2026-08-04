import { Router } from 'express'
import { spawn } from 'child_process'
import { validateIntegrations } from '../lib/integration-validation'
import {
  getResolvedWorkspaceIntegrationSecretPresence,
  getResolvedWorkspaceIntegrationSecretSummaries,
  getResolvedWorkspaceIntegrationConfig,
  readWorkspaceIntegrationConfig,
  readWorkspaceIntegrationSecrets,
  writeWorkspaceIntegrationConfig,
  writeWorkspaceIntegrationSecrets,
} from '../lib/workspace-integrations'
import { getEnabledPartnerSlugs, listPartnerDefinitions } from '../lib/partners'
import { checkGitHubPrereqs, getGitHubAuthMode } from '../lib/prereqs'
import { safeEnv } from '../lib/safe-env'
import { getDashboardDeploymentKind, getDashboardEnvRaw, isOllamaUiEnabled } from '../lib/dashboard-env'
import { getAuthenticatedSession } from '../lib/github-auth'
import { getWorkspaceResendApiKey, resolveResendTestRecipient, sendResendTestEmail } from '../lib/resend-partner'
import { detectRuntimeStatuses, listRuntimeModels, normalizeAgentRuntime, resolveEnabledRuntimes, resolveWorkspaceRuntime } from '../lib/agent-runtime'

const router = Router()

router.get('/status', (_req, res) => {
  const ollamaEnabled = isOllamaUiEnabled(getDashboardEnvRaw())
  res.json({
    validationAvailable: true,
    validationMode: 'live',
    providers: ollamaEnabled ? ['openai', 'anthropic', 'gemini', 'openrouter', 'xai', 'ollama', 'openai-compatible', 'opik'] : ['openai', 'anthropic', 'gemini', 'openrouter', 'xai', 'openai-compatible', 'opik'],
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
  res.json({
    config: getResolvedWorkspaceIntegrationConfig(),
    secretPresence: getResolvedWorkspaceIntegrationSecretPresence(),
    secretSummaries: getResolvedWorkspaceIntegrationSecretSummaries(),
  })
})

router.get('/github-status', (_req, res) => {
  const repo = readWorkspaceIntegrationConfig().githubDefaultRepo?.trim()
  const checks = checkGitHubPrereqs({ repo })
  const ready = checks.every((check) => check.status === 'pass')
  res.json({ ready, checks, mode: getGitHubAuthMode() })
})

router.get('/runtimes', async (_req, res) => {
  const workspaceDefault = resolveWorkspaceRuntime()
  const statuses = detectRuntimeStatuses(workspaceDefault)
  res.json({
    // models[] is the runtime CLI's own catalog, empty when it cannot be enumerated. The agent
    // editor uses it so a runtime-pinned agent picks a name that runtime actually accepts.
    runtimes: await Promise.all(statuses.map(async (status) => ({
      ...status,
      models: status.installed ? await listRuntimeModels(status.id) : [],
    }))),
    workspaceDefault,
    // Resolved (effective) enabled set — workspace config, or the WORKSPACES_INTEGRATIONS_RUNTIMES
    // env default when the workspace has no config. The client uses this so its checkboxes and its
    // save value reflect the env default and never clobber it with a blind [].
    enabledRuntimes: resolveEnabledRuntimes(),
  })
})

router.put('/config', (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>
  const ollamaEnabled = isOllamaUiEnabled(getDashboardEnvRaw())
  const partnerDefinitions = listPartnerDefinitions()
  const config = writeWorkspaceIntegrationConfig({
    preferredModel: typeof body.preferredModel === 'string' ? body.preferredModel : undefined,
    systemPreferredModel: typeof body.systemPreferredModel === 'string' ? body.systemPreferredModel : undefined,
    agentRuntime: typeof body.agentRuntime === 'string' ? normalizeAgentRuntime(body.agentRuntime) : undefined,
    enabledRuntimes: Array.isArray(body.enabledRuntimes) ? body.enabledRuntimes : undefined,
    githubDefaultRepo: typeof body.githubDefaultRepo === 'string' ? body.githubDefaultRepo : undefined,
    sensoContextLabel: typeof body.sensoContextLabel === 'string' ? body.sensoContextLabel : undefined,
    ollamaBaseUrl: ollamaEnabled && typeof body.ollamaBaseUrl === 'string' ? body.ollamaBaseUrl : undefined,
    ollamaDefaultModel: ollamaEnabled && typeof body.ollamaDefaultModel === 'string' ? body.ollamaDefaultModel : undefined,
    openaiCompatibleBaseUrl: typeof body.openaiCompatibleBaseUrl === 'string' ? body.openaiCompatibleBaseUrl : undefined,
    openaiCompatibleDefaultModel: typeof body.openaiCompatibleDefaultModel === 'string' ? body.openaiCompatibleDefaultModel : undefined,
    opikWorkspace: typeof body.opikWorkspace === 'string' ? body.opikWorkspace : undefined,
    opikProject: typeof body.opikProject === 'string' ? body.opikProject : undefined,
    enabledPartners: Array.isArray(body.enabledPartners) ? body.enabledPartners.filter((item): item is string => typeof item === 'string') : undefined,
    partners: typeof body.partners === 'object' && body.partners ? body.partners as Record<string, Record<string, string | boolean | undefined>> : undefined,
  })
  const partnerSecretsInput =
    typeof body.partnerSecrets === 'object' && body.partnerSecrets
      ? body.partnerSecrets as Record<string, Record<string, string | undefined>>
      : undefined
  const existingSecrets = readWorkspaceIntegrationSecrets()
  const serverPartnerSecrets = Object.fromEntries(
    partnerDefinitions.map((partner) => {
      const serverSecretKeys = (partner.fields || [])
        .filter((field) => field.secret && field.storage === 'server')
        .map((field) => field.key)
      const nextValues = Object.fromEntries(
        serverSecretKeys
          .map((key) => {
            const incoming = partnerSecretsInput?.[partner.slug]?.[key]
            if (typeof incoming === 'string') {
              return [key, incoming.trim() || existingSecrets.partners?.[partner.slug]?.[key]]
            }
            return [key, existingSecrets.partners?.[partner.slug]?.[key]]
          })
          .filter(([, value]) => typeof value === 'string' && !!value.trim())
      )
      return [partner.slug, nextValues]
    }).filter(([, values]) => Object.keys(values as Record<string, string>).length > 0)
  )
  writeWorkspaceIntegrationSecrets({ partners: serverPartnerSecrets })
  res.json({
    ok: true,
    config,
    secretPresence: getResolvedWorkspaceIntegrationSecretPresence(),
    secretSummaries: getResolvedWorkspaceIntegrationSecretSummaries(),
  })
})

router.post('/validate', async (req, res) => {
  try {
    const body = { ...(req.body || {}) } as Record<string, unknown>
    if (!isOllamaUiEnabled(getDashboardEnvRaw())) {
      body.ollamaBaseUrl = ''
      body.ollamaDefaultModel = ''
    }
    const result = await validateIntegrations(body)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to validate integrations' })
  }
})

router.post('/resend/test-email', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>
    const session = getAuthenticatedSession(req)
    const deploymentKind = getDashboardDeploymentKind(getDashboardEnvRaw())
    const result = await sendResendTestEmail({
      apiKey: getWorkspaceResendApiKey(),
      from: typeof body.from === 'string' ? body.from : undefined,
      replyTo: typeof body.replyTo === 'string' ? body.replyTo : undefined,
      to: resolveResendTestRecipient({
        requestedTo: typeof body.to === 'string' ? body.to : undefined,
        actorEmail: session?.email,
        actorLogin: session?.login,
        allowCustomRecipient: deploymentKind === 'local' || deploymentKind === 'onprem',
      }),
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      text: typeof body.text === 'string' ? body.text : undefined,
    })
    res.json({ ok: true, ...result })
  } catch (err: any) {
    const message = err?.message || 'Failed to send Resend test email'
    const status = /RESEND_API_KEY|Recipient email|Sender email/i.test(message) ? 400 : 502
    res.status(status).json({ ok: false, error: message })
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
    ? ['auth', 'refresh', '--hostname', 'github.com', '-s', 'repo']
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
    const repo = readWorkspaceIntegrationConfig().githubDefaultRepo?.trim()
    const checks = checkGitHubPrereqs({ repo })
    const ready = checks.every((check) => check.status === 'pass')
    send('status', JSON.stringify({ ready, checks, mode: getGitHubAuthMode() }))
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
