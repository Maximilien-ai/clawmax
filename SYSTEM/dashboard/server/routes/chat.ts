import { Router } from 'express'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getAgentGatewayConfig, getWorkspacePath, invalidateAgentStatusCache } from '../lib/workspace'
import { isGatewayRunning } from '../lib/gateway-rpc'
import { getRequestDashboardInstanceId, traceAgentChat } from '../lib/opik'
import { readWorkspaceIntegrationConfig } from '../lib/workspace-integrations'
import { userExecutionEnv } from '../lib/safe-env'
import { checkBudgetBlock } from '../lib/budget'
import { normalizeChatMessage } from '../lib/chat-normalization'
import {
  deriveWorkspaceRootFromAgentWorkspace,
  readLatestAssistantUsageFromPersistedSession,
  resolveAgentExecutionConfig,
  resolvePersistedAgentSessionId,
  runExclusiveAgentExecution,
  scopeSessionIdToModel,
  withTemporaryAgentAuthProfiles,
} from '../lib/agent-execution'
import { getAuthenticatedSession } from '../lib/github-auth'

const router = Router()

/** Extract JSON object from a string that may contain non-JSON prefixed lines (e.g. stderr warnings) */
function extractJson(text: string): string {
  // Find first { and last } to extract JSON from mixed output
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1)
  }
  return ''
}

function buildDashboardChatSeed(agentId: string, agentWorkspaceDir?: string): string {
  let stamp = 'chat'
  const identityPath = agentWorkspaceDir ? path.join(agentWorkspaceDir, 'IDENTITY.md') : ''
  if (identityPath && fs.existsSync(identityPath)) {
    try {
      stamp = Math.floor(fs.statSync(identityPath).mtimeMs).toString(36)
    } catch {}
  }
  return `dashboard-${agentId}-${stamp}-chat`
}

function deriveChatError(raw: string): string {
  const text = raw.trim()
  if (!text) return 'No reply from agent.'
  if (/Unknown model:/i.test(text)) {
    return 'This agent is configured with a model that the current runtime does not support. Choose a different model for the agent and try again.'
  }
  if (/No API key found for provider/i.test(text)) {
    return text.match(/No API key found for provider "[^"]+"/i)?.[0]
      || 'The selected model provider is missing credentials for this agent runtime.'
  }
  if (/All models failed/i.test(text) && /Unknown model:/i.test(text)) {
    return 'This agent is configured with an unsupported model, and fallback providers could not authenticate. Choose a supported model for the agent and try again.'
  }
  if (/gateway/i.test(text)) return 'Agent chat could not reach the gateway runtime.'
  if (/timeout/i.test(text)) return 'Agent chat timed out before a reply was produced.'
  if (/api key|execution path configured|ollama runtime/i.test(text)) return text
  return text
}

function evaluateChatExecutionReadiness(
  agentId: string,
  byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
) {
  const integrationConfig = readWorkspaceIntegrationConfig()
  const resolvedAgent = resolveAgentExecutionConfig(agentId)
  const effectiveWorkspaceRoot = deriveWorkspaceRootFromAgentWorkspace(resolvedAgent.workspace) || getWorkspacePath()
  const useOpenAiCompatible = resolvedAgent.provider === 'openai-compatible'
  const executionEnv = userExecutionEnv({
    openai: useOpenAiCompatible ? undefined : byok?.openai,
    anthropic: byok?.anthropic,
    gemini: byok?.gemini,
    ollamaBaseUrl: byok?.ollamaBaseUrl || integrationConfig.ollamaBaseUrl,
    openaiCompatibleApiKey: useOpenAiCompatible ? byok?.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? (byok?.openaiCompatibleBaseUrl || integrationConfig.openaiCompatibleBaseUrl) : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  })
  executionEnv.OPENCLAW_WORKSPACE = effectiveWorkspaceRoot
  if (!resolvedAgent.model || resolvedAgent.model.trim().toLowerCase() === 'unknown') {
    return {
      available: false,
      error: `Agent ${agentId} has no model configured. Choose a model for this agent before chatting.`,
      resolvedAgent,
    }
  }
  const hasHostedKeys = !!(executionEnv.ANTHROPIC_API_KEY || executionEnv.OPENAI_API_KEY || executionEnv.GEMINI_API_KEY)
  const hasOllamaPath = !!(executionEnv.OLLAMA_BASE_URL || integrationConfig.ollamaDefaultModel)
  const hasOpenAiCompatiblePath = !!(executionEnv.OPENAI_BASE_URL || integrationConfig.openaiCompatibleBaseUrl)

  if (resolvedAgent.provider === 'ollama' && !hasOllamaPath && !hasHostedKeys) {
    return {
      available: false,
      error: `Agent ${agentId} is configured for ${resolvedAgent.model || 'ollama'}, but no Ollama runtime is configured. Add an Ollama base URL in BYOK or workspace integrations.`,
      resolvedAgent,
    }
  }
  if (resolvedAgent.provider === 'openai-compatible' && !hasOpenAiCompatiblePath) {
    return {
      available: false,
      error: `Agent ${agentId} is configured for ${resolvedAgent.model || 'openai-compatible'}, but no OpenAI-compatible Base URL is configured. Add one in BYOK or workspace integrations.`,
      resolvedAgent,
    }
  }
  if (!hasHostedKeys && !hasOllamaPath && !hasOpenAiCompatiblePath) {
    return {
      available: false,
      error: 'No execution path configured. Add hosted provider keys, configure Ollama, or add an OpenAI-compatible endpoint in BYOK / workspace integrations.',
      resolvedAgent,
    }
  }

  return {
    available: true,
    resolvedAgent,
  }
}

function persistDashboardChatSession(agentId: string, sessionId: string) {
  try {
    const homeDir = process.env.HOME || ''
    const sessionKey = `agent:${agentId}:dashboard-chat`
    const resolvedSessionId = resolvePersistedAgentSessionId(agentId, sessionKey, sessionId, homeDir) || sessionId
    const sessionsDir = path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions')
    const sessionsPath = path.join(sessionsDir, 'sessions.json')
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true })
    }
    const sessions = fs.existsSync(sessionsPath)
      ? JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
      : {}
    sessions[sessionKey] = { sessionId: resolvedSessionId, updatedAt: Date.now() }
    fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2))
  } catch (err) {
    console.warn(`[Chat Route] Failed to persist dashboard chat session for ${agentId}:`, err)
  }
}

/**
 * GET /api/agents/:id/gateway
 * Returns gateway connection info (port, token, availability)
 */
router.get('/:id/gateway', (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const gatewayConfig = getAgentGatewayConfig(id)

  if (!gatewayConfig) {
    return res.status(404).json({
      error: 'Gateway not configured for this agent',
      available: false
    })
  }

  // Check if gateway is actually running by attempting a quick connection (no /rpc path)
  const ws = new WebSocket(gatewayConfig.wsUrl || `ws://127.0.0.1:${gatewayConfig.port}`, {
    headers: {
      'Origin': gatewayConfig.httpUrl || `http://localhost:${gatewayConfig.port}`
    }
  })
  const timeout = setTimeout(() => {
    ws.close()
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: false
    })
  }, 2000)

  ws.on('open', () => {
    clearTimeout(timeout)
    ws.close()
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: true
    })
  })

  ws.on('error', () => {
    clearTimeout(timeout)
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: false
    })
  })
})

router.post('/:id/chat/readiness', (req, res) => {
  const { id } = req.params
  const { byok } = req.body as {
    byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string }
  }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const readiness = evaluateChatExecutionReadiness(id, byok)
  if (!readiness.available) {
    return res.status(200).json(readiness)
  }
  return res.json(readiness)
})

/**
 * POST /api/agents/:id/chat
 * SSE proxy that spawns `openclaw agent` CLI to handle chat.
 * The CLI handles gateway auth, device identity, and agent routing.
 */
router.post('/:id/chat', (req, res) => {
  const { id } = req.params
  const { message, sessionId, byok } = req.body as {
    message?: string
    sessionId?: string
    byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
  }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  // Check workspace budget
  const budgetBlock = checkBudgetBlock({ operation: 'agent' })
  if (budgetBlock) {
    return res.status(402).json({ error: budgetBlock })
  }

  const session = getAuthenticatedSession(req)
  const readiness = evaluateChatExecutionReadiness(id, byok)
  if (!readiness.available) {
    return res.status(400).json({ error: readiness.error })
  }
  const resolvedAgent = readiness.resolvedAgent
  const useOpenAiCompatible = resolvedAgent.provider === 'openai-compatible'
  const integrationConfig = readWorkspaceIntegrationConfig()
  const effectiveWorkspaceRoot = deriveWorkspaceRootFromAgentWorkspace(resolvedAgent.workspace) || getWorkspacePath()
  const executionEnv = userExecutionEnv({
    openai: useOpenAiCompatible ? undefined : byok?.openai,
    anthropic: byok?.anthropic,
    gemini: byok?.gemini,
    ollamaBaseUrl: byok?.ollamaBaseUrl || integrationConfig.ollamaBaseUrl,
    openaiCompatibleApiKey: useOpenAiCompatible ? byok?.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? (byok?.openaiCompatibleBaseUrl || integrationConfig.openaiCompatibleBaseUrl) : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  })
  executionEnv.OPENCLAW_WORKSPACE = effectiveWorkspaceRoot
  const effectiveSessionId = scopeSessionIdToModel(
    sessionId || buildDashboardChatSeed(id, resolvedAgent.workspace),
    resolvedAgent.model
  )

  console.log(`[Chat Route] Starting CLI chat for agent ${id}`)

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  res.flushHeaders()

  const send = (type: string, data: any) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
    }
  }

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)
  const chatStartedAt = Date.now()
  const dashboardSessionKey = `agent:${id}:dashboard-chat`

  // Use plain-text mode so stdout can stream deltas to the UI in real time.
  // History/persistence is handled by the explicit session id and the CLI itself.
  const useLocal = resolvedAgent.provider === 'ollama' || !isGatewayRunning().running
  const args = [
    'agent',
    '--agent', id,
    '--session-id', effectiveSessionId,
    '--message', message,
    ...(useLocal ? ['--local'] : []),
  ]
  console.log(`[Chat Route] Spawning: openclaw ${args.join(' ')}`)

  let procExited = false
  let proc: ReturnType<typeof spawn> | null = null
  let fullOutput = ''
  let stderrOutput = ''

  runExclusiveAgentExecution(id, () => withTemporaryAgentAuthProfiles(id, {
    openai: executionEnv.OPENAI_API_KEY,
    anthropic: executionEnv.ANTHROPIC_API_KEY,
    gemini: executionEnv.GEMINI_API_KEY,
    ollamaBaseUrl: executionEnv.OLLAMA_BASE_URL,
    openaiCompatibleApiKey: useOpenAiCompatible ? executionEnv.OPENAI_API_KEY : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? executionEnv.OPENAI_BASE_URL : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  }, resolvedAgent.model, resolvedAgent.provider, async () => {
    await new Promise<void>((resolve) => {
      const spawned = spawn('openclaw', args, {
        env: executionEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      proc = spawned

      send('start', { sessionId: effectiveSessionId })
      invalidateAgentStatusCache(id)

      spawned.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullOutput += text
        send('delta', { text })
      })

      spawned.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString()
      })

      spawned.on('exit', () => { procExited = true })

      spawned.on('close', (code) => {
        console.log(`[Chat Route] CLI exited for agent ${id} with code ${code}`)
        clearInterval(keepalive)

        if (stderrOutput) {
          console.error(`[Chat Route] stderr for ${id}:`, stderrOutput.slice(0, 500))
        }

        const normalizedText = normalizeChatMessage(fullOutput.trim())

        if (normalizedText) {
          const usage = readLatestAssistantUsageFromPersistedSession(
            id,
            dashboardSessionKey,
            effectiveSessionId
          )
          traceAgentChat(id, message, normalizedText, {
            model: usage?.model || resolvedAgent.model,
            provider: usage?.provider || resolvedAgent.provider || undefined,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            cacheReadTokens: usage?.cacheReadTokens,
            durationMs: Math.max(0, Date.now() - chatStartedAt),
            estimatedCostUsd: usage?.estimatedCostUsd,
            sessionId: usage?.sessionId || effectiveSessionId,
            actorUserId: session?.userId,
            actorLogin: session?.login,
            actorEmail: session?.email,
            dashboardInstanceId: getRequestDashboardInstanceId(req),
          })
        }

        persistDashboardChatSession(id, effectiveSessionId)

        if (!normalizedText) {
          send('error', deriveChatError(stderrOutput.slice(0, 300) || (code !== 0 ? 'Agent failed.' : 'No reply from agent.')))
        }
        send('complete', { text: normalizedText || '' })
        if (!res.writableEnded) {
          res.end()
        }
        resolve()
      })

      spawned.on('error', (err) => {
        console.error(`[Chat Route] CLI spawn error for ${id}:`, err)
        clearInterval(keepalive)
        send('error', `Failed to start agent: ${err.message}`)
        if (!res.writableEnded) {
          res.end()
        }
        resolve()
      })
    })
  })).catch((err) => {
    console.error(`[Chat Route] Auth profile prep error for ${id}:`, err)
    clearInterval(keepalive)
    send('error', `Failed to prepare agent execution: ${err.message}`)
    if (!res.writableEnded) {
      res.end()
    }
  })

  const timeout = setTimeout(() => {
    clearInterval(keepalive)
    proc?.kill()
    send('error', 'Agent timeout (3 minutes)')
    if (!res.writableEnded) {
      res.end()
    }
  }, 180000) // 3 minutes to handle cold starts

  // Handle client disconnect — only kill if process hasn't exited yet
  req.on('close', () => {
    console.log(`[Chat Route] Client disconnected for agent ${id}, procExited=${procExited}`)
    clearTimeout(timeout)
    clearInterval(keepalive)
    // Don't kill process immediately — let it finish if it's close to done
    // Only kill after a grace period
    if (!procExited) {
      setTimeout(() => {
        if (!procExited) {
          console.log(`[Chat Route] Killing agent process for ${id} after grace period`)
          proc?.kill()
        }
      }, 30000) // 30s grace period
    }
  })
})

export default router
